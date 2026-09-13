-- ===========================================================================
-- 0008 · orders, payment_intents, strikes
--
-- Created when an auction ends with a winner. The 24-hour payment deadline,
-- the runner-up fallback, and the strike system all hang off these tables.
--
-- payment_intents records SIMULATED payments only. No real money moves through
-- this system — holding user funds requires an RBI Payment Aggregator licence
-- (Rs 15 crore net worth at application, rising to Rs 25 crore). The `simulated`
-- column is a constant true, enforced by a CHECK, so that a future provider
-- integration has to consciously remove the constraint rather than drift into
-- handling real money. See docs/COMPLIANCE.md §3.
-- ===========================================================================

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete restrict,
  buyer_id uuid not null references public.profiles (id) on delete restrict,
  seller_id uuid not null references public.profiles (id) on delete restrict,

  -- bigint paise. The winning bid amount, snapshotted.
  amount bigint not null check (amount > 0),

  -- 1 = the highest bidder, 2 = the runner-up, 3 = the next one down.
  -- Capped at 3: after three defaults the item is marked unsold rather than
  -- walking the bid list forever.
  attempt_number integer not null default 1
    check (attempt_number between 1 and 3),

  payment_deadline timestamptz not null,

  status text not null default 'awaiting_payment'
    check (status in (
      'awaiting_payment',
      'paid',
      'defaulted',
      'awaiting_seller_decision',
      'seller_declined',
      'cancelled'
    )),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Anonymity is structural: a buyer and a seller are different people, and
  -- nothing in this table carries a name, address or contact detail.
  constraint buyer_is_not_seller check (buyer_id <> seller_id)
);

comment on table public.orders is
  'Created when an auction ends with a winner. 24-hour payment deadline. '
  'attempt_number walks down the bid list on default, capped at 3.';

create index orders_buyer_id_idx on public.orders (buyer_id, created_at desc);
create index orders_seller_id_idx on public.orders (seller_id, created_at desc);
create index orders_listing_id_idx on public.orders (listing_id, attempt_number);

-- The Phase 5 deadline sweep looks for exactly this.
create index orders_deadline_idx on public.orders (payment_deadline)
  where status = 'awaiting_payment';

-- One live attempt per listing at a time. Two open orders on one item would
-- mean two people could both pay for it.
create unique index orders_one_open_per_listing
  on public.orders (listing_id)
  where status in ('awaiting_payment', 'awaiting_seller_decision');

create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------------
-- payment_intents — simulated, always
-- ---------------------------------------------------------------------------
create table public.payment_intents (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete restrict,

  provider text not null default 'mock'
    check (provider in ('mock', 'razorpay_test')),

  provider_ref text,

  status text not null default 'created'
    check (status in ('created', 'processing', 'succeeded', 'failed', 'cancelled')),

  -- Always true. The CHECK is the point: a future integration cannot start
  -- recording real payments without deliberately altering this constraint,
  -- which is a conversation, not an accident.
  simulated boolean not null default true
    check (simulated = true),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.payment_intents is
  'SIMULATED payments only. simulated is CHECK-constrained to true. Real fund '
  'handling requires an RBI Payment Aggregator licence — see docs/COMPLIANCE.md.';

comment on column public.payment_intents.provider is
  'mock, or razorpay_test. Razorpay TEST MODE never settles real money. A live '
  'production key must never appear in this project; CI fails the build on one.';

create index payment_intents_order_id_idx on public.payment_intents (order_id);

create trigger payment_intents_set_updated_at
  before update on public.payment_intents
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------------
-- strikes
--
-- One default suspends the account. Two is a permanent ban. Each strike names
-- the order that caused it, so a suspension is always explainable.
-- ---------------------------------------------------------------------------
create table public.strikes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete restrict,
  order_id uuid references public.orders (id) on delete set null,
  reason text not null
    check (reason in ('payment_default', 'pii_circumvention', 'admin_manual')),
  note text,
  created_at timestamptz not null default now()
);

comment on table public.strikes is
  'One strike suspends, two bans. order_id records what triggered it so a '
  'suspension can always be justified to the user.';

create index strikes_user_id_idx on public.strikes (user_id, created_at desc);

-- A strike is a permanent record; it cannot be quietly rescinded.
create trigger strikes_block_update
  before update on public.strikes
  for each row execute function public.reject_bid_mutation();

create trigger strikes_block_delete
  before delete on public.strikes
  for each row execute function public.reject_bid_mutation();


-- ---------------------------------------------------------------------------
-- Row Level Security — participants and admins only
--
-- Orders are never public. An order reveals that a specific handle bought a
-- specific item, which is exactly what the anonymity model protects.
-- ---------------------------------------------------------------------------
alter table public.orders enable row level security;
alter table public.orders force row level security;

create policy "participants read their own orders"
  on public.orders for select
  to authenticated
  using (
    buyer_id = (select auth.uid())
    or seller_id = (select auth.uid())
  );

create policy "admins read every order"
  on public.orders for select
  to authenticated
  using (public.is_admin());

-- Sellers accept or decline a runner-up offer; that is the only user-driven
-- order transition. Everything else is done by settlement functions.
create policy "sellers respond to runner-up offers"
  on public.orders for update
  to authenticated
  using (
    seller_id = (select auth.uid())
    and status = 'awaiting_seller_decision'
  )
  with check (
    seller_id = (select auth.uid())
    and status in ('seller_declined', 'awaiting_payment')
  );

create policy "admins update any order"
  on public.orders for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

revoke all on public.orders from anon, authenticated;
grant select on public.orders to authenticated;
grant update (status) on public.orders to authenticated;
-- No INSERT: orders are created only by the settlement function in Phase 5.


alter table public.payment_intents enable row level security;
alter table public.payment_intents force row level security;

create policy "buyers read their own payment intents"
  on public.payment_intents for select
  to authenticated
  using (
    exists (
      select 1 from public.orders o
       where o.id = order_id
         and o.buyer_id = (select auth.uid())
    )
  );

create policy "admins read every payment intent"
  on public.payment_intents for select
  to authenticated
  using (public.is_admin());

revoke all on public.payment_intents from anon, authenticated;
grant select on public.payment_intents to authenticated;
-- Writes happen server-side through the PaymentProvider interface in Phase 6.


alter table public.strikes enable row level security;
alter table public.strikes force row level security;

-- A user can see why they were suspended. Being punished without being told
-- why is both bad product design and, under a consumer-protection lens, hard
-- to defend.
create policy "users read their own strikes"
  on public.strikes for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "admins read every strike"
  on public.strikes for select
  to authenticated
  using (public.is_admin());

revoke all on public.strikes from anon, authenticated;
grant select on public.strikes to authenticated;
revoke insert, update, delete on public.strikes from anon, authenticated;
