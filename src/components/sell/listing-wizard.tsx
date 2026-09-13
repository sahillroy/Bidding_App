"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  saveDetails,
  saveDuration,
  savePricing,
  submitListing,
  type SellState,
} from "@/app/(app)/sell/actions";
import { Button } from "@/components/ui/button";
import { ImageStep } from "@/components/sell/image-step";
import { formatPaise, parseRupeesToPaise } from "@/lib/money";
import { incrementForPrice } from "@/lib/auction/increments";
import {
  CONDITIONS,
  DURATION_PRESETS,
  formatDuration,
} from "@/lib/validation/listing";
import { CONDITION_LABELS, type CategoryRow } from "@/lib/listings/display";
import {
  imagePublicUrls,
  type SellerListingDetail,
} from "@/lib/listings/seller-view";

const STEPS = ["Details", "Photos", "Pricing", "Duration", "Review"] as const;

const inputClass =
  "border-input bg-background focus-visible:ring-ring w-full rounded-lg border px-3 py-2 text-sm outline-none focus-visible:ring-2";

function paiseToRupeeInput(paise: number | null | undefined): string {
  if (paise === null || paise === undefined) return "";
  const rupees = paise / 100;
  return Number.isInteger(rupees) ? String(rupees) : rupees.toFixed(2);
}

export function ListingWizard({
  listing,
  categories,
  initialStep,
}: {
  listing: SellerListingDetail | null;
  categories: CategoryRow[];
  initialStep: number;
}) {
  const router = useRouter();
  const [step, setStep] = useState(initialStep);
  const listingId = listing?.id ?? null;
  const images = listing ? imagePublicUrls(listing.images) : [];

  const [detailsState, detailsAction, detailsPending] = useActionState<
    SellState,
    FormData
  >(async (prev, formData) => {
    const result = await saveDetails(prev, formData);
    if (!result.error && !result.fieldErrors && listingId) {
      router.refresh();
      setStep(2);
      router.replace(`/sell/${listingId}?step=2`, { scroll: false });
    }
    return result;
  }, {});
  const [pricingState, pricingAction, pricingPending] = useActionState<
    SellState,
    FormData
  >(async (prev, formData) => {
    const result = await savePricing(prev, formData);
    if (!result.error && !result.fieldErrors) {
      router.refresh();
      setStep(4);
      if (listingId) {
        router.replace(`/sell/${listingId}?step=4`, { scroll: false });
      }
    }
    return result;
  }, {});
  const [durationState, durationAction, durationPending] = useActionState<
    SellState,
    FormData
  >(async (prev, formData) => {
    const result = await saveDuration(prev, formData);
    if (!result.error && !result.fieldErrors) {
      router.refresh();
      setStep(5);
      if (listingId) {
        router.replace(`/sell/${listingId}?step=5`, { scroll: false });
      }
    }
    return result;
  }, {});
  const [submitState, submitAction, submitPending] = useActionState<
    SellState,
    FormData
  >(submitListing, {});

  const [startingInput, setStartingInput] = useState(
    paiseToRupeeInput(listing?.starting_price),
  );
  const previewIncrement = useMemo(() => {
    const paise = parseRupeesToPaise(startingInput);
    if (paise === null) return null;
    return incrementForPrice(paise);
  }, [startingInput]);

  function go(next: number) {
    if (!listingId && next > 1) return;
    setStep(next);
    if (listingId) {
      router.replace(`/sell/${listingId}?step=${next}`, { scroll: false });
    }
  }

  return (
    <div>
      <ol className="mb-8 flex flex-wrap gap-2 text-xs">
        {STEPS.map((label, index) => {
          const n = index + 1;
          const enabled = n === 1 || Boolean(listingId);
          const current = n === step;
          return (
            <li key={label}>
              <button
                type="button"
                disabled={!enabled}
                onClick={() => go(n)}
                className={`rounded-full px-3 py-1 ${
                  current
                    ? "bg-foreground text-background"
                    : enabled
                      ? "bg-muted text-foreground"
                      : "bg-muted text-muted-foreground/50"
                }`}
              >
                {n}. {label}
              </button>
            </li>
          );
        })}
      </ol>

      {step === 1 && (
        <form action={detailsAction} className="space-y-4">
          {listingId && <input type="hidden" name="listingId" value={listingId} />}

          <Field label="Title" htmlFor="title" error={detailsState.fieldErrors?.title}>
            <input
              id="title"
              name="title"
              required
              maxLength={120}
              defaultValue={listing?.title ?? ""}
              className={inputClass}
            />
          </Field>

          <Field
            label="Description"
            htmlFor="description"
            error={detailsState.fieldErrors?.description}
          >
            <textarea
              id="description"
              name="description"
              required
              minLength={10}
              maxLength={5000}
              rows={6}
              defaultValue={listing?.description ?? ""}
              className={inputClass}
            />
          </Field>

          <Field
            label="Category"
            htmlFor="categoryId"
            error={detailsState.fieldErrors?.categoryId}
          >
            <select
              id="categoryId"
              name="categoryId"
              required
              defaultValue={listing?.category_id ?? ""}
              className={inputClass}
            >
              <option value="" disabled>
                Choose a category
              </option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Condition"
            htmlFor="condition"
            error={detailsState.fieldErrors?.condition}
          >
            <select
              id="condition"
              name="condition"
              required
              defaultValue={listing?.condition ?? "good"}
              className={inputClass}
            >
              {CONDITIONS.map((value) => (
                <option key={value} value={value}>
                  {CONDITION_LABELS[value]}
                </option>
              ))}
            </select>
          </Field>

          <FormError message={detailsState.error} />

          <div className="flex justify-end">
            <Button type="submit" disabled={detailsPending}>
              {detailsPending
                ? "Saving…"
                : listingId
                  ? "Save and continue"
                  : "Create draft and continue"}
            </Button>
          </div>
        </form>
      )}

      {step === 2 && listingId && (
        <div className="space-y-6">
          <ImageStep listingId={listingId} images={images} />
          <div className="flex justify-between">
            <Button type="button" variant="outline" onClick={() => go(1)}>
              Back
            </Button>
            <Button type="button" onClick={() => go(3)}>
              Continue
            </Button>
          </div>
        </div>
      )}

      {step === 3 && listingId && (
        <form action={pricingAction} className="space-y-4">
          <input type="hidden" name="listingId" value={listingId} />

          <Field
            label="Starting price (₹)"
            htmlFor="startingPrice"
            error={pricingState.fieldErrors?.startingPrice}
          >
            <input
              id="startingPrice"
              name="startingPrice"
              inputMode="decimal"
              required
              value={startingInput}
              onChange={(event) => setStartingInput(event.target.value)}
              className={inputClass}
            />
          </Field>

          <p className="text-muted-foreground text-xs leading-relaxed">
            The bid increment is set from this price and then stored, so a later
            change to the band table cannot rewrite a running auction.{" "}
            {previewIncrement !== null
              ? `Current increment: ${formatPaise(previewIncrement)}.`
              : "Enter a starting price to see the increment."}
          </p>

          <Field
            label="Reserve price (₹), optional"
            htmlFor="reservePrice"
            error={pricingState.fieldErrors?.reservePrice}
          >
            <input
              id="reservePrice"
              name="reservePrice"
              inputMode="decimal"
              defaultValue={paiseToRupeeInput(listing?.reserve_price)}
              className={inputClass}
            />
          </Field>

          <FormError message={pricingState.error} />

          <div className="flex justify-between">
            <Button type="button" variant="outline" onClick={() => go(2)}>
              Back
            </Button>
            <Button type="submit" disabled={pricingPending}>
              {pricingPending ? "Saving…" : "Save and continue"}
            </Button>
          </div>
        </form>
      )}

      {step === 4 && listingId && (
        <form action={durationAction} className="space-y-4">
          <input type="hidden" name="listingId" value={listingId} />
          <p className="text-muted-foreground text-sm">
            Any window from one hour to thirty days. The clock that matters is
            the database clock, not the browser&apos;s.
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {DURATION_PRESETS.map((preset) => (
              <label
                key={preset.seconds}
                className="hover:bg-muted has-[:checked]:border-foreground has-[:checked]:bg-muted flex cursor-pointer items-center justify-center rounded-lg border px-3 py-3 text-sm"
              >
                <input
                  type="radio"
                  name="durationSeconds"
                  value={preset.seconds}
                  defaultChecked={
                    (listing?.duration_seconds ?? 86400) === preset.seconds
                  }
                  className="sr-only"
                />
                {preset.label}
              </label>
            ))}
          </div>
          {durationState.fieldErrors?.durationSeconds && (
            <p className="text-destructive text-xs">
              {durationState.fieldErrors.durationSeconds[0]}
            </p>
          )}
          <FormError message={durationState.error} />
          <div className="flex justify-between">
            <Button type="button" variant="outline" onClick={() => go(3)}>
              Back
            </Button>
            <Button type="submit" disabled={durationPending}>
              {durationPending ? "Saving…" : "Save and continue"}
            </Button>
          </div>
        </form>
      )}

      {step === 5 && listing && (
        <div className="space-y-6">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <ReviewItem label="Title" value={listing.title} />
            <ReviewItem
              label="Category"
              value={
                categories.find((c) => c.id === listing.category_id)?.name ?? "—"
              }
            />
            <ReviewItem
              label="Condition"
              value={CONDITION_LABELS[listing.condition] ?? listing.condition}
            />
            <ReviewItem
              label="Starting price"
              value={formatPaise(BigInt(listing.starting_price))}
            />
            <ReviewItem
              label="Reserve"
              value={
                listing.reserve_price === null
                  ? "None"
                  : formatPaise(BigInt(listing.reserve_price))
              }
            />
            <ReviewItem
              label="Increment"
              value={formatPaise(BigInt(listing.bid_increment))}
            />
            <ReviewItem
              label="Duration"
              value={formatDuration(listing.duration_seconds)}
            />
            <ReviewItem
              label="Photos"
              value={`${listing.images.length} of 8`}
            />
          </dl>

          <p className="text-muted-foreground whitespace-pre-line text-sm leading-relaxed">
            {listing.description}
          </p>

          <p className="text-muted-foreground text-xs leading-relaxed">
            Submitting sends this listing to an administrator. It will not appear
            in the public catalogue until it is approved. That is enforced by
            the database, not by this page.
          </p>

          <FormError message={submitState.error} />

          <form action={submitAction} className="flex justify-between">
            <input type="hidden" name="listingId" value={listing.id} />
            <Button type="button" variant="outline" onClick={() => go(4)}>
              Back
            </Button>
            <Button type="submit" disabled={submitPending}>
              {submitPending ? "Submitting…" : "Submit for review"}
            </Button>
          </form>
        </div>
      )}

      <p className="text-muted-foreground mt-8 text-xs">
        <Link href="/sell" className="underline">
          Back to your listings
        </Link>
      </p>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string[];
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {error && <p className="text-destructive text-xs">{error[0]}</p>}
    </div>
  );
}

function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border px-3 py-2 text-sm"
    >
      {message}
    </p>
  );
}

function ReviewItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  );
}
