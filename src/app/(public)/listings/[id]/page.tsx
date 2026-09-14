import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import {
  getListing,
  getBidHistory,
  getServerNow,
  CONDITION_LABELS,
} from "@/lib/listings";
import { formatPaise } from "@/lib/money";
import { ListingImage } from "@/components/listing-image";
import { Countdown } from "@/components/countdown";
import { formatAbsolute } from "@/lib/time";
import { BidPanel } from "@/components/bid/bid-panel";
import { getBidViewerState } from "@/lib/auction/viewer";

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

  const [bids, viewer] = await Promise.all([
    getBidHistory(id),
    getBidViewerState(id, listing.seller_id),
  ]);

  return (
    <main className="mx-auto max-w-[1200px] px-5 pb-24 sm:px-10">
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-2.5 py-6 text-[12.5px] text-[var(--bk-subtle)]"
      >
        <Link
          href="/"
          className="transition-colors duration-200 hover:text-foreground"
        >
          All auctions
        </Link>
        {listing.category && (
          <>
            <span aria-hidden="true" className="opacity-50">
              /
            </span>
            <Link
              href={`/categories/${listing.category.slug}`}
              className="transition-colors duration-200 hover:text-foreground"
            >
              {listing.category.name}
            </Link>
          </>
        )}
      </nav>

      <div className="grid gap-10 lg:grid-cols-[1.25fr_1fr] lg:gap-12">
        {/* ---------------- LEFT: artwork and description ---------------- */}
        <div>
          <div className="group relative aspect-[4/3] overflow-hidden rounded-xl border border-border bg-card">
            <ListingImage
              listingId={listing.id}
              title={listing.title}
              src={listing.images[0]?.url ?? listing.coverUrl}
              className="h-full w-full object-cover transition-transform duration-[600ms] ease-[var(--bk-ease)] group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
              priority
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,rgba(10,12,15,0.55),transparent_45%)]"
            />
          </div>
          {listing.images.length > 1 && (
            <ul className="mt-3 grid grid-cols-4 gap-2">
              {listing.images.slice(1).map((image) => (
                <li
                  key={image.id}
                  className="bg-muted aspect-[4/3] overflow-hidden rounded-md border"
                >
                  <ListingImage
                    listingId={listing.id}
                    title={listing.title}
                    src={image.url}
                    className="h-full w-full object-cover"
                  />
                </li>
              ))}
            </ul>
          )}

          <section className="mt-10">
            <h2 className="text-[10px] font-semibold tracking-[0.12em] text-[var(--bk-subtle)] uppercase">
              Description
            </h2>
            {/*
              Rendered as text, never as HTML. This is seller-supplied content
              and dangerouslySetInnerHTML here would be a stored XSS hole.
              whitespace-pre-line preserves the seller's line breaks without
              interpreting anything.
            */}
            <p className="mt-4 max-w-[62ch] leading-[1.72] whitespace-pre-line text-[#B4BAC3]">
              {listing.description}
            </p>

            <dl className="mt-8 grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-[var(--bk-line)] bg-[var(--bk-line)] sm:grid-cols-3">
              <Fact label="Condition">
                {CONDITION_LABELS[listing.condition] ?? listing.condition}
              </Fact>
              <Fact label="Category">{listing.category?.name ?? "—"}</Fact>
              {/*
                The handle, and nothing else. There is no seller name, no
                rating, no contact route and no message button — messaging does
                not unlock until an order exists. See docs/COMPLIANCE.md §5.
              */}
              <Fact label="Seller" mono>
                {listing.seller_handle ?? "seller"}
              </Fact>
            </dl>
          </section>
        </div>

        {/* ---------------- RIGHT: the bid panel ---------------- */}
        <div className="lg:sticky lg:top-24 lg:self-start">
          <h1 className="font-[family-name:var(--font-display)] text-[30px] leading-[1.16] tracking-[-0.01em] sm:text-[33px]">
            {listing.title}
          </h1>

          {/*
            The countdown is its own block above the panel. It is server-
            anchored: `serverNow` comes from the DATABASE clock, and the browser
            only corrects for its own skew and animates. Whether a bid arrived
            in time is decided inside place_bid, never here.
          */}
          {listing.ends_at && (
            <div className="mt-6 flex items-center justify-between rounded-xl border border-border bg-[#0C0F14] px-[22px] py-4">
              <div>
                <div className="text-[10px] font-semibold tracking-[0.12em] text-[var(--bk-subtle)] uppercase">
                  Ends in
                </div>
                <Countdown
                  serverNow={serverNow}
                  endsAt={listing.ends_at}
                  className="mt-1.5 block font-mono text-[23px] font-medium tracking-[-0.01em]"
                />
              </div>
              <div className="text-right text-[11.5px] leading-[1.55] text-[var(--bk-subtle)]">
                {formatAbsolute(listing.ends_at)}
                <br />
                IST
              </div>
            </div>
          )}

          <div className="mt-4">
            <BidPanel
              listingId={listing.id}
              startingPricePaise={listing.starting_price}
              currentPricePaise={listing.current_price}
              bidIncrementPaise={listing.bid_increment}
              bidCount={listing.bid_count}
              viewer={viewer}
            />
          </div>

          {listing.reserve_price !== null && (
            <p className="mt-3 text-[11.5px] leading-relaxed text-[var(--bk-subtle)]">
              This listing has a reserve price. If bidding ends below it, the
              item does not sell.
            </p>
          )}

          <section className="mt-8">
            <div className="flex items-baseline justify-between">
              <h2 className="text-[10px] font-semibold tracking-[0.12em] text-[var(--bk-subtle)] uppercase">
                Bid history
              </h2>
              <span className="text-[11.5px] text-[var(--bk-subtle)]">
                Handles only
              </span>
            </div>

            {bids.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                No bids yet. The first bid may equal the starting price.
              </p>
            ) : (
              <ol className="mt-3">
                {bids.map((bid) => (
                  <li
                    key={bid.id}
                    className="flex items-center justify-between border-b border-[var(--bk-line)] px-0.5 py-2.5 text-sm transition-[background-color,padding-left] duration-200 ease-[var(--bk-ease)] last:border-b-0 hover:bg-[#0E1116] hover:pl-2.5"
                  >
                    {/* Handles only. public_bids does not expose bidder_id. */}
                    <span className="tnum font-mono text-[12.5px] text-muted-foreground">
                      {bid.bidder_handle}
                    </span>
                    <span className="tnum font-mono font-medium">
                      {formatPaise(BigInt(bid.amount ?? 0))}
                    </span>
                  </li>
                ))}
              </ol>
            )}

            <p className="mt-4 text-[11.5px] leading-[1.65] text-[var(--bk-subtle)]">
              The bid record is append-only and is never edited. It is the
              evidence if a result is ever disputed.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}

function Fact({
  label,
  children,
  mono = false,
}: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="bg-[#0C0F14] px-[18px] py-4">
      <dt className="text-[10px] font-semibold tracking-[0.12em] text-[var(--bk-subtle)] uppercase">
        {label}
      </dt>
      <dd
        className={
          mono
            ? "mt-1.5 font-mono text-[13px] text-muted-foreground"
            : "mt-1.5 text-sm"
        }
      >
        {children}
      </dd>
    </div>
  );
}
