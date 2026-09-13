-- ===========================================================================
-- 0001 · Shared helpers
--
-- Functions every later migration depends on. Nothing here creates a table.
-- ===========================================================================

-- gen_random_bytes, used for handle generation.
create extension if not exists pgcrypto with schema extensions;


-- ---------------------------------------------------------------------------
-- updated_at maintenance
--
-- Application code must never be trusted to set updated_at. A trigger is the
-- only way to be sure the column means what it says.
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'BEFORE UPDATE trigger. Stamps updated_at with the database clock.';


-- ---------------------------------------------------------------------------
-- public.is_admin()
--
-- Used by the admin RLS policy on nearly every table.
--
-- WHY THIS IS A FUNCTION AND NOT AN INLINE SUBQUERY
--
-- The obvious way to write an admin policy is:
--
--     create policy "admins read all" on profiles for select
--       using (exists (select 1 from profiles where id = auth.uid()
--                                              and role = 'admin'));
--
-- That is infinitely recursive. Evaluating the policy on `profiles` requires
-- reading `profiles`, which evaluates the policy again. Postgres detects this
-- and errors with "infinite recursion detected in policy for relation". It is
-- the single most common mistake in Supabase RLS.
--
-- A SECURITY DEFINER function breaks the loop: it runs as its owner, which
-- bypasses RLS on the tables it reads, so no policy is re-evaluated.
--
-- WHY search_path IS PINNED
--
-- A SECURITY DEFINER function executes with the privileges of its owner. If the
-- search_path were left to the caller, anyone able to create objects in a schema
-- that resolves earlier could define their own `profiles` table and have this
-- function read it — with owner privileges. Pinning search_path closes that.
-- pg_temp goes last, never first, because a caller can always create objects in
-- their own temporary schema.
--
-- Every SECURITY DEFINER function in this project must pin its search_path.
-- See docs/SECURITY_NOTES.md D-1.
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.profiles
     where id = auth.uid()
       and role = 'admin'
  );
$$;

comment on function public.is_admin() is
  'True when the current session belongs to an admin. SECURITY DEFINER to avoid '
  'RLS recursion; search_path pinned to prevent privilege escalation.';

revoke execute on function public.is_admin() from public;
grant  execute on function public.is_admin() to authenticated, anon;


-- ---------------------------------------------------------------------------
-- public.is_active_user()
--
-- Suspended and banned users keep their session and may keep browsing. They may
-- not act. Checking this in one place means a later policy cannot forget it.
-- ---------------------------------------------------------------------------
create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.profiles
     where id = auth.uid()
       and account_status = 'active'
  );
$$;

comment on function public.is_active_user() is
  'True when the current session belongs to an active (not suspended or banned) user.';

revoke execute on function public.is_active_user() from public;
grant  execute on function public.is_active_user() to authenticated;
