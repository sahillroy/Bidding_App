/**
 * Money handling.
 *
 * Every amount in this system is a `bigint` count of PAISE. ₹1,250.50 is
 * 125050. There is no floating point anywhere in the money path, because a
 * double cannot represent 0.1 exactly and an auction that loses a paisa per bid
 * is an auction with a dispute attached.
 *
 * Conversion to a human-readable string happens once, at the edge, for display.
 * Nothing reads a formatted string back.
 */

/** Paise in one rupee. */
export const PAISE_PER_RUPEE = 100n;

/**
 * Upper sanity bound: ₹1,00,00,00,000 (100 crore) in paise.
 * Matches the CHECK constraints in the listings and bids migrations. A bid
 * above this is not a real bid, it is a typo or an attack.
 */
export const MAX_AMOUNT_PAISE = 100_000_000_000n;

/**
 * Format paise as Indian rupees.
 *
 * Uses the en-IN locale, which groups digits in the Indian system
 * (2,2,3 — so 10,00,000 rather than 1,000,000). Getting this wrong is
 * immediately visible to an Indian user and reads as a foreign product.
 *
 * @param paise amount in paise
 * @param opts.paise  show the paise component even when it is zero
 * @param opts.compact  render large values as "₹1.25L" / "₹2.4Cr"
 */
export function formatPaise(
  paise: bigint | number,
  opts: { paise?: boolean; compact?: boolean } = {},
): string {
  const value = typeof paise === "bigint" ? paise : BigInt(Math.round(paise));
  const negative = value < 0n;
  const abs = negative ? -value : value;

  const rupees = abs / PAISE_PER_RUPEE;
  const remainder = abs % PAISE_PER_RUPEE;

  if (opts.compact) {
    const compact = formatCompactRupees(rupees);
    if (compact) return `${negative ? "-" : ""}${compact}`;
  }

  // Number is safe here: the sanity ceiling is 100 crore rupees, far below
  // Number.MAX_SAFE_INTEGER. The bigint arithmetic above is what matters.
  const whole = new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0,
  }).format(Number(rupees));

  const showPaise = opts.paise || remainder !== 0n;
  const tail = showPaise ? `.${remainder.toString().padStart(2, "0")}` : "";

  return `${negative ? "-" : ""}₹${whole}${tail}`;
}

/**
 * Indian compact notation: lakh (1,00,000) and crore (1,00,00,000).
 *
 * Deliberately not Intl's `notation: "compact"`, which produces "10L" style
 * output inconsistently across runtimes and renders 1,00,00,000 as "10M" in
 * some. Returns null when the value is small enough to show in full.
 */
function formatCompactRupees(rupees: bigint): string | null {
  const CRORE = 10_000_000n;
  const LAKH = 100_000n;

  if (rupees >= CRORE) {
    return `₹${trimZeros(Number(rupees) / Number(CRORE))}Cr`;
  }
  if (rupees >= LAKH) {
    return `₹${trimZeros(Number(rupees) / Number(LAKH))}L`;
  }
  return null;
}

function trimZeros(n: number): string {
  return n.toFixed(2).replace(/\.?0+$/, "");
}

/**
 * Parse a user-entered rupee amount into paise.
 *
 * Returns null for anything that is not a clean amount. Callers must treat null
 * as a validation failure — never as zero.
 *
 * Accepts "1250", "1,250", "1250.50", "₹1,250.50". Rejects more than two
 * decimal places rather than rounding, because silently turning ₹10.999 into
 * ₹11.00 is the kind of thing that becomes a dispute.
 */
export function parseRupeesToPaise(input: string): bigint | null {
  const cleaned = input.trim().replace(/^₹/, "").replace(/,/g, "");

  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;

  const [whole, fraction = ""] = cleaned.split(".");
  const paise =
    BigInt(whole) * PAISE_PER_RUPEE + BigInt(fraction.padEnd(2, "0"));

  if (paise <= 0n || paise > MAX_AMOUNT_PAISE) return null;

  return paise;
}
