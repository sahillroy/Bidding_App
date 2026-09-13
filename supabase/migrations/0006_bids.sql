-- ===========================================================================
-- 0006 · bids — APPEND ONLY
--
-- This table is the dispute-resolution record. If two people claim they won an
-- auction, this is the evidence. That only works if it is immutable.
--
-- Three separate mechanisms enforce that, because one is not enough:
--
--   1. No UPDATE or DELETE policy exists (RLS denies by default).
--   2. UPDATE and DELETE privileges are revoked from every application role.
--   3. A trigger raises on UPDATE or DELETE regardless of who attempts it,
--      which catches the service-role key — the key that bypasses RLS
--      entirely, and the one an application bug is most likely to hold.
--
-- Mechanism 3 is the one that matters. Our own server code holds the service
-- role key, so RLS would not stop a buggy migration or a careless cleanup
-- script. The trigger does.
--
-- Direct INSERT is also revoked. All bids go through place_bid (Phase 4),
-- which takes a row lock so that two simultaneous bids cannot both win.
-- ===========================================================================

create table public.bids (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete restrict,
  bidder_id uuid not null references public.profiles (id) on delete restrict,

  -- bigint paise, always.
  amount bigint not null
    check (amount > 0 and amount <= 100000000000),

  -- Phase 8 proxy bidding. Present now so that adding it later does not require
  -- altering an append-only table.
  max_amount bigint
    check (max_amount is null or max_amount >= amount),

  created_at timestamptz not null default now()
);

comment on table public.bids is
  'APPEND ONLY. The dispute record. UPDATE and DELETE are revoked and blocked '
  'by trigger, including for the service role. All writes go through place_bid.';

-- on delete restrict above, not cascade: deleting a listing or a profile must
-- not be able to erase bid history. Accounts are banned, not deleted.

create index bids_listing_id_amount_idx
  on public.bids (listing_id, amount desc, created_at asc);
create index bids_bidder_id_idx on public.bids (bidder_id, created_at desc);


-- ---------------------------------------------------------------------------
-- Immutability trigger
--
-- Belt and braces over the revoked privileges below. This fires for every role,
-- including postgres and the Supabase service role.
-- ---------------------------------------------------------------------------
create or replace function public.reject_bid_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'BIDS_ARE_APPEND_ONLY: % on bids is not permitted. This table is the '
    'dispute-resolution record. If you are trying to correct a bid, write a '
    'compensating auction_events row instead.', tg_op;
end;
$$;

create trigger bids_block_update
  before update on public.bids
  for each row execute function public.reject_bid_mutation();

create trigger bids_block_delete
  before delete on public.bids
  for each row execute function public.reject_bid_mutation();

-- Truncate bypasses row-level triggers, so it needs its own statement-level one.
create trigger bids_block_truncate
  before truncate on public.bids
  for each statement execute function public.reject_bid_mutation();


-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- Bidders see their own bids in full. Nobody sees another bidder's identity
-- through this table — the public view below is the only public path, and it
-- exposes a handle, never a user id.
-- ---------------------------------------------------------------------------
alter table public.bids enable row level security;
alter table public.bids force row level security;

create policy "bidders read their own bids"
  on public.bids for select
  to authenticated
  using (bidder_id = (select auth.uid()));

create policy "sellers read bids on their own listings"
  on public.bids for select
  to authenticated
  using (
    exists (
      select 1 from public.listings l
       where l.id = listing_id
         and l.seller_id = (select auth.uid())
    )
  );

create policy "admins read every bid"
  on public.bids for select
  to authenticated
  using (public.is_admin());

-- There is deliberately no INSERT, UPDATE or DELETE policy. Writes happen only
-- inside place_bid, which is SECURITY DEFINER and therefore not subject to
-- these policies.

revoke all on public.bids from anon, authenticated;
grant select on public.bids to authenticated;

-- Stated explicitly rather than relying on "revoke all", so that the intent
-- survives someone later granting privileges back in bulk.
revoke insert, update, delete on public.bids from anon, authenticated;


-- ---------------------------------------------------------------------------
-- public_bids — the bid history shown on a listing page
--
-- Phase 4 requires bid history "showing handles only", while the data model
-- requires that bidder_id never reach the public. Both hold here: the view
-- joins through to the handle and does not select the uuid.
--
-- Exposing bidder_id would defeat the anonymity model even though a uuid looks
-- opaque — it is a stable identifier, so anyone could correlate a bidder across
-- every auction they have ever entered.
--
-- DO NOT ADD bidder_id TO THIS VIEW.
-- ---------------------------------------------------------------------------
create view public.public_bids
  with (security_invoker = off)
  as select
       b.id,
       b.listing_id,
       p.handle as bidder_handle,
       b.amount,
       b.created_at
     from public.bids b
     join public.profiles p on p.id = b.bidder_id
     join public.listings l on l.id = b.listing_id
    where l.status in ('live', 'ended', 'settling', 'sold', 'unsold');

comment on view public.public_bids is
  'Public bid history: handle, amount, timestamp. Never bidder_id — a uuid is '
  'a stable identifier and would allow correlating a bidder across auctions.';

grant select on public.public_bids to anon, authenticated;
