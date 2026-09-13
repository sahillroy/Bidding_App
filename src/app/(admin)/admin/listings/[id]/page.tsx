import { notFound } from "next/navigation";
import Link from "next/link";
import { getAdminListing } from "@/lib/listings/admin";
import { formatPaise } from "@/lib/money";
import { formatDuration } from "@/lib/validation/listing";
import { CONDITION_LABELS } from "@/lib/listings";
import { ReviewForm } from "@/components/admin/review-form";
import { ListingImage } from "@/components/listing-image";

export const metadata = { title: "Review listing" };
export const dynamic = "force-dynamic";

export default async function AdminListingReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const listing = await getAdminListing(id);
  if (!listing) notFound();

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <p className="text-muted-foreground text-sm">
        <Link href="/admin/listings" className="underline">
          Listing approval
        </Link>
      </p>

      <div className="mt-6 grid gap-10 lg:grid-cols-[1.2fr_1fr]">
        <div>
          {listing.images.length === 0 ? (
            <div className="bg-muted aspect-[4/3] overflow-hidden rounded-lg border">
              <ListingImage
                listingId={listing.id}
                title={listing.title}
                className="h-full w-full object-cover"
              />
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {listing.images.map((image) => (
                <div
                  key={image.id}
                  className="bg-muted aspect-[4/3] overflow-hidden rounded-lg border"
                >
                  <ListingImage
                    listingId={listing.id}
                    title={listing.title}
                    src={image.url}
                    className="h-full w-full object-cover"
                  />
                </div>
              ))}
            </div>
          )}

          <h1 className="mt-6 text-2xl font-semibold tracking-tight">
            {listing.title}
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            {listing.category_name ?? "Uncategorised"}
            <span className="mx-1.5 opacity-40">·</span>
            {CONDITION_LABELS[listing.condition] ?? listing.condition}
            <span className="mx-1.5 opacity-40">·</span>
            <span className="font-mono text-xs">
              {listing.seller_handle ?? "seller"}
            </span>
          </p>
          <p className="text-muted-foreground mt-4 whitespace-pre-line text-sm leading-relaxed">
            {listing.description}
          </p>
        </div>

        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <div className="bg-card rounded-lg border p-5">
            <p className="text-muted-foreground text-xs">Starting price</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {formatPaise(BigInt(listing.starting_price))}
            </p>
            <dl className="text-muted-foreground mt-4 space-y-2 text-xs">
              <div className="flex justify-between gap-4">
                <dt>Reserve</dt>
                <dd>
                  {listing.reserve_price === null
                    ? "None"
                    : formatPaise(BigInt(listing.reserve_price))}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>Increment</dt>
                <dd>{formatPaise(BigInt(listing.bid_increment))}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>Duration</dt>
                <dd>{formatDuration(listing.duration_seconds)}</dd>
              </div>
            </dl>
          </div>

          {listing.sanity.flagged && (
            <div className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border px-4 py-3 text-sm leading-relaxed">
              <p className="font-semibold">Price sanity flag</p>
              <p className="mt-1">{listing.sanity.reason}</p>
            </div>
          )}

          {listing.status === "pending_review" ? (
            <ReviewForm listingId={listing.id} />
          ) : (
            <p className="text-muted-foreground text-sm">
              This listing is no longer pending. Status: {listing.status}.
            </p>
          )}
        </aside>
      </div>
    </main>
  );
}
