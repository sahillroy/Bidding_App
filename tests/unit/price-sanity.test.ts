import { describe, it, expect } from "vitest";
import {
  assessPriceSanity,
  medianPaise,
  SANITY_SPARSE_CATEGORY_PAISE,
} from "@/lib/listings/price-sanity";

const R = 100n;

describe("medianPaise", () => {
  it("returns null for an empty list", () => {
    expect(medianPaise([])).toBeNull();
  });

  it("returns the middle value of an odd-length list", () => {
    expect(medianPaise([3n, 1n, 2n])).toBe(2n);
  });

  it("uses the lower middle of an even-length list", () => {
    expect(medianPaise([1n, 2n, 3n, 4n])).toBe(2n);
  });
});

describe("assessPriceSanity", () => {
  const peers = [20_000n * R, 25_000n * R, 30_000n * R, 22_000n * R];

  it("does not flag a price near the median", () => {
    const result = assessPriceSanity(24_000n * R, peers);
    expect(result.flagged).toBe(false);
    expect(result.peerCount).toBe(4);
  });

  it("flags a starting price more than 10× the median", () => {
    // median of the peers above is 22,000. 10 crore is the brief's example.
    const result = assessPriceSanity(10_00_00_000n * R, peers);
    expect(result.flagged).toBe(true);
    expect(result.reason).toMatch(/10×/);
  });

  it("flags a starting price less than 0.1× the median", () => {
    const result = assessPriceSanity(100n * R, peers);
    expect(result.flagged).toBe(true);
    expect(result.reason).toMatch(/0\.1×/);
  });

  it("does not auto-reject — the flag is information only", () => {
    const result = assessPriceSanity(10_00_00_000n * R, peers);
    expect(result.flagged).toBe(true);
    expect(result).not.toHaveProperty("rejected");
  });

  it("with fewer than 3 peers, flags only prices above ₹10 lakh", () => {
    const sparse = [5_000n * R];
    expect(assessPriceSanity(8_000n * R, sparse).flagged).toBe(false);
    expect(
      assessPriceSanity(SANITY_SPARSE_CATEGORY_PAISE + 1n, sparse).flagged,
    ).toBe(true);
  });
});
