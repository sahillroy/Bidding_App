import { describe, it, expect } from "vitest";
import {
  DURATION_MAX_SECONDS,
  DURATION_MIN_SECONDS,
  incrementFromStartingPaise,
  listingDetailsSchema,
  listingDurationSchema,
  listingPricingSchema,
} from "@/lib/validation/listing";

describe("listingDetailsSchema", () => {
  const valid = {
    title: "Canon EOS 200D",
    description: "A working camera with the kit lens included.",
    categoryId: "11111111-1111-4111-8111-000000000001",
    condition: "good",
  };

  it("accepts a well-formed listing", () => {
    expect(listingDetailsSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a title that is too short", () => {
    const result = listingDetailsSchema.safeParse({ ...valid, title: "ab" });
    expect(result.success).toBe(false);
  });

  it("rejects a free-text category", () => {
    const result = listingDetailsSchema.safeParse({
      ...valid,
      categoryId: "not-a-category",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown condition", () => {
    const result = listingDetailsSchema.safeParse({
      ...valid,
      condition: "mint",
    });
    expect(result.success).toBe(false);
  });
});

describe("listingPricingSchema", () => {
  it("parses Indian-formatted rupees", () => {
    const result = listingPricingSchema.safeParse({
      startingPrice: "1,250.50",
      reservePrice: "",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a reserve below the starting price", () => {
    const result = listingPricingSchema.safeParse({
      startingPrice: "1000",
      reservePrice: "500",
    });
    expect(result.success).toBe(false);
  });

  it("rejects more than two decimal places rather than rounding", () => {
    const result = listingPricingSchema.safeParse({
      startingPrice: "10.999",
      reservePrice: "",
    });
    expect(result.success).toBe(false);
  });
});

describe("listingDurationSchema", () => {
  it("accepts the one-hour minimum and the 30-day maximum", () => {
    expect(
      listingDurationSchema.safeParse({
        durationSeconds: DURATION_MIN_SECONDS,
      }).success,
    ).toBe(true);
    expect(
      listingDurationSchema.safeParse({
        durationSeconds: DURATION_MAX_SECONDS,
      }).success,
    ).toBe(true);
  });

  it("rejects a 59-minute auction", () => {
    expect(
      listingDurationSchema.safeParse({ durationSeconds: 3599 }).success,
    ).toBe(false);
  });
});

describe("incrementFromStartingPaise", () => {
  it("derives the stored increment from the starting price, not the client", () => {
    expect(incrementFromStartingPaise(400n * 100n)).toBe(10n * 100n);
    expect(incrementFromStartingPaise(10_000n * 100n)).toBe(250n * 100n);
  });
});
