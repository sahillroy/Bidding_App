-- ===========================================================================
-- 0010 · Full-text search over listings
--
-- Why not `title ilike '%term%'`:
--
--   * No stemming. Searching "cameras" would not match a listing titled
--     "camera", which users experience as the search being broken.
--   * No ranking. Every match is equally good, so a term appearing once in a
--     long description outranks nothing and the best result is wherever the
--     sort happens to put it.
--   * A leading wildcard cannot use a B-tree index, so it degrades to a
--     sequential scan of every listing on every keystroke.
--
-- A generated tsvector column plus a GIN index fixes all three. The column is
-- STORED and GENERATED, so it can never drift out of sync with the row — there
-- is no trigger to forget and no application code that can skip updating it.
-- ===========================================================================

alter table public.listings
  add column search_vector tsvector
  generated always as (
    -- Weighting matters: a term in the title is a much stronger signal than the
    -- same term buried in a description. ts_rank uses these weights, so
    -- "camera" in a title outranks "camera" mentioned in passing.
    setweight(to_tsvector('english', coalesce(title, '')), 'A')
    ||
    setweight(to_tsvector('english', coalesce(description, '')), 'B')
  ) stored;

comment on column public.listings.search_vector is
  'Generated full-text index over title (weight A) and description (weight B). '
  'GENERATED ALWAYS so it cannot drift from the row it describes.';

-- GIN rather than GiST: GIN is slower to update and larger on disk, but much
-- faster to search, and listings are read far more often than they are written.
create index listings_search_vector_idx
  on public.listings using gin (search_vector);

-- Supports the default "ending soonest" ordering on the public grid without a
-- sort step, and is partial so it only indexes rows the grid can actually show.
create index listings_live_ends_at_idx
  on public.listings (ends_at asc)
  where status = 'live';


-- ---------------------------------------------------------------------------
-- public.search_listings()
--
-- Wrapped in a function so the ranking logic lives in one place rather than
-- being reimplemented by every caller.
--
-- websearch_to_tsquery, not plainto_tsquery: it understands the syntax people
-- already expect from a search box — quoted "exact phrases", OR, and -excluded
-- terms — and, critically, it never raises on malformed input. to_tsquery would
-- throw a syntax error on a stray operator, turning a user typo into a 500.
--
-- This is NOT a SECURITY DEFINER function. It runs as the caller, so the
-- listings RLS policies still apply and an anonymous searcher sees only the
-- statuses the public policy allows. Making it definer would have quietly
-- exposed drafts and pending-review listings through search.
-- ---------------------------------------------------------------------------
create or replace function public.search_listings(
  p_query       text,
  p_category_id uuid default null,
  p_limit       integer default 24,
  p_offset      integer default 0
)
returns setof public.listings
language sql
stable
set search_path = public, pg_temp
as $$
  select l.*
    from public.listings l
   where l.status = 'live'
     and (p_category_id is null or l.category_id = p_category_id)
     and (
       p_query is null
       or btrim(p_query) = ''
       or l.search_vector @@ websearch_to_tsquery('english', p_query)
     )
   order by
     -- Relevance first when searching, then soonest-ending. With no query
     -- every rank is 0, so this collapses to pure "ending soonest".
     ts_rank(
       l.search_vector,
       websearch_to_tsquery('english', coalesce(nullif(btrim(p_query), ''), 'x'))
     ) desc,
     l.ends_at asc
   limit  greatest(0, least(p_limit, 100))
  offset greatest(0, p_offset);
$$;

comment on function public.search_listings(text, uuid, integer, integer) is
  'Full-text search over live listings. Runs as the CALLER so RLS still '
  'applies — never make this SECURITY DEFINER or drafts become searchable. '
  'p_limit is clamped to 100 so a crafted request cannot ask for everything.';

grant execute on function public.search_listings(text, uuid, integer, integer)
  to anon, authenticated;
