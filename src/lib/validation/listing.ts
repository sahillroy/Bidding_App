import { z } from "zod";
import { parseRupeesToPaise } from "@/lib/money";
import { incrementForPrice } from "@/lib/auction/increments";

/**
 * Listing wizard schemas, shared between the form and the Server Actions.
 *
 * The same objects are imported on both sides. Client-side checks are a
 * convenience; a Server Action is a public HTTP endpoint, so every field is
 * re-validated here. See CLAUDE.md conventions.
 *
 * Money arrives as a rupee string ("1,250.50") and is parsed to paise. The
 * increment is never taken from the client — it is derived from the starting
 * price using the §6.2 bands, then stored on the row.
 */

export const CONDITIONS = [
  "new",
  "like_new",
  "good",
  "fair",
  "for_parts",
] as const;

export type ListingCondition = (typeof CONDITIONS)[number];

export const DURATION_MIN_SECONDS = 3600;
export const DURATION_MAX_SECONDS = 2_592_000; // 30 days

export const DURATION_PRESETS = [
  { seconds: 3_600, label: "1 hour" },
  { seconds: 21_600, label: "6 hours" },
  { seconds: 86_400, label: "1 day" },
  { seconds: 259_200, label: "3 days" },
  { seconds: 604_800, label: "7 days" },
  { seconds: 1_209_600, label: "14 days" },
  { seconds: 2_592_000, label: "30 days" },
] as const;

const uuidSchema = z.string().uuid("Pick a category from the list");

export const listingDetailsSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, "Title needs at least 3 characters")
    .max(120, "Title must be 120 characters or fewer"),
  description: z
    .string()
    .min(10, "Description needs at least 10 characters")
    .max(5000, "Description must be 5,000 characters or fewer"),
  categoryId: uuidSchema,
  condition: z.enum(CONDITIONS, {
    error: "Pick a condition",
  }),
});

const rupeeField = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .refine((value) => parseRupeesToPaise(value) !== null, {
      message: `${label} must be a positive amount with at most two decimal places`,
    });

export const listingPricingSchema = z
  .object({
    startingPrice: rupeeField("Starting price"),
    reservePrice: z.string().trim().optional(),
  })
  .superRefine((data, ctx) => {
    const start = parseRupeesToPaise(data.startingPrice);
    if (start === null) return;

    const reserveRaw = data.reservePrice?.trim() ?? "";
    if (reserveRaw === "") return;

    const reserve = parseRupeesToPaise(reserveRaw);
    if (reserve === null) {
      ctx.addIssue({
        code: "custom",
        path: ["reservePrice"],
        message:
          "Reserve must be a positive amount with at most two decimal places",
      });
      return;
    }

    if (reserve < start) {
      ctx.addIssue({
        code: "custom",
        path: ["reservePrice"],
        message: "Reserve cannot be below the starting price",
      });
    }
  });

export const listingDurationSchema = z.object({
  durationSeconds: z.coerce
    .number()
    .int("Duration must be a whole number of seconds")
    .min(
      DURATION_MIN_SECONDS,
      "Auctions must run for at least one hour",
    )
    .max(
      DURATION_MAX_SECONDS,
      "Auctions cannot run longer than 30 days",
    ),
});

export const listingIdSchema = z.string().uuid("That listing id is not valid");

export type ListingDetailsInput = z.infer<typeof listingDetailsSchema>;
export type ListingPricingInput = z.infer<typeof listingPricingSchema>;
export type ListingDurationInput = z.infer<typeof listingDurationSchema>;

export function formatDuration(seconds: number): string {
  if (seconds % 86_400 === 0) {
    const days = seconds / 86_400;
    return days === 1 ? "1 day" : `${days} days`;
  }
  if (seconds % 3_600 === 0) {
    const hours = seconds / 3_600;
    return hours === 1 ? "1 hour" : `${hours} hours`;
  }
  return `${seconds} seconds`;
}

/** Derive the stored increment. Never trust a client-supplied one. */
export function incrementFromStartingPaise(startingPaise: bigint): bigint {
  return incrementForPrice(startingPaise);
}
