import { createClient } from "@/lib/supabase/server";
import {
  assessPriceSanity,
  type PriceSanity,
} from "@/lib/listings/price-sanity";
import {
  publicListingImageUrl,
  type ListingImageRow,
} from "@/lib/listings/images";

export type AdminListingSummary = {
  id: string;
  title: string;
  starting_price: number;
  category_id: string;
  category_name: string | null;
  condition: string;
  status: string;
  created_at: string;
  sanity: PriceSanity;
};

export type AdminListingDetail = {
  id: string;
  title: string;
  description: string;
  condition: string;
  category_id: string;
  category_name: string | null;
  starting_price: number;
  reserve_price: number | null;
  bid_increment: number;
  duration_seconds: number;
  status: string;
  review_note: string | null;
  created_at: string;
  seller_handle: string | null;
  images: Array<ListingImageRow & { url: string }>;
  sanity: PriceSanity;
};

type LivePriceRow = { category_id: string; starting_price: number };

async function liveStartingPrices(): Promise<LivePriceRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("listings")
    .select("category_id, starting_price")
    .eq("status", "live");
  return (data ?? []) as LivePriceRow[];
}

function peersFor(
  prices: LivePriceRow[],
  categoryId: string,
  excludeId?: string,
): bigint[] {
  void excludeId;
  return prices
    .filter((row) => row.category_id === categoryId)
    .map((row) => BigInt(row.starting_price));
}

export async function getPendingListings(): Promise<AdminListingSummary[]> {
  const supabase = await createClient();

  const [{ data }, livePrices] = await Promise.all([
    supabase
      .from("listings")
      .select(
        "id, title, starting_price, category_id, condition, status, created_at, category:categories(name)",
      )
      .eq("status", "pending_review")
      .order("created_at", { ascending: true }),
    liveStartingPrices(),
  ]);

  return (data ?? []).map((row) => {
    const category = Array.isArray(row.category)
      ? row.category[0]
      : row.category;
    return {
      id: row.id,
      title: row.title,
      starting_price: row.starting_price,
      category_id: row.category_id,
      category_name: category?.name ?? null,
      condition: row.condition,
      status: row.status,
      created_at: row.created_at,
      sanity: assessPriceSanity(
        BigInt(row.starting_price),
        peersFor(livePrices, row.category_id),
      ),
    };
  });
}

export async function getAdminListing(
  id: string,
): Promise<AdminListingDetail | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("listings")
    .select(
      "id, title, description, condition, category_id, starting_price, reserve_price, bid_increment, duration_seconds, status, review_note, created_at, seller_id, category:categories(name)",
    )
    .eq("id", id)
    .maybeSingle();

  if (!data) return null;

  const [imagesResult, sellerResult, livePrices] = await Promise.all([
    supabase
      .from("listing_images")
      .select("id, listing_id, storage_path, sort_order")
      .eq("listing_id", id)
      .order("sort_order", { ascending: true }),
    supabase
      .from("public_profiles")
      .select("handle")
      .eq("id", data.seller_id)
      .maybeSingle(),
    liveStartingPrices(),
  ]);

  const category = Array.isArray(data.category)
    ? data.category[0]
    : data.category;

  return {
    id: data.id,
    title: data.title,
    description: data.description,
    condition: data.condition,
    category_id: data.category_id,
    category_name: category?.name ?? null,
    starting_price: data.starting_price,
    reserve_price: data.reserve_price,
    bid_increment: data.bid_increment,
    duration_seconds: data.duration_seconds,
    status: data.status,
    review_note: data.review_note,
    created_at: data.created_at,
    seller_handle: sellerResult.data?.handle ?? null,
    images: ((imagesResult.data ?? []) as ListingImageRow[]).map((image) => ({
      ...image,
      url: publicListingImageUrl(image.storage_path),
    })),
    sanity: assessPriceSanity(
      BigInt(data.starting_price),
      peersFor(livePrices, data.category_id),
    ),
  };
}

export async function countPendingListings(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("listings")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending_review");
  return count ?? 0;
}
