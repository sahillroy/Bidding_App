import {
  publicListingImageUrl,
  type ListingImageRow,
} from "@/lib/listings/images";

/**
 * Seller listing types and display helpers.
 *
 * This file must stay free of `@/lib/supabase/server`. The listing wizard is
 * a Client Component; importing the server client from it makes Next treat
 * `next/headers` as a browser module and the production build fails.
 */

export type SellerListing = {
  id: string;
  title: string;
  description: string;
  category_id: string;
  condition: string;
  starting_price: number;
  reserve_price: number | null;
  bid_increment: number;
  duration_seconds: number;
  status: string;
  review_note: string | null;
  reviewed_at: string | null;
  starts_at: string | null;
  ends_at: string | null;
  bid_count: number;
  created_at: string;
  updated_at: string;
};

export type SellerListingDetail = SellerListing & {
  images: ListingImageRow[];
};

export function imagePublicUrls(images: ListingImageRow[]) {
  return images.map((image) => ({
    ...image,
    url: publicListingImageUrl(image.storage_path),
  }));
}

export const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  pending_review: "Awaiting review",
  rejected: "Rejected",
  approved: "Approved",
  live: "Live",
  ended: "Ended",
  settling: "Settling",
  sold: "Sold",
  unsold: "Unsold",
  cancelled: "Cancelled",
};

export function isEditableStatus(status: string): boolean {
  return status === "draft" || status === "rejected";
}
