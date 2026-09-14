import { createClient } from "@/lib/supabase/server";

/**
 * What this viewer is allowed to do on this listing.
 *
 * Resolved on the SERVER so the right panel is in the first paint — no flash
 * of "Sign in to bid" for someone who is already signed in and verified.
 *
 * This is not the security boundary. Every one of these conditions is checked
 * again inside `place_bid`, under the row lock. A viewer who forged their way
 * past this would reach a function that rejects them anyway. The point here is
 * to show the right thing, not to enforce it.
 */
export type BidViewerState =
  | { state: "anonymous" }
  | { state: "unverified" }
  | { state: "suspended" }
  | { state: "seller" }
  | { state: "can-bid"; isHighest: boolean };

export async function getBidViewerState(
  listingId: string,
  sellerId: string,
): Promise<BidViewerState> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { state: "anonymous" };

  // A seller cannot bid on their own listing, and that outranks everything
  // else — an unverified seller should be told the real reason, not sent off
  // to complete an identity check that would not help.
  if (user.id === sellerId) return { state: "seller" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("kyc_status, account_status")
    .eq("id", user.id)
    .single();

  if (!profile) return { state: "anonymous" };
  if (profile.account_status !== "active") return { state: "suspended" };
  if (profile.kyc_status !== "verified") return { state: "unverified" };

  // highest_bidder_id is readable here, but it never reaches the browser: the
  // page sends a boolean. Whether YOU are winning is yours to know; who else
  // is winning is shown as a handle through public_bids, like every other
  // identity in this product.
  const { data: listing } = await supabase
    .from("listings")
    .select("highest_bidder_id")
    .eq("id", listingId)
    .maybeSingle();

  return {
    state: "can-bid",
    isHighest: listing?.highest_bidder_id === user.id,
  };
}
