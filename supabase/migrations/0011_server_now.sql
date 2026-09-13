-- ===========================================================================
-- 0011 · server_now()
--
-- Returns the DATABASE clock, which is the only clock that decides anything in
-- this system.
--
-- Why this is not just `new Date()` in the application:
--
--   The Next.js process and Postgres run on different machines — Vercel and
--   Supabase are separate infrastructure — and their clocks drift apart. The
--   rule that actually governs an auction is `now() >= ends_at` evaluated
--   inside the place_bid transaction, on the database. If a page anchored its
--   countdown to the application clock instead, it could show a timer that
--   disagrees with the rule being enforced: a bidder watching "3 seconds left"
--   while the database has already closed the auction.
--
--   Every page that renders a countdown pairs ends_at with this value, and the
--   browser computes its own skew from the difference. The client clock then
--   only animates; it never decides.
--
-- Note this is deliberately NOT security definer. It reveals nothing — the
-- current time is not a secret — and there is no reason to grant it elevated
-- privileges.
-- ===========================================================================

create or replace function public.server_now()
returns timestamptz
language sql
stable
set search_path = public, pg_temp
as $$
  select now();
$$;

comment on function public.server_now() is
  'The database clock, for anchoring client countdowns. The client clock only '
  'animates; every time-based decision is made server-side against now().';

grant execute on function public.server_now() to anon, authenticated;
