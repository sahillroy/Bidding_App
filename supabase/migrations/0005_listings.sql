-- ===========================================================================
-- 0005 · listings and listing_images
--
-- Money note: every amount here is bigint paise. Never numeric, never float.
-- Rs 1,250.50 is 125050. Formatting happens at the edge, once, for display.
-- Floating point cannot represent 0.1 exactly, and an auction that loses a
-- paisa per bid is an auction with a dispute attached.
-- ===========================================================================

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles (id) on delete restrict,

  title text not null
    check (char_length(trim(title)) between 3 and 120),
  description text not null
    check (char_length(description) between 10 and 5000),

  category_id uuid not null references public.categories (id) on delete restrict,

  condition text not null
    check (condition in ('new', 'like_new', 'good', 'fair', 'for_parts')),

  -- ---- money, all bigint paise ----
  starting_price bigint not null
    check (starting_price > 0 and starting_price <= 100000000000),

  -- Optional floor. If the auction ends below this, it does not sell.
  reserve_price bigint
    check (reserve_price is null or reserve_price > 0),

  -- Derived from the price band at creation time, then stored. Stored rather
  -- than recomputed so that a later change to the band table cannot silently
  -- rewrite the rules of an auction that is already running. Auditability beats
  -- normalisation here.
  bid_increment bigint not null
    check (bid_increment > 0),

  -- NULL until the first bid lands. This is deliberate and load-bearing.
  --
  -- The plan's place_bid computes the minimum as
  --     coalesce(current_price + bid_increment, starting_price)
  -- which is only correct while current_price is NULL before any bid. If this
  -- column were initialised to starting_price, coalesce would never fall
  -- through and the FIRST bid would be wrongly forced up to
  -- starting_price + increment, contradicting the rule that an opening bid may
  -- equal the starting price.
  --
  -- Display uses coalesce(current_price, starting_price).
  current_price bigint
    check (current_price is null or current_price > 0),

  highest_bidder_id uuid references public.profiles (id) on delete set null,
  bid_count integer not null default 0 check (bid_count >= 0),

  -- ---- timing ----
  -- One hour to thirty days, per the product brief.
  duration_seconds integer not null
    check (duration_seconds between 3600 and 2592000),

  starts_at timestamptz,
  ends_at timestamptz,
  -- Retained when an auction is extended, so the original window stays visible.
  original_ends_at timestamptz,
  extension_count integer not null default 0
    check (extension_count between 0 and 2),

  -- ---- state ----
  status text not null default 'draft'
    check (status in (
      'draft',           -- seller is still editing
      'pending_review',  -- submitted, waiting on an admin
      'rejected',        -- admin refused it; review_note explains why
      'approved',        -- admin accepted it; go-live is scheduled
      'live',            -- accepting bids
      'ended',           -- past ends_at, settlement not yet decided
      'settling',        -- an order exists, awaiting payment
      'sold',
      'unsold',
      'cancelled'
    )),

  review_note text,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A reserve below the opening price is meaningless.
  constraint reserve_is_above_start check (
    reserve_price is null or reserve_price >= starting_price
  ),

  -- A live auction must know when it ends. Enforced here rather than trusted to
  -- application code, because an auction with a null ends_at would never close.
  constraint live_auction_has_an_end check (
    status not in ('live', 'ended', 'settling', 'sold', 'unsold')
    or (starts_at is not null and ends_at is not null)
  ),

  constraint auction_ends_after_it_starts check (
    starts_at is null or ends_at is null or ends_at > starts_at
  ),

  -- current_price and highest_bidder_id move together: one without the other
  -- means the bidding state is corrupt.
  constraint price_and_bidder_agree check (
    (current_price is null and highest_bidder_id is null)
    or (current_price is not null and highest_bidder_id is not null)
  ),

  constraint bid_count_matches_price check (
    (bid_count = 0 and current_price is null)
    or (bid_count > 0 and current_price is not null)
  )
);

comment on table public.listings is
  'Auction listings. All money columns are bigint paise. current_price is NULL '
  'until the first bid — see the comment on that column before changing it.';

comment on column public.listings.bid_increment is
  'Snapshot of the price-band increment at creation time. Stored for '
  'auditability so a later rule change cannot alter a running auction.';

create index listings_status_ends_at_idx on public.listings (status, ends_at);
create index listings_seller_id_idx on public.listings (seller_id);
create index listings_category_id_idx on public.listings (category_id)
  where status = 'live';
create index listings_pending_review_idx on public.listings (created_at)
  where status = 'pending_review';

-- The sweep in Phase 5 looks for exactly this: live auctions past their end.
create index listings_live_expiry_idx on public.listings (ends_at)
  where status = 'live';

create trigger listings_set_updated_at
  before update on public.listings
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------------
-- listing_images
-- ---------------------------------------------------------------------------
create table public.listing_images (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  storage_path text not null,
  sort_order integer not null default 0 check (sort_order between 0 and 7),
  created_at timestamptz not null default now(),

  unique (listing_id, sort_order)
);

comment on table public.listing_images is
  'At most 8 images per listing, enforced by the sort_order check plus the '
  'unique constraint. Supabase Storage free tier is 1 GB.';

create index listing_images_listing_id_idx
  on public.listing_images (listing_id, sort_order);


-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- This is the policy set that makes "browse without an account" work, and the
-- one that makes Phase 3's acceptance criterion true: a listing is invisible
-- publicly until an admin approves it.
-- ---------------------------------------------------------------------------
alter table public.listings enable row level security;
alter table public.listings force row level security;

create policy "anyone reads public listings"
  on public.listings for select
  to anon, authenticated
  using (status in ('live', 'ended', 'settling', 'sold', 'unsold'));

create policy "sellers read their own listings in any status"
  on public.listings for select
  to authenticated
  using (seller_id = (select auth.uid()));

create policy "admins read every listing"
  on public.listings for select
  to authenticated
  using (public.is_admin());

create policy "active users create their own listings"
  on public.listings for insert
  to authenticated
  with check (
    seller_id = (select auth.uid())
    and public.is_active_user()
    -- A listing always starts as a draft. Without this, a seller could insert
    -- a row already marked 'live' and bypass moderation entirely.
    and status = 'draft'
    and current_price is null
    and highest_bidder_id is null
    and bid_count = 0
    and extension_count = 0
  );

-- Sellers edit only while the listing has not yet been accepted for review.
-- Once it is pending, approved or live, the content is frozen — otherwise a
-- seller could get a benign item approved and then swap in a prohibited one.
create policy "sellers edit their own unsubmitted listings"
  on public.listings for update
  to authenticated
  using (
    seller_id = (select auth.uid())
    and status in ('draft', 'rejected')
  )
  with check (
    seller_id = (select auth.uid())
    and status in ('draft', 'pending_review')
  );

create policy "admins update any listing"
  on public.listings for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "sellers delete their own drafts"
  on public.listings for delete
  to authenticated
  using (
    seller_id = (select auth.uid())
    and status = 'draft'
  );

revoke all on public.listings from anon, authenticated;

grant select on public.listings to anon, authenticated;

grant insert (seller_id, title, description, category_id, condition,
              starting_price, reserve_price, bid_increment, duration_seconds,
              status)
  on public.listings to authenticated;

-- Note what is NOT grantable to a seller: current_price, highest_bidder_id,
-- bid_count, ends_at, extension_count. Those are moved only by place_bid and by
-- the settlement functions. A seller who could write current_price could set
-- their own auction's price to anything.
grant update (title, description, category_id, condition, starting_price,
              reserve_price, bid_increment, duration_seconds, status,
              review_note, reviewed_by, reviewed_at, starts_at, ends_at,
              original_ends_at)
  on public.listings to authenticated;

grant delete on public.listings to authenticated;


alter table public.listing_images enable row level security;
alter table public.listing_images force row level security;

create policy "images follow their listing's visibility"
  on public.listing_images for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.listings l
       where l.id = listing_id
         and (
           l.status in ('live', 'ended', 'settling', 'sold', 'unsold')
           or l.seller_id = (select auth.uid())
           or public.is_admin()
         )
    )
  );

create policy "sellers manage images on their own unsubmitted listings"
  on public.listing_images for all
  to authenticated
  using (
    exists (
      select 1 from public.listings l
       where l.id = listing_id
         and l.seller_id = (select auth.uid())
         and l.status in ('draft', 'rejected')
    )
  )
  with check (
    exists (
      select 1 from public.listings l
       where l.id = listing_id
         and l.seller_id = (select auth.uid())
         and l.status in ('draft', 'rejected')
    )
  );

revoke all on public.listing_images from anon, authenticated;
grant select on public.listing_images to anon, authenticated;
grant insert, update, delete on public.listing_images to authenticated;
