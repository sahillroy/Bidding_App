import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ListingImage } from "@/components/listing-image";
import { Countdown } from "@/components/countdown";
import { formatPaise } from "@/lib/money";
import { displayPricePaise, hasBids } from "@/lib/listings";
import type { HomeListing } from "@/lib/home";

/**
 * Act one: the headline lot.
 *
 * Deliberately about 72vh, not a full screen. A marketplace is a utility —
 * someone checking a watchlist for the third time today should see the
 * catalogue peeking below the fold, not a full-height splash between them and
 * the thing they came for. The hero earns attention once; it does not get to
 * demand it on every visit.
 *
 * The photograph drifts slowly behind the type. That drift is the entire
 * "video" effect: a CSS transform on one element, no footage, nothing to
 * download, and it keeps working with the generated gradient placeholder when
 * a lot has no photographs yet.
 */
export function HomeHero({
  listing,
  serverNow,
  stats,
}: {
  listing: HomeListing;
  serverNow: string;
  stats: { live: number; endingWithinHour: number; categories: number };
}) {
  const price = displayPricePaise(listing);
  const bidded = hasBids(listing);
  const cover = listing.images[0] ?? null;

  return (
    <section
      aria-label="Featured auction"
      className="relative min-h-[520px] overflow-hidden border-b border-[var(--bk-line)] lg:h-[72vh]"
    >
      {/* Ken-burns drift. 28 seconds, alternating, so it never snaps back. */}
      <div className="absolute inset-0 animate-[bk-drift_28s_ease-in-out_infinite_alternate] motion-reduce:animate-none">
        <ListingImage
          listingId={listing.id}
          title={listing.title}
          src={cover}
          className="h-full w-full scale-110 object-cover"
          priority
        />
      </div>

      {/*
        Two scrims, each doing one job, and both deliberately weaker than the
        first attempt. Stacking a heavy vertical gradient on a heavy horizontal
        one crushed the photograph to near-black — the hero had an image and
        you could not see it.

        The horizontal one carries the legibility work, because that is where
        the type actually sits. The vertical one only has to anchor the bottom
        edge into the page, so it can fade out well before the top and leave
        the right-hand side of the picture visible.
      */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(to_right,rgba(10,12,15,0.94)_0%,rgba(10,12,15,0.62)_38%,rgba(10,12,15,0.18)_68%,transparent_88%)]"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(to_top,rgba(10,12,15,0.92)_0%,rgba(10,12,15,0.42)_28%,transparent_62%)]"
      />
      {/* Grain. Stops the large flat gradient areas from banding on 8-bit
          displays, and adds the texture the direction asks for. */}
      <div aria-hidden="true" className="bk-grain absolute inset-0" />

      <div className="relative mx-auto flex h-full max-w-[1400px] flex-col justify-end px-5 pt-16 pb-10 sm:px-10 lg:pb-14">
        <div className="max-w-[52ch]">
          <div className="bk-fade-up flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-full border border-[rgba(62,123,250,0.35)] bg-[rgba(62,123,250,0.12)] px-3 py-1 text-[10.5px] font-semibold tracking-[0.1em] text-[var(--bk-accent-bright)] uppercase">
              <span className="size-[5px] rounded-full bg-current" />
              Most contested right now
            </span>
            {listing.ends_at && (
              <span className="text-[12.5px] text-muted-foreground">
                Ends in{" "}
                <Countdown
                  serverNow={serverNow}
                  endsAt={listing.ends_at}
                  className="font-medium text-foreground"
                />
              </span>
            )}
          </div>

          <h1 className="bk-fade-up bk-delay-1 mt-5 font-[family-name:var(--font-display)] text-[40px] leading-[1.04] tracking-[-0.02em] sm:text-[56px] lg:text-[64px]">
            {listing.title}
          </h1>

          <div className="bk-fade-up bk-delay-2 mt-6 flex flex-wrap items-end gap-x-8 gap-y-4">
            <div>
              <div className="text-[10px] font-semibold tracking-[0.12em] text-[var(--bk-subtle)] uppercase">
                {bidded ? "Current bid" : "Starting bid"}
              </div>
              <div className="tnum mt-1.5 font-mono text-[34px] leading-none font-medium tracking-[-0.03em] sm:text-[40px]">
                {formatPaise(price)}
              </div>
            </div>
            <div className="tnum pb-1 font-mono text-[13px] text-muted-foreground">
              {listing.bid_count} {listing.bid_count === 1 ? "bid" : "bids"}
            </div>
          </div>

          <div className="bk-fade-up bk-delay-3 mt-8 flex flex-wrap items-center gap-3">
            <Link
              href={`/listings/${listing.id}`}
              className="group inline-flex items-center gap-2.5 rounded-[9px] bg-[var(--bk-accent)] px-6 py-3.5 text-sm font-bold tracking-[-0.005em] text-[#04070D] shadow-[0_10px_30px_-12px_rgba(62,123,250,0.8)] outline-none transition-[background-color,transform,box-shadow] duration-200 ease-[var(--bk-ease)] hover:-translate-y-0.5 hover:bg-[var(--bk-accent-bright)] hover:shadow-[0_16px_38px_-12px_rgba(96,152,255,0.9)] focus-visible:ring-2 focus-visible:ring-[var(--bk-accent-bright)] focus-visible:ring-offset-2 focus-visible:ring-offset-background active:translate-y-0 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
            >
              View this lot
              <ArrowRight className="size-4 transition-transform duration-300 ease-[var(--bk-ease)] group-hover:translate-x-1 motion-reduce:transition-none" />
            </Link>
            <a
              href="#catalogue"
              className="rounded-[9px] border border-border px-5 py-3.5 text-sm text-muted-foreground transition-colors duration-200 hover:border-[rgba(62,123,250,0.55)] hover:text-foreground"
            >
              Browse all {stats.live}
            </a>
          </div>
        </div>

        {/* Stat strip. Real counts, queried at render — never decoration. */}
        <dl className="bk-fade-up bk-delay-4 mt-10 flex flex-wrap gap-x-10 gap-y-4 border-t border-white/[0.07] pt-6">
          <Stat label="Live auctions" value={String(stats.live)} />
          <Stat
            label="Ending within the hour"
            value={String(stats.endingWithinHour)}
            urgent={stats.endingWithinHour > 0}
          />
          <Stat label="Categories" value={String(stats.categories)} />
        </dl>
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  urgent = false,
}: {
  label: string;
  value: string;
  urgent?: boolean;
}) {
  return (
    <div>
      <dt className="text-[10px] font-semibold tracking-[0.12em] text-[var(--bk-subtle)] uppercase">
        {label}
      </dt>
      <dd
        className={[
          "tnum mt-1 font-mono text-[22px] font-medium tracking-[-0.02em]",
          urgent ? "text-[var(--bk-urgent-soft)]" : "",
        ].join(" ")}
      >
        {value}
      </dd>
    </div>
  );
}
