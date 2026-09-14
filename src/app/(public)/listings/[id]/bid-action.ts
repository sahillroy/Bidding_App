"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseBidError } from "@/lib/auction/errors";
import { parseRupeesToPaise, formatPaise, MAX_AMOUNT_PAISE } from "@/lib/money";

/**
 * Place a bid.
 *
 * A Server Action rather than a client-side RPC, for three reasons: the
 * session cookie never has to be handled in the browser, `revalidatePath` can
 * refresh the page's server-rendered data in the same round trip, and the
 * amount gets parsed and bounded before it reaches the database.
 *
 * NONE OF THAT IS THE SECURITY BOUNDARY. Everything checked here is checked
 * again inside `place_bid`, under the row lock, against the database clock.
 * This layer exists to give a better error faster; if it were deleted
 * entirely, a bid would still be validated correctly. That is the intended
 * relationship between application code and the engine.
 */
export type BidState = {
  ok?: boolean;
  error?: string;
  /** Set on BID_TOO_LOW so the form can offer the amount that would work. */
  suggestPaise?: string;
};

export async function placeBid(
  _prev: BidState,
  formData: FormData,
): Promise<BidState> {
  const listingId = formData.get("listingId")?.toString() ?? "";
  const raw = formData.get("amount")?.toString() ?? "";

  if (!/^[0-9a-f-]{36}$/i.test(listingId)) {
    return { error: "That listing id is not valid." };
  }

  const amount = parseRupeesToPaise(raw);
  if (amount === null) {
    return {
      error:
        "Enter an amount in rupees, for example 25,500. Paise are allowed to two decimal places.",
    };
  }
  if (amount > MAX_AMOUNT_PAISE) {
    return {
      error: `The maximum this demo accepts is ${formatPaise(MAX_AMOUNT_PAISE)}.`,
    };
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Sign in to place a bid." };
  }

  // The bigint goes over the wire as a number. The ceiling above keeps it far
  // below Number.MAX_SAFE_INTEGER — 100 crore rupees is 10^11 paise, and the
  // safe limit is roughly 9 × 10^15 — so nothing is lost in the conversion.
  const { error } = await supabase.rpc("place_bid", {
    p_listing_id: listingId,
    p_amount: Number(amount),
  });

  if (error) {
    const parsed = parseBidError(error.message);
    return {
      error: parsed.message,
      suggestPaise:
        parsed.minimumPaise !== undefined
          ? parsed.minimumPaise.toString()
          : undefined,
    };
  }

  // Refresh this listing, the catalogue and the homepage: the price, the bid
  // count and the ticker all just changed. Other viewers get it over Realtime
  // without a refetch; this is for the person who bid.
  revalidatePath(`/listings/${listingId}`);
  revalidatePath("/");
  revalidatePath("/bids");

  return { ok: true };
}
