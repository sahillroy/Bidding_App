-- ===========================================================================
-- 0002 · profiles
--
-- One row per auth.users row, created automatically on signup.
--
-- This table carries the anonymity model. `handle` is the ONLY identifier any
-- other user ever sees. Everything else here is visible to the owner and to
-- admins and to nobody else.
--
-- There are no contact columns. No phone, no address, no social handle, no
-- website. That is not an oversight and it is not a TODO — buyer/seller
-- anonymity is enforced by the absence of the columns, so that no future query
-- can leak what was never stored. See implementationplan.md §9 and CLAUDE.md
-- hard rule 9.
-- ===========================================================================

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,

  -- The public identity. Generated, not chosen: a user-chosen handle would let
  -- people carry a recognisable identity across listings, or impersonate a
  -- seller, both of which defeat the point.
  handle text not null unique,

  -- Admin-visible only. Sourced from the OAuth profile at signup, so it is
  -- user-controlled input — never render it in a public surface, and never
  -- trust it for authorization.
  display_name text,

  role text not null default 'user'
    check (role in ('user', 'admin')),

  kyc_status text not null default 'none'
    check (kyc_status in ('none', 'pending', 'verified', 'rejected')),

  account_status text not null default 'active'
    check (account_status in ('active', 'suspended', 'banned')),

  strike_count integer not null default 0
    check (strike_count >= 0),

  -- Set when account_status becomes 'suspended'. Null for a permanent ban,
  -- because a ban does not expire.
  suspended_until timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A suspension without an end date is indistinguishable from a ban, and a
  -- ban with an end date is not a ban. Encode the rule rather than trusting
  -- application code to maintain it.
  constraint suspension_has_an_end check (
    (account_status = 'suspended' and suspended_until is not null)
    or (account_status <> 'suspended' and suspended_until is null)
  )
);

comment on table public.profiles is
  'One row per auth user. `handle` is the only field other users may see. '
  'No contact information columns exist here, deliberately.';

comment on column public.profiles.display_name is
  'Admin-visible only. User-controlled input from the OAuth provider.';

create index profiles_role_idx on public.profiles (role) where role = 'admin';
create index profiles_account_status_idx on public.profiles (account_status)
  where account_status <> 'active';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------------
-- Handle generation
--
-- Format: bidder_ + 6 hex characters, e.g. bidder_7f2a1c.
--
-- The plan's example uses 4 hex characters (65,536 possibilities). By the
-- birthday bound that gives a ~50% chance of at least one collision at roughly
-- 300 users, which is a realistic demo size. 6 hex characters gives 16.7
-- million, moving the same 50% point past 4,800 users. The loop below handles
-- a collision regardless; the wider space just stops it mattering.
--
-- gen_random_bytes is cryptographically random, not sequential, so a handle
-- leaks no information about signup order or user count.
-- ---------------------------------------------------------------------------
create or replace function public.generate_handle()
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_handle   text;
  v_attempts integer := 0;
begin
  loop
    v_handle := 'bidder_' || encode(extensions.gen_random_bytes(3), 'hex');
    exit when not exists (
      select 1 from public.profiles where handle = v_handle
    );

    v_attempts := v_attempts + 1;
    if v_attempts >= 10 then
      -- Ten consecutive collisions against a 16.7M space means something is
      -- badly wrong. Fail loudly rather than loop forever inside a signup.
      raise exception 'HANDLE_GENERATION_FAILED after % attempts', v_attempts;
    end if;
  end loop;

  return v_handle;
end;
$$;

revoke execute on function public.generate_handle() from public;


-- ---------------------------------------------------------------------------
-- Profile creation on signup
--
-- Runs as a trigger on auth.users rather than from application code, because
-- application code can be bypassed: a user signing up through the Supabase
-- client, an OAuth callback, or the admin API must all end up with a profile.
-- A user without a profile row would be invisible to every RLS policy here and
-- would break in ways that are hard to diagnose.
--
-- If this function raises, the signup transaction rolls back and no auth user
-- is created. That is the correct failure mode: a half-created account is worse
-- than a failed signup.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, handle, display_name)
  values (
    new.id,
    public.generate_handle(),
    -- Both keys appear depending on the provider. Email/password signups have
    -- neither, and null is fine — display_name is optional.
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name'
    )
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- RLS is enabled on every table in this project without exception. If a query
-- fails, the policy is wrong; the fix is never to disable RLS.
--
-- Note that enabling RLS denies everything by default. Each policy below opens
-- exactly one hole, deliberately.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;

-- Even the table owner is subject to these policies. Without this, a query run
-- as the owner silently bypasses every policy, which makes testing meaningless.
alter table public.profiles force row level security;

create policy "users read their own profile"
  on public.profiles for select
  to authenticated
  using (id = (select auth.uid()));

create policy "admins read every profile"
  on public.profiles for select
  to authenticated
  using (public.is_admin());

create policy "users update their own profile"
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "admins update any profile"
  on public.profiles for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- There is deliberately no INSERT policy and no DELETE policy.
--
-- INSERT: rows are created only by the on_auth_user_created trigger. A user who
-- could insert here could create a profile for an id that is not theirs.
--
-- DELETE: profiles are referenced by bids, which are an append-only dispute
-- record. Deleting a profile would orphan or cascade that history. Account
-- removal is account_status = 'banned', not a delete.


-- ---------------------------------------------------------------------------
-- Column-level grants — the part that is easy to get wrong
--
-- The UPDATE policy above says a user may update their own row. On its own,
-- that is a privilege escalation hole: RLS controls WHICH ROWS are visible,
-- not WHICH COLUMNS may be written. With only the policy in place, any user
-- could run
--
--     update profiles set role = 'admin' where id = auth.uid();
--
-- and the policy would allow it, because the row is theirs.
--
-- Column grants are what actually restrict this. `display_name` is the only
-- column a user may write. role, kyc_status, account_status, strike_count and
-- suspended_until are changed by admin action or by server-side functions, and
-- the authenticated role has no UPDATE privilege on them at all.
-- ---------------------------------------------------------------------------
revoke all on public.profiles from anon, authenticated;

grant select (id, handle, display_name, role, kyc_status,
              account_status, strike_count, suspended_until,
              created_at, updated_at)
  on public.profiles to authenticated;

grant update (display_name) on public.profiles to authenticated;

-- anon gets nothing on this table. Anonymous visitors read public_profiles.


-- ---------------------------------------------------------------------------
-- public_profiles — the only profile data anyone else ever sees
--
-- Public pages select from this view, never from profiles directly. The point
-- is that a forgotten column in a select list cannot leak a display name,
-- because the view does not have one.
--
-- security_invoker = off means the view runs with its owner's privileges and
-- so is not blocked by the profiles RLS policies above. That is intentional and
-- is why the column list is the entire security boundary here.
--
-- DO NOT ADD COLUMNS TO THIS VIEW. Adding one is a data leak, not a feature.
-- ---------------------------------------------------------------------------
create view public.public_profiles
  with (security_invoker = off)
  as select id, handle, created_at
       from public.profiles;

comment on view public.public_profiles is
  'The public projection of a profile: handle only. Runs as definer, so this '
  'column list is the security boundary. Never add columns.';

grant select on public.public_profiles to anon, authenticated;
