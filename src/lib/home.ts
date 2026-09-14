import { createClient } from "@/lib/supabase/server";
import { publicListingImageUrl } from "@/lib/listings/images";
import type { ListingRow } from "@/lib/listings";

/**
 * Queries for the homepage.
 *
 * Kept out of `lib/listings.ts` deliberately: that file is the catalogue's
 * read layer and is shared with the selling and moderation work. These are
 * presentation queries for one page, and separating them means the homepage
 * can change shape without touching the code the catalogue depends on.
 *
 * Every query here runs with the ANON key, so RLS applies exactly as it does
 * everywhere else. A listing awaiting review cannot become the hero.
 */

export type HomeListing = ListingRow & {
  /** Every photo the listing has, in sort order. Empty when it has none. */
  images: string[];
};

const LISTING_COLUMNS =
  "id, title, description, condition, starting_price, current_price, bid_increment, bid_count, reserve_price, ends_at, status, category_id, seller_id, created_at";

/**
 * Attach up to 8 image URLs per listing, in sort order.
 *
 * The catalogue only needs the cover. The homepage needs the whole set,
 * because hovering a tile cycles through them — which is where the sense of
 * motion comes from without shipping a single video file.
 */
async function attachImages(rows: ListingRow[]): Promise<HomeListing[]> {
  if (rows.length === 0) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("listing_images")
    .select("listing_id, storage_path, sort_order")
    .in(
      "listing_id",
      rows.map((r) => r.id),
    )
    .order("sort_order", { ascending: true });

  const byListing = new Map<string, string[]>();
  for (const row of data ?? []) {
    const list = byListing.get(row.listing_id) ?? [];
    if (list.length < 8) list.push(publicListingImageUrl(row.storage_path));
    byListing.set(row.listing_id, list);
  }

  return rows.map((row) => ({ ...row, images: byListing.get(row.id) ?? [] }));
}

/**
 * The headline lot.
 *
 * Chosen by contest, not by an editor: most bids first, then highest price.
 * The busiest auction on the site is the one most likely to make a visitor
 * want to join in, and it changes on its own as bidding moves — so the
 * homepage is never stale and nobody has to curate it.
 *
 * Excludes anything ending within two minutes. Leading with an auction that
 * expires while the visitor is reading it is a bad first impression.
 */
export async function getFeaturedListing(): Promise<HomeListing | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("listings")
    .select(LISTING_COLUMNS)
    .eq("status", "live")
    .gt("ends_at", new Date(Date.now() + 2 * 60 * 1000).toISOString())
    .order("bid_count", { ascending: false })
    .order("starting_price", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  const [withImages] = await attachImages([data as unknown as ListingRow]);
  return withImages ?? null;
}

/**
 * Lots closing soonest, for the urgency rail.
 *
 * `excludeId` keeps the hero out of the rail directly beneath it.
 */
export async function getEndingSoon(
  limit = 10,
  excludeId?: string,
): Promise<HomeListing[]> {
  const supabase = await createClient();

  let q = supabase
    .from("listings")
    .select(LISTING_COLUMNS)
    .eq("status", "live")
    .order("ends_at", { ascending: true })
    .limit(limit + 1);

  if (excludeId) q = q.neq("id", excludeId);

  const { data } = await q;
  const rows = ((data ?? []) as unknown as ListingRow[]).slice(0, limit);
  return attachImages(rows);
}

export type TickerBid = {
  id: string;
  handle: string;
  amount: number;
  title: string;
  listingId: string;
};

/**
 * Recent bids, for the live ticker.
 *
 * Reads `public_bids`, which exposes a handle and never a bidder id. A uuid
 * would let anyone correlate a bidder across every auction they have entered,
 * which is exactly what the anonymity model exists to prevent.
 *
 * Returns an empty list before Phase 4, when no bids exist yet. The ticker
 * renders nothing rather than inventing plausible-looking activity — a fake
 * feed on a demo that claims to be honest about what is simulated would be a
 * strange place to start lying.
 */
export async function getRecentBids(limit = 12): Promise<TickerBid[]> {
  const supabase = await createClient();

  const { data: bids } = await supabase
    .from("public_bids")
    .select("id, listing_id, bidder_handle, amount, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!bids || bids.length === 0) return [];

  const listingIds = [...new Set(bids.map((b) => b.listing_id))].filter(
    (id): id is string => Boolean(id),
  );

  const { data: listings } = await supabase
    .from("listings")
    .select("id, title")
    .in("id", listingIds);

  const titleById = new Map(
    (listings ?? []).map((l) => [l.id, l.title as string]),
  );

  return bids
    .filter((b) => b.listing_id && titleById.has(b.listing_id))
    .map((b) => ({
      id: b.id as string,
      handle: (b.bidder_handle as string) ?? "bidder",
      amount: Number(b.amount ?? 0),
      title: titleById.get(b.listing_id as string)!,
      listingId: b.listing_id as string,
    }));
}

/** Headline numbers for the hero. One query each, all cheap count-only. */
export async function getHomeStats(): Promise<{
  live: number;
  endingWithinHour: number;
  categories: number;
}> {
  const supabase = await createClient();
  const inAnHour = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  const [live, soon, cats] = await Promise.all([
    supabase
      .from("listings")
      .select("id", { count: "exact", head: true })
      .eq("status", "live"),
    supabase
      .from("listings")
      .select("id", { count: "exact", head: true })
      .eq("status", "live")
      .lt("ends_at", inAnHour),
    supabase.from("categories").select("id", { count: "exact", head: true }),
  ]);

  return {
    live: live.count ?? 0,
    endingWithinHour: soon.count ?? 0,
    categories: cats.count ?? 0,
  };
}
