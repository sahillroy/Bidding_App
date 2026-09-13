import { notFound } from "next/navigation";
import Link from "next/link";
import { getCategories } from "@/lib/listings";
import { getMyListing, isEditableStatus, STATUS_LABELS } from "@/lib/listings/seller";
import { ListingWizard } from "@/components/sell/listing-wizard";
import { formatPaise } from "@/lib/money";
import { formatDuration } from "@/lib/validation/listing";

export const metadata = { title: "Listing" };
export const dynamic = "force-dynamic";

export default async function SellerListingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ step?: string }>;
}) {
  const { id } = await params;
  const { step: stepParam } = await searchParams;
  const [listing, categories] = await Promise.all([
    getMyListing(id),
    getCategories(),
  ]);

  if (!listing) notFound();

  if (!isEditableStatus(listing.status)) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-10">
        <p className="text-muted-foreground text-sm">
          <Link href="/sell" className="underline">
            Your listings
          </Link>
        </p>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">
          {listing.title}
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          {STATUS_LABELS[listing.status] ?? listing.status}
          {listing.status === "live" && (
            <>
              {" "}
              · starting {formatPaise(BigInt(listing.starting_price))} ·{" "}
              {formatDuration(listing.duration_seconds)}
            </>
          )}
        </p>
        {listing.status === "pending_review" && (
          <p className="text-muted-foreground mt-4 text-sm leading-relaxed">
            An administrator has this listing. It will not appear in the public
            catalogue until they approve it.
          </p>
        )}
        {listing.status === "live" && (
          <p className="mt-6">
            <Link href={`/listings/${listing.id}`} className="underline">
              View the public listing
            </Link>
          </p>
        )}
      </main>
    );
  }

  const step = Math.min(5, Math.max(1, Number(stepParam) || 1));

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">
        {listing.status === "rejected" ? "Revise listing" : "Edit draft"}
      </h1>
      {listing.status === "rejected" && listing.review_note && (
        <p className="border-destructive/30 bg-destructive/10 text-destructive mt-4 rounded-lg border px-3 py-2 text-sm leading-relaxed">
          {listing.review_note}
        </p>
      )}
      <div className="mt-8">
        <ListingWizard
          listing={listing}
          categories={categories}
          initialStep={step}
        />
      </div>
    </main>
  );
}
