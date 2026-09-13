-- ===========================================================================
-- 0009 · comments, likes, watchlist, notifications, messages, admin_actions
--
-- The social surface, plus the in-app messaging that replaces any direct
-- contact between buyer and seller.
--
-- Note what does not exist anywhere below: no phone column, no email column,
-- no address, no social handle, no website. Buyer-seller anonymity is enforced
-- by the schema not having the fields, so that no future query can leak what
-- was never stored. See CLAUDE.md hard rule 9.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- comments — public, on a listing
-- ---------------------------------------------------------------------------
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete restrict,

  body text not null
    check (char_length(trim(body)) between 1 and 1000),

  -- Set by the PII scrubber in Phase 7. A blocked comment is retained and
  -- flagged rather than silently dropped: the author is told why, and repeated
  -- attempts are evidence for a strike.
  pii_flags jsonb not null default '{}'::jsonb,
  blocked boolean not null default false,

  created_at timestamptz not null default now()
);

create index comments_listing_id_idx on public.comments (listing_id, created_at desc);
create index comments_author_id_idx on public.comments (author_id);

alter table public.comments enable row level security;
alter table public.comments force row level security;

create policy "anyone reads unblocked comments on visible listings"
  on public.comments for select
  to anon, authenticated
  using (
    blocked = false
    and exists (
      select 1 from public.listings l
       where l.id = listing_id
         and l.status in ('live', 'ended', 'settling', 'sold', 'unsold')
    )
  );

-- An author sees their own blocked comment, so the UI can explain the block.
create policy "authors read their own comments"
  on public.comments for select
  to authenticated
  using (author_id = (select auth.uid()));

create policy "admins read every comment"
  on public.comments for select
  to authenticated
  using (public.is_admin());

create policy "active users comment on live listings"
  on public.comments for insert
  to authenticated
  with check (
    author_id = (select auth.uid())
    and public.is_active_user()
    and exists (
      select 1 from public.listings l
       where l.id = listing_id
         and l.status in ('live', 'ended')
    )
  );

create policy "authors delete their own comments"
  on public.comments for delete
  to authenticated
  using (author_id = (select auth.uid()));

create policy "admins delete any comment"
  on public.comments for delete
  to authenticated
  using (public.is_admin());

revoke all on public.comments from anon, authenticated;
grant select on public.comments to anon, authenticated;
grant insert (listing_id, author_id, body) on public.comments to authenticated;
grant delete on public.comments to authenticated;
-- blocked and pii_flags are not grantable: only the server-side scrubber sets them.


-- ---------------------------------------------------------------------------
-- likes
-- ---------------------------------------------------------------------------
create table public.likes (
  listing_id uuid not null references public.listings (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (listing_id, user_id)
);

alter table public.likes enable row level security;
alter table public.likes force row level security;

-- Like COUNTS are public; WHO liked is not. Public pages read the count through
-- an aggregate, never the rows, so this policy stays owner-scoped.
create policy "users read their own likes"
  on public.likes for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "users like and unlike for themselves"
  on public.likes for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.is_active_user());

revoke all on public.likes from anon, authenticated;
grant select, insert, delete on public.likes to authenticated;


-- ---------------------------------------------------------------------------
-- watchlist
-- ---------------------------------------------------------------------------
create table public.watchlist (
  listing_id uuid not null references public.listings (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (listing_id, user_id)
);

alter table public.watchlist enable row level security;
alter table public.watchlist force row level security;

create policy "users manage their own watchlist"
  on public.watchlist for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on public.watchlist from anon, authenticated;
grant select, insert, delete on public.watchlist to authenticated;


-- ---------------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,

  kind text not null
    check (kind in (
      'outbid', 'auction_won', 'auction_lost', 'auction_ended_unsold',
      'payment_reminder', 'payment_received', 'order_defaulted',
      'runner_up_offer', 'listing_approved', 'listing_rejected',
      'kyc_approved', 'kyc_rejected', 'account_suspended', 'account_banned'
    )),

  listing_id uuid references public.listings (id) on delete cascade,
  order_id uuid references public.orders (id) on delete cascade,

  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_unread_idx
  on public.notifications (user_id, created_at desc)
  where read_at is null;

alter table public.notifications enable row level security;
alter table public.notifications force row level security;

create policy "users read their own notifications"
  on public.notifications for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "users mark their own notifications read"
  on public.notifications for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
-- No INSERT: notifications are created server-side.


-- ---------------------------------------------------------------------------
-- messages — in-app only, unlocked only after an order exists
--
-- There is no reason for a buyer and a seller to talk before money is owed, and
-- every reason not to let them: pre-order contact is how people arrange to
-- settle off-platform and defeat the anonymity model entirely.
-- ---------------------------------------------------------------------------
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete restrict,
  recipient_id uuid not null references public.profiles (id) on delete restrict,

  -- Already scrubbed before it reaches this column.
  body text not null
    check (char_length(trim(body)) between 1 and 2000),

  pii_flags jsonb not null default '{}'::jsonb,
  blocked boolean not null default false,

  read_at timestamptz,
  created_at timestamptz not null default now(),

  constraint sender_is_not_recipient check (sender_id <> recipient_id)
);

comment on table public.messages is
  'In-app messaging, scoped to an order. Keyed on order_id rather than '
  'listing_id so a conversation cannot start before there is something to '
  'discuss. body is PII-scrubbed before insert; blocked messages are retained '
  'and flagged so the sender can be told why.';

create index messages_order_id_idx on public.messages (order_id, created_at);
create index messages_recipient_unread_idx
  on public.messages (recipient_id, created_at desc)
  where read_at is null;

alter table public.messages enable row level security;
alter table public.messages force row level security;

create policy "participants read their own messages"
  on public.messages for select
  to authenticated
  using (
    sender_id = (select auth.uid())
    or (recipient_id = (select auth.uid()) and blocked = false)
  );

create policy "admins read every message"
  on public.messages for select
  to authenticated
  using (public.is_admin());

-- The subquery is the enforcement of "messaging unlocks only after an order":
-- both parties must be on the same order, and that order must still be open.
create policy "order participants message each other"
  on public.messages for insert
  to authenticated
  with check (
    sender_id = (select auth.uid())
    and public.is_active_user()
    and exists (
      select 1 from public.orders o
       where o.id = order_id
         and o.status in ('awaiting_payment', 'paid', 'awaiting_seller_decision')
         and (
           (o.buyer_id = (select auth.uid()) and o.seller_id = recipient_id)
           or (o.seller_id = (select auth.uid()) and o.buyer_id = recipient_id)
         )
    )
  );

create policy "recipients mark messages read"
  on public.messages for update
  to authenticated
  using (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));

revoke all on public.messages from anon, authenticated;
grant select on public.messages to authenticated;
grant insert (order_id, sender_id, recipient_id, body) on public.messages to authenticated;
grant update (read_at) on public.messages to authenticated;


-- ---------------------------------------------------------------------------
-- admin_actions — every moderation decision, permanently
-- ---------------------------------------------------------------------------
create table public.admin_actions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.profiles (id) on delete restrict,

  action text not null
    check (action in (
      'listing_approved', 'listing_rejected',
      'kyc_approved', 'kyc_rejected',
      'user_suspended', 'user_banned', 'user_reinstated',
      'comment_removed', 'listing_cancelled'
    )),

  target_type text not null
    check (target_type in ('listing', 'kyc_submission', 'profile', 'comment')),
  target_id uuid not null,

  note text,
  created_at timestamptz not null default now()
);

comment on table public.admin_actions is
  'Append-only record of every moderation decision. Answers "who banned this '
  'user and why" months later.';

create index admin_actions_admin_id_idx on public.admin_actions (admin_id, created_at desc);
create index admin_actions_target_idx on public.admin_actions (target_type, target_id);

create trigger admin_actions_block_update
  before update on public.admin_actions
  for each row execute function public.reject_bid_mutation();

create trigger admin_actions_block_delete
  before delete on public.admin_actions
  for each row execute function public.reject_bid_mutation();

alter table public.admin_actions enable row level security;
alter table public.admin_actions force row level security;

create policy "admins read the action log"
  on public.admin_actions for select
  to authenticated
  using (public.is_admin());

create policy "admins write the action log"
  on public.admin_actions for insert
  to authenticated
  with check (public.is_admin() and admin_id = (select auth.uid()));

revoke all on public.admin_actions from anon, authenticated;
grant select on public.admin_actions to authenticated;
grant insert (admin_id, action, target_type, target_id, note)
  on public.admin_actions to authenticated;
