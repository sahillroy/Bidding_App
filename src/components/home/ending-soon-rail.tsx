import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ListingImage } from "@/components/listing-image";
import { PhotoCycler } from "@/components/photo-cycler";
import { Countdown } from "@/components/countdown";
import { formatPaise } from "@/lib/money";
import { displayPricePaise, hasBids } from "@/lib/listings";
import type { HomeListing } from "@/lib/home";

/**
 * Act two: what is about to close.
 *
 * A horizontal rail rather than another grid, for two reasons. It reads as a
 * different kind of content — a running feed rather than a catalogue — so the
 * page has rhythm instead of three identical sections. And scrolling sideways
 * is the gesture that suits "a queue of things about to happen".
 *
 * Native overflow scrolling with scroll-snap: no carousel library, no JS, and
 * it works with a trackpad, a shift-wheel, a touch swipe and a keyboard.
 */
export function EndingSoonRail({
  listings,
  serverNow,
}: {
  listings: HomeListing[];
  serverNow: string;
}) {
  if (listings.length === 0) return null;

  return (
    <section
      aria-label="Auctions ending soon"
      className="border-b border-[var(--bk-line)] py-12 sm:py-14"
    >
      <div className="mx-auto flex max-w-[1400px] items-end justify-between gap-6 px-5 sm:px-10">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-[26px] leading-tight tracking-[-0.015em] sm:text-[30px]">
            Closing soonest
          </h2>
          <p className="mt-1.5 text-[13px] text-muted-foreground">
            Hover a lot to see it from every angle
          </p>
        </div>
        <Link
          href="/"
          className="group hidden shrink-0 items-center gap-2 text-[13px] text-muted-foreground transition-colors duration-200 hover:text-[var(--bk-accent-bright)] sm:inline-flex"
        >
          All auctions
          <ArrowRight className="size-3.5 transition-transform duration-300 group-hover:translate-x-1 motion-reduce:transition-none" />
        </Link>
      </div>

      {/* The negative margin plus matching padding lets the first card sit on
          the page gutter while the rail itself still bleeds to both edges, so
          cards scroll off-screen instead of stopping at a container wall. */}
      <div className="mt-7 overflow-x-auto pb-3 [scrollbar-width:thin] [-webkit-overflow-scrolling:touch] [scroll-snap-type:x_mandatory]">
        <ul className="mx-auto flex w-max max-w-none items-stretch gap-4 px-5 sm:px-10">
          {listings.map((listing) => (
            <li
              key={listing.id}
              // flex + h-full so a two-line title does not make one card
              // taller than its neighbours and break the rail's baseline.
              className="flex w-[248px] shrink-0 [scroll-snap-align:start]"
            >
              <RailCard listing={listing} serverNow={serverNow} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function RailCard({
  listing,
  serverNow,
}: {
  listing: HomeListing;
  serverNow: string;
}) {
  const price = displayPricePaise(listing);
  const bidded = hasBids(listing);
  const multiple = listing.images.length > 1;

  return (
    <Link
      href={`/listings/${listing.id}`}
      data-tilt
      className="group relative flex h-full w-full flex-col overflow-hidden rounded-[10px] border border-border bg-card outline-none transition-[border-color,box-shadow,transform] duration-300 ease-[var(--bk-ease)] hover:-translate-y-1 hover:border-[var(--bk-accent)] hover:shadow-[0_0_0_1px_rgba(62,123,250,0.4),0_18px_40px_-18px_rgba(62,123,250,0.55)] focus-visible:border-[var(--bk-accent)] focus-visible:ring-2 focus-visible:ring-[var(--bk-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      <div className="relative aspect-[4/3] overflow-hidden">
        {multiple ? (
          <PhotoCycler
            images={listing.images}
            alt={listing.title}
            className="h-full w-full"
          />
        ) : (
          <ListingImage
            listingId={listing.id}
            title={listing.title}
            src={listing.images[0] ?? null}
            className="h-full w-full object-cover transition-transform duration-[520ms] ease-[var(--bk-ease)] group-hover:scale-[1.06] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          />
        )}

        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-[2] bg-[linear-gradient(to_top,rgba(10,12,15,0.9),transparent_55%)]"
        />

        {/* Mirrors the `video` badge idea from the reference, but honest about
            what it is: this lot has several photographs, not a film. */}
        {multiple && (
          <span className="absolute top-2.5 left-2.5 z-[4] rounded-[5px] border border-white/15 bg-black/55 px-2 py-1 font-mono text-[10px] tracking-[0.06em] text-white/85 uppercase backdrop-blur-sm">
            {listing.images.length} photos
          </span>
        )}

        {listing.ends_at && (
          <div className="absolute inset-x-2.5 bottom-2.5 z-[4] flex items-center justify-between">
            <Countdown
              serverNow={serverNow}
              endsAt={listing.ends_at}
              className="font-mono text-[12.5px] font-medium text-white"
            />
            <span className="tnum font-mono text-[11px] text-white/60">
              {listing.bid_count} {listing.bid_count === 1 ? "bid" : "bids"}
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col p-3.5">
        <h3 className="line-clamp-2 text-[13.5px] leading-snug font-medium text-[#C9CDD4] transition-colors duration-200 group-hover:text-white">
          {listing.title}
        </h3>
        <div className="mt-auto pt-2.5">
          <div className="text-[10px] tracking-[0.1em] text-[var(--bk-subtle)] uppercase">
            {bidded ? "Current bid" : "Starting bid"}
          </div>
          <div className="tnum mt-0.5 font-mono text-[18px] font-medium tracking-[-0.02em]">
            {formatPaise(price)}
          </div>
        </div>
      </div>
    </Link>
  );
}
