import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import {
  getListing,
  getBidHistory,
  getServerNow,
  displayPricePaise,
  hasBids,
  CONDITION_LABELS,
} from "@/lib/listings";
import { formatPaise } from "@/lib/money";
import { minimumNextBid } from "@/lib/auction/increments";
import { ListingImage } from "@/components/listing-image";
import { Countdown } from "@/components/countdown";
import { Button } from "@/components/ui/button";
import { formatAbsolute } from "@/lib/time";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const listing = await getListing(id);
  if (!listing) return { title: "Listing not found" };

  return {
    title: listing.title,
    // Truncated, and taken from the seller's own description — which is
    // user-controlled text. React escapes it on render; this only reaches a
    // meta tag, which Next also escapes.
    description: listing.description.slice(0, 155),
  };
}

export default async function ListingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [listing, serverNow] = await Promise.all([
    getListing(id),
    getServerNow(),
  ]);

  // RLS decides this, not a filter in application code. A draft or
  // pending-review listing simply is not returned to an anonymous caller, so
  // this 404 is the database's answer rather than ours.
  if (!listing) notFound();

  const bids = await getBidHistory(id);

  const price = displayPricePaise(listing);
  const bidded = hasBids(listing);
  const nextBid = minimumNextBid(
    BigInt(listing.starting_price),
    listing.current_price === null ? null : BigInt(listing.current_price),
    BigInt(listing.bid_increment),
  );

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <nav aria-label="Breadcrumb" className="text-muted-foreground text-sm">
        <Link href="/" className="hover:text-foreground transition-colors">
          All auctions
        </Link>
        {listing.category && (
          <>
            <span className="mx-2 opacity-50">/</span>
            <Link
              href={`/categories/${listing.category.slug}`}
              className="hover:text-foreground transition-colors"
            >
              {listing.category.name}
            </Link>
          </>
        )}
      </nav>

      <div className="mt-6 grid gap-8 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <div className="bg-muted aspect-[4/3] overflow-hidden rounded-lg border">
            <ListingImage
              listingId={listing.id}
              title={listing.title}
              className="h-full w-full object-cover"
              priority
            />
          </div>

          <section className="mt-8">
            <h2 className="text-sm font-semibold tracking-wide uppercase">
              Description
            </h2>
            {/*
              Rendered as text, never as HTML. This is seller-supplied content
              and dangerouslySetInnerHTML here would be a stored XSS hole.
              whitespace-pre-line preserves the seller's line breaks without
              interpreting anything.
            */}
            <p className="text-muted-foreground mt-3 leading-relaxed whitespace-pre-line">
              {listing.description}
            </p>
          </section>
        </div>

        <div className="lg:sticky lg:top-24 lg:self-start">
          <h1 className="text-2xl leading-tight font-semibold tracking-tight">
            {listing.title}
          </h1>

          <dl className="text-muted-foreground mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <div className="flex gap-1.5">
              <dt className="sr-only">Condition</dt>
              <dd>{CONDITION_LABELS[listing.condition] ?? listing.condition}</dd>
            </div>
            <span aria-hidden="true" className="opacity-40">
              ·
            </span>
            <div className="flex gap-1.5">
              <dt className="sr-only">Seller</dt>
              {/*
                The handle, and nothing else. There is no seller name, no
                rating, no contact route, and no message button before an order
                exists — see docs/COMPLIANCE.md §5 on the anonymity model.
              */}
              <dd className="font-mono text-xs">
                {listing.seller_handle ?? "seller"}
              </dd>
            </div>
          </dl>

          <div className="bg-card mt-6 rounded-lg border p-5">
            <p className="text-muted-foreground text-xs">
              {bidded ? "Current bid" : "Starting bid"}
            </p>
            <p className="mt-1 text-3xl font-semibold tabular-nums">
              {formatPaise(price)}
            </p>
            <p className="text-muted-foreground mt-1 text-sm">
              {listing.bid_count} {listing.bid_count === 1 ? "bid" : "bids"}
              <span className="mx-2 opacity-40">·</span>
              next bid {formatPaise(nextBid)} or more
            </p>

            {/*
              ends_at is nullable because a draft has no end time. A CHECK
              constraint guarantees a live listing has one; the type cannot know
              that, so this branches rather than asserting.
            */}
            {listing.ends_at && (
              <>
                <div className="mt-4 flex items-baseline justify-between border-t pt-4">
                  <span className="text-muted-foreground text-sm">Ends in</span>
                  <Countdown
                    serverNow={serverNow}
                    endsAt={listing.ends_at}
                    className="text-lg font-medium"
                  />
                </div>
                <p className="text-muted-foreground/70 mt-1 text-right text-xs">
                  {formatAbsolute(listing.ends_at)} IST
                </p>
              </>
            )}

            {/*
              Phase 4 replaces this with the live bid panel. Until then it links
              to sign-in, which is the honest behaviour: bidding requires an
              account and a completed identity check.
            */}
            <Button asChild className="mt-5 w-full" size="lg">
              <Link href={`/login?next=/listings/${listing.id}`}>
                Sign in to bid
              </Link>
            </Button>

            <p className="text-muted-foreground mt-3 text-center text-xs leading-relaxed">
              Bidding opens in a later build phase. Browsing needs no account.
            </p>
          </div>

          {listing.reserve_price !== null && (
            <p className="text-muted-foreground mt-3 text-xs leading-relaxed">
              This listing has a reserve price. If bidding ends below it, the
              item does not sell.
            </p>
          )}

          <section className="mt-8">
            <h2 className="text-sm font-semibold tracking-wide uppercase">
              Bid history
            </h2>
            {bids.length === 0 ? (
              <p className="text-muted-foreground mt-3 text-sm">
                No bids yet. The first bid may equal the starting price.
              </p>
            ) : (
              <ol className="mt-3 divide-y text-sm">
                {bids.map((bid) => (
                  <li
                    key={bid.id}
                    className="flex items-center justify-between py-2"
                  >
                    {/* Handles only. public_bids does not expose bidder_id. */}
                    <span className="text-muted-foreground font-mono text-xs">
                      {bid.bidder_handle}
                    </span>
                    <span className="font-medium tabular-nums">
                      {formatPaise(BigInt(bid.amount ?? 0))}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
