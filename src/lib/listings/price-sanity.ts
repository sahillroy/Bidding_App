import { formatPaise } from "@/lib/money";

/**
 * Price-sanity flag for the admin queue.
 *
 * From implementationplan.md §8: highlight listings whose starting price is
 * far outside the median for the category — the "laptop for 10 crore" case.
 *
 * This never auto-rejects. A flag that silently kills a listing is a product
 * decision hiding in a query. The admin still has to click.
 *
 * Thresholds (agreed for Phase 3):
 *   - 3 or more live peers in the category: flag if > 10× or < 0.1× the median
 *   - fewer than 3 peers: flag anything above ₹10 lakh, because there is no
 *     median worth trusting
 */

export const SANITY_HIGH_MULTIPLE = 10n;
export const SANITY_LOW_NUMERATOR = 1n;
export const SANITY_LOW_DENOMINATOR = 10n;
export const SANITY_SPARSE_CATEGORY_PAISE = 10_00_000n * 100n; // ₹10 lakh
export const SANITY_MIN_PEERS = 3;

export type PriceSanity = {
  flagged: boolean;
  reason: string | null;
  medianPaise: bigint | null;
  peerCount: number;
};

/**
 * Median of a non-empty bigint array. For an even count, the lower of the
 * two middle values — we are comparing orders of magnitude, not rupees,
 * so averaging two paise amounts and rounding is ceremony we do not need.
 */
export function medianPaise(values: readonly bigint[]): bigint | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return sorted[Math.floor((sorted.length - 1) / 2)]!;
}

export function assessPriceSanity(
  startingPaise: bigint,
  peerStartingPaise: readonly bigint[],
): PriceSanity {
  const peerCount = peerStartingPaise.length;

  if (peerCount < SANITY_MIN_PEERS) {
    if (startingPaise > SANITY_SPARSE_CATEGORY_PAISE) {
      return {
        flagged: true,
        reason: `Only ${peerCount} live ${peerCount === 1 ? "listing" : "listings"} in this category — not enough for a median. Starting price ${formatPaise(startingPaise)} is above ₹10 lakh.`,
        medianPaise: medianPaise(peerStartingPaise),
        peerCount,
      };
    }
    return {
      flagged: false,
      reason: null,
      medianPaise: medianPaise(peerStartingPaise),
      peerCount,
    };
  }

  const median = medianPaise(peerStartingPaise);
  if (median === null || median === 0n) {
    return { flagged: false, reason: null, medianPaise: median, peerCount };
  }

  if (startingPaise > median * SANITY_HIGH_MULTIPLE) {
    return {
      flagged: true,
      reason: `Starting price ${formatPaise(startingPaise)} is more than ${SANITY_HIGH_MULTIPLE}× the category median (${formatPaise(median)}).`,
      medianPaise: median,
      peerCount,
    };
  }

  if (startingPaise * SANITY_LOW_DENOMINATOR < median * SANITY_LOW_NUMERATOR) {
    return {
      flagged: true,
      reason: `Starting price ${formatPaise(startingPaise)} is less than 0.1× the category median (${formatPaise(median)}).`,
      medianPaise: median,
      peerCount,
    };
  }

  return { flagged: false, reason: null, medianPaise: median, peerCount };
}
