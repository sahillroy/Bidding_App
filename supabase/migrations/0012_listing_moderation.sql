-- ===========================================================================
-- 0012 · Selling and moderation (Phase 3)
--
-- Storage bucket for listing photos, and the three SECURITY DEFINER
-- functions that move a listing through review: submit, approve, reject.
--
-- Auction events have no INSERT policy (see 0007). The only writers are
-- functions like these. That is load-bearing: a seller who could insert an
-- `approved` event could forge the audit trail of a listing that never went
-- through an admin.
--
-- Go-live is immediate on approve. Plan §8 says "approve moves to approved
-- and schedules go-live". QStash (the scheduler) is Phase 5, so this function
-- records both events — `approved`, then `went_live` — and lands the row on
-- `live` in the same transaction, with delay = 0. Phase 5 will insert the
-- delayed close message between those two events. The timestamps are always
-- written here from duration_seconds and the database clock; seller-supplied
-- starts_at / ends_at are ignored (those columns are grantable to
-- `authenticated`, which includes sellers).
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- submit_listing
--
-- Seller-only. draft | rejected → pending_review. Requires at least one
-- image: a marketplace listing with no photograph is not ready for review,
-- and the 8-image cap is already enforced by listing_images.sort_order.
-- ---------------------------------------------------------------------------
create or replace function public.submit_listing(p_listing_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_listing public.listings%rowtype;
  v_bidder  uuid := auth.uid();
  v_images  integer;
begin
  if v_bidder is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if not public.is_active_user() then
    raise exception 'ACCOUNT_NOT_ACTIVE';
  end if;

  select * into v_listing
    from public.listings
   where id = p_listing_id
   for update;

  if not found then
    raise exception 'LISTING_NOT_FOUND';
  end if;

  if v_listing.seller_id <> v_bidder then
    raise exception 'NOT_SELLER';
  end if;

  if v_listing.status not in ('draft', 'rejected') then
    raise exception 'NOT_EDITABLE';
  end if;

  select count(*) into v_images
    from public.listing_images
   where listing_id = p_listing_id;

  if v_images < 1 then
    raise exception 'LISTING_NEEDS_IMAGE';
  end if;

  update public.listings
     set status      = 'pending_review',
         -- A resubmission after rejection starts a new review. The old note
         -- stays visible on the seller's page until they submit; once they do,
         -- it must not look like the current decision.
         review_note = null,
         reviewed_by = null,
         reviewed_at = null
   where id = p_listing_id;

  -- `created` is written here, not by an INSERT trigger. A trigger would
  -- leave every draft with an auction_events row, and that table is
  -- ON DELETE RESTRICT plus append-only, so sellers could never delete a
  -- draft — contradicting the RLS policy in 0005. The first audit event
  -- is therefore the moment the listing enters the review pipeline.
  if not exists (
    select 1 from public.auction_events
     where listing_id = p_listing_id
       and event_type = 'created'
  ) then
    insert into public.auction_events (listing_id, event_type, actor_id, payload)
    values (
      p_listing_id,
      'created',
      v_bidder,
      jsonb_build_object('status', 'draft')
    );
  end if;

  insert into public.auction_events (listing_id, event_type, actor_id, payload)
  values (
    p_listing_id,
    'submitted_for_review',
    v_bidder,
    jsonb_build_object('image_count', v_images)
  );

  return 'pending_review';
end;
$$;

comment on function public.submit_listing(uuid) is
  'Seller submits a draft or rejected listing for admin review. '
  'Writes submitted_for_review. Requires at least one image.';

revoke execute on function public.submit_listing(uuid) from public;
grant  execute on function public.submit_listing(uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- approve_listing
--
-- Admin-only. pending_review → live, via the `approved` then `went_live`
-- events. Timestamps come from the database clock, never the seller.
-- ---------------------------------------------------------------------------
create or replace function public.approve_listing(p_listing_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_listing   public.listings%rowtype;
  v_admin     uuid := auth.uid();
  v_starts    timestamptz;
  v_ends      timestamptz;
begin
  if v_admin is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if not public.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;

  select * into v_listing
    from public.listings
   where id = p_listing_id
   for update;

  if not found then
    raise exception 'LISTING_NOT_FOUND';
  end if;

  if v_listing.status <> 'pending_review' then
    raise exception 'NOT_PENDING';
  end if;

  v_starts := now();
  v_ends   := v_starts + make_interval(secs => v_listing.duration_seconds);

  -- Record the approval decision first so the audit trail matches the
  -- state machine in plan §5.1: pending_review → approved → live.
  update public.listings
     set status      = 'approved',
         reviewed_by = v_admin,
         reviewed_at = v_starts,
         review_note = null
   where id = p_listing_id;

  insert into public.auction_events (listing_id, event_type, actor_id, payload)
  values (p_listing_id, 'approved', v_admin, '{}'::jsonb);

  insert into public.admin_actions (admin_id, action, target_type, target_id)
  values (v_admin, 'listing_approved', 'listing', p_listing_id);

  -- Immediate go-live. Phase 5 inserts a QStash close message here.
  update public.listings
     set status           = 'live',
         starts_at        = v_starts,
         ends_at          = v_ends,
         original_ends_at = v_ends
   where id = p_listing_id;

  insert into public.auction_events (listing_id, event_type, actor_id, payload)
  values (
    p_listing_id,
    'went_live',
    v_admin,
    jsonb_build_object('starts_at', v_starts, 'ends_at', v_ends)
  );

  return 'live';
end;
$$;

comment on function public.approve_listing(uuid) is
  'Admin approves a pending listing and takes it live immediately. '
  'Writes approved + went_live + admin_actions. Timestamps from now(). '
  'QStash close scheduling is Phase 5.';

revoke execute on function public.approve_listing(uuid) from public;
grant  execute on function public.approve_listing(uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- reject_listing
--
-- Admin-only. pending_review → rejected with a note the seller can read.
-- ---------------------------------------------------------------------------
create or replace function public.reject_listing(p_listing_id uuid, p_note text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_listing public.listings%rowtype;
  v_admin   uuid := auth.uid();
  v_note    text := btrim(coalesce(p_note, ''));
begin
  if v_admin is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if not public.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;

  if char_length(v_note) < 8 then
    raise exception 'REVIEW_NOTE_REQUIRED';
  end if;

  if char_length(v_note) > 2000 then
    raise exception 'REVIEW_NOTE_TOO_LONG';
  end if;

  select * into v_listing
    from public.listings
   where id = p_listing_id
   for update;

  if not found then
    raise exception 'LISTING_NOT_FOUND';
  end if;

  if v_listing.status <> 'pending_review' then
    raise exception 'NOT_PENDING';
  end if;

  update public.listings
     set status      = 'rejected',
         review_note = v_note,
         reviewed_by = v_admin,
         reviewed_at = now()
   where id = p_listing_id;

  insert into public.auction_events (listing_id, event_type, actor_id, payload)
  values (
    p_listing_id,
    'rejected',
    v_admin,
    jsonb_build_object('note_length', char_length(v_note))
  );

  insert into public.admin_actions (admin_id, action, target_type, target_id, note)
  values (v_admin, 'listing_rejected', 'listing', p_listing_id, v_note);

  return 'rejected';
end;
$$;

comment on function public.reject_listing(uuid, text) is
  'Admin rejects a pending listing. The note is shown to the seller. '
  'Writes rejected + admin_actions. Payload stores note length, not the note '
  'itself, so the audit event cannot become a second copy of a long review.';

revoke execute on function public.reject_listing(uuid, text) from public;
grant  execute on function public.reject_listing(uuid, text) to authenticated;


-- ---------------------------------------------------------------------------
-- Storage: listing-images
--
-- Public bucket. Listing photos are meant to be seen; a private bucket plus
-- signed URLs on every card adds moving parts and no anonymity. Writes are
-- scoped to {auth.uid()}/… so one seller cannot overwrite another’s files.
-- Only image/webp is accepted — the client converts before upload, and the
-- server re-checks magic bytes. The 5 MiB object cap is a second line of
-- defence on top of the 2 MiB application limit.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'listing-images',
  'listing-images',
  true,
  5242880,
  array['image/webp']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Recreate policies so this migration is safe to re-run conceptually
-- (Supabase applies each file once; the drops keep a corrected re-apply
-- from colliding if someone ever replays it by hand).
drop policy if exists "public reads listing images" on storage.objects;
drop policy if exists "sellers upload own listing images" on storage.objects;
drop policy if exists "sellers update own listing images" on storage.objects;
drop policy if exists "sellers delete own listing images" on storage.objects;
drop policy if exists "admins manage listing images" on storage.objects;

create policy "public reads listing images"
  on storage.objects for select
  to public
  using (bucket_id = 'listing-images');

create policy "sellers upload own listing images"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'listing-images'
    and split_part(name, '/', 1) = (select auth.uid())::text
    and public.is_active_user()
  );

create policy "sellers update own listing images"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'listing-images'
    and split_part(name, '/', 1) = (select auth.uid())::text
  )
  with check (
    bucket_id = 'listing-images'
    and split_part(name, '/', 1) = (select auth.uid())::text
  );

create policy "sellers delete own listing images"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'listing-images'
    and split_part(name, '/', 1) = (select auth.uid())::text
  );

create policy "admins manage listing images"
  on storage.objects for all
  to authenticated
  using (bucket_id = 'listing-images' and public.is_admin())
  with check (bucket_id = 'listing-images' and public.is_admin());
