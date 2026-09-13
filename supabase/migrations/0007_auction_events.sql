-- ===========================================================================
-- 0007 · auction_events
--
-- Every state transition writes a row here. This is the audit trail: when an
-- auction behaved strangely, this table is how you reconstruct what happened
-- and in what order.
--
-- It is append-only for the same reason bids is, though slightly less strictly:
-- an audit log that can be edited is not an audit log.
-- ===========================================================================

create table public.auction_events (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete restrict,

  event_type text not null
    check (event_type in (
      'created',
      'submitted_for_review',
      'approved',
      'rejected',
      'went_live',
      'bid_placed',
      'auction_closed',
      'order_created',
      'payment_received',
      'payment_defaulted',
      'runner_up_offered',
      'seller_accepted_runner_up',
      'seller_declined_runner_up',
      'extended',
      'marked_unsold',
      'cancelled'
    )),

  -- Null when the actor is the system: a QStash callback or the pg_cron sweep
  -- closing an auction has no user behind it.
  actor_id uuid references public.profiles (id) on delete set null,

  payload jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now()
);

comment on table public.auction_events is
  'Append-only audit trail. Every listing state transition writes a row. '
  'actor_id is null for system actions (QStash callback, pg_cron sweep).';

create index auction_events_listing_id_idx
  on public.auction_events (listing_id, created_at);
create index auction_events_type_idx
  on public.auction_events (event_type, created_at desc);

create trigger auction_events_block_update
  before update on public.auction_events
  for each row execute function public.reject_bid_mutation();

create trigger auction_events_block_delete
  before delete on public.auction_events
  for each row execute function public.reject_bid_mutation();


alter table public.auction_events enable row level security;
alter table public.auction_events force row level security;

-- Sellers can audit their own auctions. Note the payload may carry amounts but
-- never a bidder identity — writers must put handles in the payload, not uuids.
create policy "sellers read events on their own listings"
  on public.auction_events for select
  to authenticated
  using (
    exists (
      select 1 from public.listings l
       where l.id = listing_id
         and l.seller_id = (select auth.uid())
    )
  );

create policy "admins read every event"
  on public.auction_events for select
  to authenticated
  using (public.is_admin());

-- No INSERT policy: events are written by SECURITY DEFINER functions only.

revoke all on public.auction_events from anon, authenticated;
grant select on public.auction_events to authenticated;
revoke insert, update, delete on public.auction_events from anon, authenticated;
