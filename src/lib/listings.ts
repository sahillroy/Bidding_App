import { createClient } from "@/lib/supabase/server";
import { publicListingImageUrl } from "@/lib/listings/images";
import type { CategoryRow } from "@/lib/listings/display";

export type { CategoryRow } from "@/lib/listings/display";
export { CONDITION_LABELS } from "@/lib/listings/display";

/**
 * Read-side queries for the public catalogue.
 *
 * Every one of these runs with the ANON key through the normal Supabase client,
 * so the `listings` RLS policies apply. That is what makes Phase 3's guarantee
 * real: a draft or pending-review listing is not merely hidden by a filter in
 * this file, it is invisible to the query. Removing a `.eq("status", "live")`
 * here would still not leak an unapproved listing.
 *
 * Note the select() column lists below are single string literals, not strings
 * assembled with `+`. Supabase parses that literal at the type level to infer
 * the row shape; a runtime-concatenated string defeats it and every result
 * silently degrades to an untyped error type. Keep them literal.
 */

export type ListingRow = {
  id: string;
  title: string;
  description: string;
  condition: string;
  starting_price: number;
  current_price: number | null;
  bid_increment: number;
  bid_count: number;
  reserve_price: number | null;
  ends_at: string | null;
  status: string;
  category_id: string;
  seller_id: string;
  created_at: string;
  coverUrl?: string | null;
};

const LISTING_COLUMNS =
  "id, title, description, condition, starting_price, current_price, bid_increment, bid_count, reserve_price, ends_at, status, category_id, seller_id, created_at";

/**
 * The price to display.
 *
 * `current_price` is NULL until someone bids, so the grid shows the starting
 * price with a "Starting bid" label rather than "₹0". See the comment on that
 * column in migration 0005 for why it is nullable.
 */
export function displayPricePaise(listing: {
  current_price: number | null;
  starting_price: number;
}): bigint {
  return BigInt(listing.current_price ?? listing.starting_price);
}

export function hasBids(listing: { bid_count: number }): boolean {
  return listing.bid_count > 0;
}

/**
 * The server's current time, read from the database rather than from the Node
 * process.
 *
 * These are not the same clock. Vercel functions and Supabase run on different
 * machines, and the database clock is the one that decides whether an auction
 * has ended — so the countdown must be anchored to it, or a page could render a
 * timer that disagrees with the rule actually being enforced.
 */
export async function getServerNow(): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("server_now");

  if (error || !data) {
    // Falling back to the application clock is a small inaccuracy, not a
    // correctness problem: the countdown may be off by the skew between the two
    // machines, but place_bid still decides with the database clock.
    return new Date().toISOString();
  }
  return data as string;
}

export async function getCategories(): Promise<CategoryRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("categories")
    .select("id, slug, name, parent_id, sort_order")
    .order("sort_order", { ascending: true });

  return data ?? [];
}

export async function getCategoryBySlug(
  slug: string,
): Promise<CategoryRow | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("categories")
    .select("id, slug, name, parent_id, sort_order")
    .eq("slug", slug)
    .maybeSingle();

  return data ?? null;
}

/**
 * Browse and search.
 *
 * When there is a search term this goes through the `search_listings` function
 * from migration 0010, which ranks by relevance. With no term it is a plain
 * ordered select, soonest-ending first.
 *
 * The search path uses an RPC rather than string-building a tsquery in
 * TypeScript. Supabase parameterises RPC arguments, so the user's input is
 * never concatenated into SQL — and `websearch_to_tsquery` never raises on
 * malformed input, so a stray quote is a zero-result search rather than a 500.
 */
export async function browseListings(opts: {
  query?: string;
  categoryId?: string | null;
  limit?: number;
  offset?: number;
}): Promise<ListingRow[]> {
  const supabase = await createClient();
  const limit = Math.min(opts.limit ?? 24, 100);
  const offset = Math.max(opts.offset ?? 0, 0);

  const term = opts.query?.trim();

  if (term) {
    const { data, error } = await supabase.rpc("search_listings", {
      p_query: term,
      p_category_id: opts.categoryId ?? undefined,
      p_limit: limit,
      p_offset: offset,
    });
    if (error) return [];
    return attachCoverUrls((data ?? []) as ListingRow[]);
  }

  let q = supabase
    .from("listings")
    .select(LISTING_COLUMNS)
    .eq("status", "live")
    .order("ends_at", { ascending: true })
    .range(offset, offset + limit - 1);

  if (opts.categoryId) {
    q = q.eq("category_id", opts.categoryId);
  }

  const { data } = await q;
  return attachCoverUrls((data ?? []) as unknown as ListingRow[]);
}

export async function countLiveListings(
  categoryId?: string | null,
): Promise<number> {
  const supabase = await createClient();
  let q = supabase
    .from("listings")
    .select("id", { count: "exact", head: true })
    .eq("status", "live");

  if (categoryId) q = q.eq("category_id", categoryId);

  const { count } = await q;
  return count ?? 0;
}

export type ListingDetail = ListingRow & {
  category: { slug: string; name: string } | null;
  seller_handle: string | null;
  images: { id: string; url: string; sort_order: number }[];
};

async function attachCoverUrls(listings: ListingRow[]): Promise<ListingRow[]> {
  if (listings.length === 0) return listings;

  const supabase = await createClient();
  const { data } = await supabase
    .from("listing_images")
    .select("listing_id, storage_path, sort_order")
    .in(
      "listing_id",
      listings.map((row) => row.id),
    )
    .order("sort_order", { ascending: true });

  const coverByListing = new Map<string, string>();
  for (const row of data ?? []) {
    if (!coverByListing.has(row.listing_id)) {
      coverByListing.set(row.listing_id, publicListingImageUrl(row.storage_path));
    }
  }

  return listings.map((listing) => ({
    ...listing,
    coverUrl: coverByListing.get(listing.id) ?? null,
  }));
}

/**
 * A single listing, with its seller's HANDLE — never the seller's uuid or name.
 *
 * The handle comes from `public_profiles`, which exposes handle and nothing
 * else. Selecting from `profiles` here and picking fields by hand would work
 * today and leak a display name the first time someone edited the select list.
 */
export async function getListing(id: string): Promise<ListingDetail | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("listings")
    .select(
      "id, title, description, condition, starting_price, current_price, bid_increment, bid_count, reserve_price, ends_at, status, category_id, seller_id, created_at, category:categories(slug, name)",
    )
    .eq("id", id)
    .maybeSingle();

  if (!data) return null;

  const [{ data: seller }, { data: imageRows }] = await Promise.all([
    supabase
      .from("public_profiles")
      .select("handle")
      .eq("id", data.seller_id)
      .maybeSingle(),
    supabase
      .from("listing_images")
      .select("id, storage_path, sort_order")
      .eq("listing_id", id)
      .order("sort_order", { ascending: true }),
  ]);

  // PostgREST returns an embedded to-one relation as an object, but the
  // generated types describe it as possibly an array. Normalise once here so
  // no caller has to think about it.
  const category = Array.isArray(data.category)
    ? (data.category[0] ?? null)
    : data.category;

  const images = (imageRows ?? []).map((row) => ({
    id: row.id,
    url: publicListingImageUrl(row.storage_path),
    sort_order: row.sort_order,
  }));

  return {
    ...data,
    category,
    seller_handle: seller?.handle ?? null,
    coverUrl: images[0]?.url ?? null,
    images,
  } as ListingDetail;
}

/** Public bid history: handles only, never bidder ids. */
export async function getBidHistory(listingId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("public_bids")
    .select("id, bidder_handle, amount, created_at")
    .eq("listing_id", listingId)
    .order("amount", { ascending: false })
    .limit(20);

  return data ?? [];
}

