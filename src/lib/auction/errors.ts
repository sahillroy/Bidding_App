import { formatPaise } from "@/lib/money";

/**
 * Turns a `place_bid` exception into something a person can act on.
 *
 * The function raises bare codes — `KYC_REQUIRED`, `BID_TOO_LOW:1025000` —
 * rather than sentences. That is deliberate: the database is not the place to
 * decide wording, and a message written in SQL cannot be translated, reworded
 * for a different surface, or changed without a migration.
 *
 * `BID_TOO_LOW` carries the minimum that would have been accepted, so the
 * interface can say what to do instead of only what went wrong. "That bid is
 * too low" is a dead end; "the minimum is ₹25,500" is an instruction.
 *
 * The fallback is deliberately vague. An unrecognised error means something
 * unexpected happened server-side, and echoing a raw Postgres message at a
 * visitor leaks schema details and reads as a crash.
 */
export type BidErrorCode =
  | "NOT_AUTHENTICATED"
  | "BID_INVALID"
  | "BID_ABOVE_CEILING"
  | "KYC_REQUIRED"
  | "ACCOUNT_NOT_ACTIVE"
  | "LISTING_NOT_FOUND"
  | "AUCTION_NOT_LIVE"
  | "AUCTION_ENDED"
  | "SELLER_CANNOT_BID"
  | "BID_TOO_LOW"
  | "UNKNOWN";

export type BidError = {
  code: BidErrorCode;
  message: string;
  /** Present only for BID_TOO_LOW: the minimum that would have been accepted. */
  minimumPaise?: bigint;
};

export function parseBidError(raw: string | null | undefined): BidError {
  const text = raw ?? "";

  // BID_TOO_LOW:1025000 — the amount travels with the code.
  const tooLow = /BID_TOO_LOW:(\d+)/.exec(text);
  if (tooLow) {
    const minimum = BigInt(tooLow[1]);
    return {
      code: "BID_TOO_LOW",
      minimumPaise: minimum,
      message: `Someone has already bid that much. The minimum is now ${formatPaise(minimum)}.`,
    };
  }

  const known: Record<Exclude<BidErrorCode, "BID_TOO_LOW" | "UNKNOWN">, string> =
    {
      NOT_AUTHENTICATED: "Sign in to place a bid.",
      BID_INVALID: "That is not a valid amount.",
      BID_ABOVE_CEILING:
        "That bid is above the maximum this demo accepts. Check the amount.",
      KYC_REQUIRED:
        "Bidding needs a completed identity check. It takes a minute and no document number is stored.",
      ACCOUNT_NOT_ACTIVE:
        "This account cannot bid at the moment. Check your account page for details.",
      LISTING_NOT_FOUND: "That listing no longer exists.",
      AUCTION_NOT_LIVE: "This auction is not open for bidding.",
      AUCTION_ENDED:
        "This auction closed before the bid reached us. The server clock decides, not your browser.",
      SELLER_CANNOT_BID: "You cannot bid on your own listing.",
    };

  for (const [code, message] of Object.entries(known)) {
    if (text.includes(code)) {
      return { code: code as BidErrorCode, message };
    }
  }

  return {
    code: "UNKNOWN",
    message: "That bid could not be placed. Please try again.",
  };
}
