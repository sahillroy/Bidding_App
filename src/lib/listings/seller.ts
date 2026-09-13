import { createClient } from "@/lib/supabase/server";
import type { ListingImageRow } from "@/lib/listings/images";
import type { SellerListing, SellerListingDetail } from "@/lib/listings/seller-view";

export type { SellerListing, SellerListingDetail } from "@/lib/listings/seller-view";
export {
  imagePublicUrls,
  isEditableStatus,
  STATUS_LABELS,
} from "@/lib/listings/seller-view";

export const SELLER_LISTING_COLUMNS =
  "id, title, description, category_id, condition, starting_price, reserve_price, bid_increment, duration_seconds, status, review_note, reviewed_at, starts_at, ends_at, bid_count, created_at, updated_at";

export async function getMyListings(): Promise<SellerListing[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("listings")
    .select(SELLER_LISTING_COLUMNS)
    .eq("seller_id", user.id)
    .order("updated_at", { ascending: false });

  return (data ?? []) as unknown as SellerListing[];
}

export async function getMyListing(
  id: string,
): Promise<SellerListingDetail | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("listings")
    .select(SELLER_LISTING_COLUMNS)
    .eq("id", id)
    .eq("seller_id", user.id)
    .maybeSingle();

  if (!data) return null;

  const { data: images } = await supabase
    .from("listing_images")
    .select("id, listing_id, storage_path, sort_order")
    .eq("listing_id", id)
    .order("sort_order", { ascending: true });

  return {
    ...(data as unknown as SellerListing),
    images: (images ?? []) as ListingImageRow[],
  };
}
