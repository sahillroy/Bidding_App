import { describe, it, expect } from "vitest";
import {
  incrementForPrice,
  minimumNextBid,
  INCREMENT_BANDS,
} from "@/lib/auction/increments";

const R = 100n; // paise per rupee

describe("increment bands (plan §6.2)", () => {
  it("applies the correct increment in the middle of each band", () => {
    expect(incrementForPrice(300n * R)).toBe(10n * R); // under ₹500
    expect(incrementForPrice(2_000n * R)).toBe(50n * R); // ₹500–4,999
    expect(incrementForPrice(10_000n * R)).toBe(250n * R); // ₹5,000–24,999
    expect(incrementForPrice(50_000n * R)).toBe(1_000n * R); // ₹25,000–99,999
    expect(incrementForPrice(300_000n * R)).toBe(2_500n * R); // ₹1L–4,99,999
    expect(incrementForPrice(900_000n * R)).toBe(5_000n * R); // ₹5L+
  });

  // Off-by-one at a band edge is the classic way this goes wrong: a bid that
  // should be legal gets rejected, or vice versa. Each boundary is checked on
  // both sides.
  it("is correct at every band boundary", () => {
    expect(incrementForPrice(499n * R)).toBe(10n * R);
    expect(incrementForPrice(500n * R)).toBe(50n * R);

    expect(incrementForPrice(4_999n * R)).toBe(50n * R);
    expect(incrementForPrice(5_000n * R)).toBe(250n * R);

    expect(incrementForPrice(24_999n * R)).toBe(250n * R);
    expect(incrementForPrice(25_000n * R)).toBe(1_000n * R);

    expect(incrementForPrice(99_999n * R)).toBe(1_000n * R);
    expect(incrementForPrice(100_000n * R)).toBe(2_500n * R);

    expect(incrementForPrice(499_999n * R)).toBe(2_500n * R);
    expect(incrementForPrice(500_000n * R)).toBe(5_000n * R);
  });

  it("handles a zero price", () => {
    expect(incrementForPrice(0n)).toBe(10n * R);
  });

  it("rejects a negative price rather than guessing", () => {
    expect(() => incrementForPrice(-1n)).toThrow(RangeError);
  });

  it("keeps the band table ordered high to low", () => {
    // The lookup returns the first band whose minimum the price clears, so an
    // out-of-order table would silently return the wrong increment.
    for (let i = 1; i < INCREMENT_BANDS.length; i++) {
      expect(INCREMENT_BANDS[i].minPaise).toBeLessThan(
        INCREMENT_BANDS[i - 1].minPaise,
      );
    }
  });
});

describe("minimumNextBid", () => {
  // This is the bug in the plan's §6.3 SQL. Its coalesce is only correct while
  // current_price is NULL before the first bid; if current_price were seeded to
  // starting_price, the opening bid would be wrongly forced up by one
  // increment, contradicting §6.1.5.
  it("lets the first bid equal the starting price", () => {
    expect(minimumNextBid(10_000n * R, null, 250n * R)).toBe(10_000n * R);
  });

  it("requires current price plus the increment once bidding has started", () => {
    expect(minimumNextBid(10_000n * R, 10_000n * R, 250n * R)).toBe(
      10_250n * R,
    );
  });

  it("uses the STORED increment, not one recomputed from the current price", () => {
    // listings.bid_increment is snapshotted at creation so that changing the
    // band table cannot alter the rules of a running auction. Here the price
    // has climbed into a higher band, but the stored increment still governs.
    const stored = 250n * R; // set when the auction opened at ₹10,000
    const climbed = 60_000n * R; // now in the ₹1,000-increment band
    expect(minimumNextBid(10_000n * R, climbed, stored)).toBe(60_250n * R);
  });
});
