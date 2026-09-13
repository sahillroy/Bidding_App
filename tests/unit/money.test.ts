import { describe, it, expect } from "vitest";
import { formatPaise, parseRupeesToPaise, MAX_AMOUNT_PAISE } from "@/lib/money";

describe("formatPaise", () => {
  it("formats whole rupees without a decimal part", () => {
    expect(formatPaise(125000n)).toBe("₹1,250");
  });

  it("shows paise when they are non-zero", () => {
    expect(formatPaise(125050n)).toBe("₹1,250.50");
  });

  it("pads a single-digit paise value", () => {
    expect(formatPaise(125005n)).toBe("₹1,250.05");
  });

  it("uses Indian digit grouping, not Western", () => {
    // 2,2,3 grouping. Getting this wrong is immediately visible to an Indian
    // user and makes the product read as foreign.
    expect(formatPaise(10000000n)).toBe("₹1,00,000");
    expect(formatPaise(100000000n)).toBe("₹10,00,000");
    expect(formatPaise(1000000000n)).toBe("₹1,00,00,000");
  });

  it("handles zero", () => {
    expect(formatPaise(0n)).toBe("₹0");
  });

  it("handles the sanity ceiling without losing precision", () => {
    // 100 crore rupees. The point of bigint: this stays exact.
    expect(formatPaise(MAX_AMOUNT_PAISE)).toBe("₹1,00,00,00,000");
  });

  it("formats negatives with the sign outside the symbol", () => {
    expect(formatPaise(-125000n)).toBe("-₹1,250");
  });

  it("renders lakh and crore in compact mode", () => {
    expect(formatPaise(10000000n, { compact: true })).toBe("₹1L");
    expect(formatPaise(12500000n, { compact: true })).toBe("₹1.25L");
    expect(formatPaise(1000000000n, { compact: true })).toBe("₹1Cr");
  });

  it("leaves small values alone in compact mode", () => {
    expect(formatPaise(125000n, { compact: true })).toBe("₹1,250");
  });
});

describe("parseRupeesToPaise", () => {
  it("parses plain rupees", () => {
    expect(parseRupeesToPaise("1250")).toBe(125000n);
  });

  it("parses rupees and paise", () => {
    expect(parseRupeesToPaise("1250.50")).toBe(125050n);
  });

  it("pads a single decimal place", () => {
    expect(parseRupeesToPaise("1250.5")).toBe(125050n);
  });

  it("tolerates grouping commas and a leading symbol", () => {
    expect(parseRupeesToPaise("₹1,250.50")).toBe(125050n);
  });

  it("rejects more than two decimal places rather than rounding", () => {
    // Silently turning ₹10.999 into ₹11.00 is how a rounding dispute starts.
    expect(parseRupeesToPaise("10.999")).toBeNull();
  });

  it("rejects zero and negatives", () => {
    expect(parseRupeesToPaise("0")).toBeNull();
    expect(parseRupeesToPaise("-10")).toBeNull();
  });

  it("rejects anything above the sanity ceiling", () => {
    expect(parseRupeesToPaise("10000000000")).toBeNull();
  });

  it("rejects text, empty input and scientific notation", () => {
    expect(parseRupeesToPaise("abc")).toBeNull();
    expect(parseRupeesToPaise("")).toBeNull();
    expect(parseRupeesToPaise("1e5")).toBeNull();
  });

  it("round-trips through formatPaise", () => {
    for (const input of ["1", "999", "1250.50", "100000", "9999999.99"]) {
      const paise = parseRupeesToPaise(input);
      expect(paise, `failed on ${input}`).not.toBeNull();
      expect(parseRupeesToPaise(formatPaise(paise!, { paise: true }))).toBe(
        paise,
      );
    }
  });
});
