/**
 * Minimum bid increments, by price band.
 *
 * From implementationplan.md §6.2. All values are paise.
 *
 * The bands exist so that bidding stays meaningful across four orders of
 * magnitude: ₹10 steps make sense on a ₹300 item and are absurd on a ₹6,00,000
 * one, where they would allow 60,000 bids to move the price.
 *
 * IMPORTANT: this table is the source of truth only at the moment a listing is
 * CREATED. The resulting increment is then written into
 * `listings.bid_increment` and that stored value governs the auction for its
 * whole life. Changing this table must never alter the rules of an auction
 * already running — see the comment on that column in migration 0005.
 *
 * The same bands are duplicated in the `place_bid` Postgres function in Phase 4.
 * That duplication is deliberate: the database must be able to validate a bid
 * without trusting anything the application sends it. The unit tests here and
 * the SQL tests there both assert the same boundaries.
 */

export type IncrementBand = {
  /** Inclusive lower bound of the band, in paise. */
  readonly minPaise: bigint;
  /** Minimum bid step within the band, in paise. */
  readonly incrementPaise: bigint;
  /** Human description, used in the UI and in error messages. */
  readonly label: string;
};

const RUPEE = 100n;

/** Ordered high to low, so the first match wins. */
export const INCREMENT_BANDS: readonly IncrementBand[] = [
  {
    minPaise: 500_000n * RUPEE, // ₹5,00,000 and above
    incrementPaise: 5_000n * RUPEE, // ₹5,000
    label: "₹5,00,000 and above",
  },
  {
    minPaise: 100_000n * RUPEE, // ₹1,00,000 – ₹4,99,999
    incrementPaise: 2_500n * RUPEE, // ₹2,500
    label: "₹1,00,000 – ₹4,99,999",
  },
  {
    minPaise: 25_000n * RUPEE, // ₹25,000 – ₹99,999
    incrementPaise: 1_000n * RUPEE, // ₹1,000
    label: "₹25,000 – ₹99,999",
  },
  {
    minPaise: 5_000n * RUPEE, // ₹5,000 – ₹24,999
    incrementPaise: 250n * RUPEE, // ₹250
    label: "₹5,000 – ₹24,999",
  },
  {
    minPaise: 500n * RUPEE, // ₹500 – ₹4,999
    incrementPaise: 50n * RUPEE, // ₹50
    label: "₹500 – ₹4,999",
  },
  {
    minPaise: 0n, // under ₹500
    incrementPaise: 10n * RUPEE, // ₹10
    label: "under ₹500",
  },
] as const;

/**
 * The minimum increment for a given current price.
 *
 * Note the band is chosen by the CURRENT price, not by the starting price, so
 * an auction that climbs from ₹400 into the thousands gets larger steps as it
 * goes.
 */
export function incrementForPrice(pricePaise: bigint): bigint {
  if (pricePaise < 0n) {
    throw new RangeError("price cannot be negative");
  }
  for (const band of INCREMENT_BANDS) {
    if (pricePaise >= band.minPaise) return band.incrementPaise;
  }
  // Unreachable: the last band starts at 0.
  return INCREMENT_BANDS[INCREMENT_BANDS.length - 1].incrementPaise;
}

export function bandForPrice(pricePaise: bigint): IncrementBand {
  for (const band of INCREMENT_BANDS) {
    if (pricePaise >= band.minPaise) return band;
  }
  return INCREMENT_BANDS[INCREMENT_BANDS.length - 1];
}

/**
 * The smallest acceptable next bid.
 *
 * `currentPrice` is null until the first bid has been placed, and in that case
 * the opening bid may EQUAL the starting price. This is the rule the plan's
 * §6.3 SQL got wrong — see the comment on `listings.current_price` in migration
 * 0005 for why the column is nullable.
 */
export function minimumNextBid(
  startingPricePaise: bigint,
  currentPricePaise: bigint | null,
  storedIncrementPaise: bigint,
): bigint {
  if (currentPricePaise === null) return startingPricePaise;
  return currentPricePaise + storedIncrementPaise;
}
