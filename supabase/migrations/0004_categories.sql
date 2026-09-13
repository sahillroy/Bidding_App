-- ===========================================================================
-- 0004 · categories
--
-- A small, admin-curated tree. Sellers pick from it; they cannot create
-- categories, because a free-text category field would make the prohibited
-- goods checklist unenforceable.
-- ===========================================================================

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null,
  parent_id uuid references public.categories (id) on delete restrict,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),

  -- One level of nesting is all the UI supports. A category cannot be its own
  -- parent; deeper trees are prevented by the trigger below.
  constraint category_is_not_its_own_parent check (id <> parent_id)
);

comment on table public.categories is
  'Admin-curated category tree, at most two levels deep. Sellers select from '
  'this list and cannot add to it.';

create index categories_parent_id_idx on public.categories (parent_id);

-- Enforce a maximum depth of two. A CHECK constraint cannot query another row,
-- so this needs a trigger.
create or replace function public.enforce_category_depth()
returns trigger
language plpgsql
as $$
declare
  v_grandparent uuid;
begin
  if new.parent_id is null then
    return new;
  end if;

  select parent_id into v_grandparent
    from public.categories
   where id = new.parent_id;

  if v_grandparent is not null then
    raise exception 'CATEGORY_TOO_DEEP: categories nest at most two levels';
  end if;

  return new;
end;
$$;

create trigger categories_enforce_depth
  before insert or update on public.categories
  for each row execute function public.enforce_category_depth();


-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- The category list is public: anonymous visitors browse by category, so this
-- is one of the few tables anon may read. Writes are admin-only.
-- ---------------------------------------------------------------------------
alter table public.categories enable row level security;
alter table public.categories force row level security;

create policy "anyone reads categories"
  on public.categories for select
  to anon, authenticated
  using (true);

create policy "admins manage categories"
  on public.categories for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

revoke all on public.categories from anon, authenticated;
grant select on public.categories to anon, authenticated;
grant insert, update, delete on public.categories to authenticated;
