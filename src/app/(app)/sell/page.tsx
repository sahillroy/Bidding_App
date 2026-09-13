import Link from "next/link";
import { getMyListings, STATUS_LABELS } from "@/lib/listings/seller";
import { formatPaise } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { deleteDraft } from "./actions";

export const metadata = { title: "Your listings" };
export const dynamic = "force-dynamic";

export default async function SellIndexPage() {
  const listings = await getMyListings();

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your listings</h1>
          <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">
            Drafts stay private. Nothing reaches the public catalogue until an
            administrator approves it.
          </p>
        </div>
        <Button asChild>
          <Link href="/sell/new">List an item</Link>
        </Button>
      </div>

      {listings.length === 0 ? (
        <p className="text-muted-foreground mt-16 text-center text-sm">
          You have not listed anything yet.
        </p>
      ) : (
        <ul className="mt-8 divide-y rounded-lg border">
          {listings.map((listing) => {
            const href =
              listing.status === "draft" || listing.status === "rejected"
                ? `/sell/${listing.id}`
                : listing.status === "live"
                  ? `/listings/${listing.id}`
                  : `/sell/${listing.id}`;

            return (
              <li
                key={listing.id}
                className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <Link href={href} className="font-medium hover:underline">
                    {listing.title}
                  </Link>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {STATUS_LABELS[listing.status] ?? listing.status}
                    <span className="mx-1.5 opacity-40">·</span>
                    {formatPaise(BigInt(listing.starting_price))}
                  </p>
                  {listing.status === "rejected" && listing.review_note && (
                    <p className="text-destructive mt-2 text-xs leading-relaxed">
                      {listing.review_note}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {(listing.status === "draft" ||
                    listing.status === "rejected") && (
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/sell/${listing.id}`}>Continue</Link>
                    </Button>
                  )}
                  {listing.status === "draft" && (
                    <form action={deleteDraft}>
                      <input type="hidden" name="listingId" value={listing.id} />
                      <Button type="submit" size="sm" variant="ghost">
                        Delete
                      </Button>
                    </form>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
