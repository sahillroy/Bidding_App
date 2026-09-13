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
