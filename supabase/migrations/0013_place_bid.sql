-- ===========================================================================
-- 0013 · place_bid — the bidding engine (Phase 4)
--
-- THE SINGLE MOST IMPORTANT CORRECTNESS DECISION IN THE PROJECT.
--
-- Two bidders offering the same amount three milliseconds apart must not both
-- win. Without a lock the sequence is:
--
--     tx A: read current_price = 24000
--     tx B: read current_price = 24000        <- same stale value
--     tx A: 24500 >= 24000 + 250, accept, write
--     tx B: 24500 >= 24000 + 250, accept, write
--
-- Two winners, and `bids` — the dispute record — says so. There is no way to
-- resolve that afterwards, because both rows are legitimately in the table.
--
-- `select ... for update` makes the second transaction BLOCK at the read until
-- the first commits, then re-read the now-updated price and correctly reject.
-- The lock is not an optimisation; it is the thing that makes an auction an
-- auction. tests/concurrency/simultaneous-bids.test.ts fires 50 of these at
-- once and asserts exactly one gets through.
--
-- SECURITY DEFINER, and why:
--   `authenticated` has SELECT on bids and nothing else — INSERT, UPDATE and
--   DELETE are revoked, and a trigger blocks the last two outright. So the
--   only way a bid can be written is through this function, which runs as its
--   owner. That is the whole point: every bid passes through one place where
--   every rule is checked, inside one transaction, under one lock.
--
--   search_path is pinned. Without it, anyone able to create objects in a
--   schema resolving earlier could shadow `listings` or `bids` and have this
--   function operate on their table with the owner's privileges. The version
--   in plan §6.3 omits this. See docs/SECURITY_NOTES.md D-1.
-- ===========================================================================

create or replace function public.place_bid(
  p_listing_id uuid,
  p_amount     bigint
)
returns public.bids
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_listing public.listings%rowtype;
  v_bidder  uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_min     bigint;
  v_bid     public.bids%rowtype;
begin
  if v_bidder is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  -- Cheap, caller-supplied checks first, before taking a lock that would make
  -- every other bidder on this listing queue behind us.
  if p_amount is null or p_amount <= 0 then
    raise exception 'BID_INVALID';
  end if;

  -- The same ceiling the bids and listings CHECK constraints use. A bid above
  -- it is a typo or an attack, never a bid.
  if p_amount > 100000000000 then
    raise exception 'BID_ABOVE_CEILING';
  end if;

  select * into v_profile from public.profiles where id = v_bidder;

  if not found then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  -- Bidding requires a completed identity check. The check is real from the
  -- moment the engine exists rather than being added later: a validation rule
  -- that ships disabled has a habit of staying disabled. Phase 6 builds the UI
  -- that sets this flag; the seed marks a few demo accounts verified so the
  -- path is exercisable today.
  if v_profile.kyc_status <> 'verified' then
    raise exception 'KYC_REQUIRED';
  end if;

  -- Suspended and banned users keep their session and may keep browsing.
  -- They may not act.
  if v_profile.account_status <> 'active' then
    raise exception 'ACCOUNT_NOT_ACTIVE';
  end if;

  -- ---- THE LOCK. Everything below this line is serialised per listing. ----
  select * into v_listing
    from public.listings
   where id = p_listing_id
     for update;

  if not found then
    raise exception 'LISTING_NOT_FOUND';
  end if;

  if v_listing.status <> 'live' then
    raise exception 'AUCTION_NOT_LIVE';
  end if;

  -- The DATABASE clock decides, never the caller's. A browser with a wrong
  -- clock, or one deliberately set back, cannot place a late bid: this is
  -- re-evaluated here no matter what the page believed when it rendered.
  if v_listing.ends_at is null or now() >= v_listing.ends_at then
    raise exception 'AUCTION_ENDED';
  end if;

  if v_listing.seller_id = v_bidder then
    raise exception 'SELLER_CANNOT_BID';
  end if;

  -- current_price is NULL until the first bid, which is what makes this
  -- correct: an opening bid may EQUAL the starting price, and only subsequent
  -- bids must clear the increment. Seeding current_price to starting_price
  -- would make coalesce never fall through and wrongly force the first bid up
  -- by one increment — the bug in plan §6.3.
  --
  -- bid_increment is the value STORED on the listing at creation time, not one
  -- recomputed from the current price, so changing the band table can never
  -- alter the rules of an auction already running.
  v_min := coalesce(
    v_listing.current_price + v_listing.bid_increment,
    v_listing.starting_price
  );

  if p_amount < v_min then
    -- The minimum travels with the error so the interface can say what would
    -- have been accepted instead of a bare rejection.
    raise exception 'BID_TOO_LOW:%', v_min;
  end if;

  insert into public.bids (listing_id, bidder_id, amount)
  values (p_listing_id, v_bidder, p_amount)
  returning * into v_bid;

  update public.listings
     set current_price     = p_amount,
         highest_bidder_id = v_bidder,
         bid_count         = bid_count + 1,
         updated_at        = now()
   where id = p_listing_id;

  insert into public.auction_events (listing_id, event_type, actor_id, payload)
  values (
    p_listing_id,
    'bid_placed',
    v_bidder,
    -- The amount and the bid id, never a handle or anything identifying.
    jsonb_build_object('amount', p_amount, 'bid_id', v_bid.id)
  );

  return v_bid;
end;
$$;

comment on function public.place_bid(uuid, bigint) is
  'The only way a bid is ever written. Takes a FOR UPDATE lock on the listing '
  'so concurrent bids serialise. SECURITY DEFINER with pinned search_path. '
  'Validates status, the database clock, KYC, account status, self-bidding and '
  'the stored increment. See tests/concurrency/simultaneous-bids.test.ts.';

revoke execute on function public.place_bid(uuid, bigint) from public;
grant  execute on function public.place_bid(uuid, bigint) to authenticated;


-- ---------------------------------------------------------------------------
-- Realtime
--
-- Publish `listings`, not `bids`.
--
-- Realtime's Postgres Changes delivers WHOLE ROWS. A bids row carries
-- bidder_id, and a uuid is a stable identifier — anyone collecting them could
-- correlate a bidder across every auction they have ever entered, which is
-- precisely what the anonymity model exists to prevent. RLS does filter which
-- rows a subscriber receives, but the safest payload is the one that never
-- contains the identifier at all.
--
-- The listing row carries exactly what every viewer needs — current_price,
-- bid_count, updated_at — and the public read policy already allows anyone to
-- see a live listing, so no new policy is required.
--
-- Note highest_bidder_id IS on this row. Subscribers receive it, which is why
-- the client must never render it: the page shows handles from public_bids.
-- Phase 8 should consider a dedicated broadcast payload to drop it entirely.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'listings'
  ) then
    alter publication supabase_realtime add table public.listings;
  end if;
end $$;

-- REPLICA IDENTITY FULL so an UPDATE payload includes the previous values.
-- Without it Postgres only sends the primary key for unchanged columns, and a
-- subscriber cannot tell a price change from any other update to the row.
alter table public.listings replica identity full;
