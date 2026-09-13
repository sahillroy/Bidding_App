import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
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

          <div className="mt-6 overflow-hidden rounded-xl border border-border bg-card">
            <div className="p-[22px_22px_20px]">
              <div className="text-[10px] font-semibold tracking-[0.12em] text-[var(--bk-subtle)] uppercase">
                {bidded ? "Current bid" : "Starting bid"}
              </div>
              <div className="mt-2 flex flex-wrap items-baseline gap-3">
                <span className="tnum font-mono text-[40px] leading-none font-medium tracking-[-0.03em]">
                  {formatPaise(price)}
                </span>
                {/* Green reads as "rising" — right for a climbing bid count,
                    wrong for an auction nobody has entered yet. */}
                <span
                  className={
                    bidded
                      ? "tnum font-mono text-[13px] text-[#3FBF8F]"
                      : "tnum font-mono text-[13px] text-[var(--bk-subtle)]"
                  }
                >
                  {bidded
                    ? `▲ ${listing.bid_count} ${listing.bid_count === 1 ? "bid" : "bids"}`
                    : "no bids yet"}
                </span>
              </div>
              <p className="mt-2.5 text-[12.5px] text-muted-foreground">
                Next bid{" "}
                <span className="tnum font-mono text-foreground">
                  {formatPaise(nextBid)}
                </span>{" "}
                or more
                <span className="text-[var(--bk-subtle)]">
                  {" "}
                  · {formatPaise(BigInt(listing.bid_increment))} increment
                </span>
              </p>
            </div>

            {/*
              ends_at is nullable because a draft has no end time. A CHECK
              constraint guarantees a live listing has one; the type cannot know
              that, so this branches rather than asserting.
            */}
            {listing.ends_at && (
              <div className="flex items-center justify-between border-y border-[var(--bk-line)] bg-[#0C0F14] px-[22px] py-4">
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

            <div className="p-[20px_22px_22px]">
              {/*
                Phase 4 replaces this with the live bid panel. Until then it
                links to sign-in, which is the honest behaviour: bidding
                requires an account and a completed identity check.
              */}
              <Link
                href={`/login?next=/listings/${listing.id}`}
                className="group flex w-full items-center justify-center gap-2.5 rounded-[9px] bg-[var(--bk-accent)] px-5 py-[15px] text-[14.5px] font-bold tracking-[-0.005em] text-[#04070D] shadow-[0_8px_26px_-10px_rgba(62,123,250,0.75)] outline-none transition-[background-color,transform,box-shadow] duration-200 ease-[var(--bk-ease)] hover:-translate-y-0.5 hover:bg-[var(--bk-accent-bright)] hover:shadow-[0_14px_34px_-10px_rgba(96,152,255,0.85)] focus-visible:ring-2 focus-visible:ring-[var(--bk-accent-bright)] focus-visible:ring-offset-2 focus-visible:ring-offset-background active:translate-y-0 active:bg-[var(--bk-accent-deep)] motion-reduce:transition-none motion-reduce:hover:translate-y-0"
              >
                Sign in to bid
                <ArrowRight className="size-4 transition-transform duration-300 ease-[var(--bk-ease)] group-hover:translate-x-1 motion-reduce:transition-none" />
              </Link>
              <p className="mt-3 text-center text-[11.5px] leading-[1.6] text-[var(--bk-subtle)]">
                Bidding needs an account and a completed identity check.
                Browsing needs neither.
              </p>
            </div>
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
