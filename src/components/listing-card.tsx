import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ListingImage } from "@/components/listing-image";
import { Countdown } from "@/components/countdown";
import { formatPaise } from "@/lib/money";
import {
  displayPricePaise,
  hasBids,
  type ListingRow,
} from "@/lib/listings";

/**
 * One card in the public grid.
 *
 * A server component. The only client code involved is CursorTracking, mounted
 * once for the whole page — this renders as static HTML.
 *
 * THE HOVER. Eight layers move, on five different durations. The stagger is
 * the entire point: move them all on one timing and it reads as a switch
 * flipping; let the border snap, the brackets draw, the card tilt, the art
 * drift and the light sweep last, and it reads as an object responding.
 *
 *   1. border      -> accent            180ms
 *   2. glow        -> accent shadow     220ms
 *   3. brackets    -> draw inward       320ms, 60ms in
 *   4. lift + tilt -> -6px, ±3.6deg     300ms, tracks cursor
 *   5. spotlight   -> follows pointer   260ms
 *   6. bid row     -> reveal            260ms, 60ms in
 *   7. art         -> scale + parallax  480ms
 *   8. shine       -> one pass of light 700ms
 *
 * Everything animates transform / opacity / colour, so it is composited and
 * costs no layout. The bid row is always in the DOM at max-height 0, so
 * revealing it reflows nothing below it.
 *
 * Shows no seller identity at all. Who is selling is not something a buyer
 * needs while scanning a grid, and every field left out is one that cannot
 * leak.
 */
export function ListingCard({
  listing,
  serverNow,
  priority = false,
}: {
  listing: ListingRow;
  serverNow: string;
  priority?: boolean;
}) {
  const price = displayPricePaise(listing);
  const bidded = hasBids(listing);

  return (
    <Link
      href={`/listings/${listing.id}`}
      data-tilt
      className={[
        "bk-reveal group relative flex flex-col rounded-[10px] border border-border bg-card",
        "[transform:perspective(1000px)_translateY(0)_rotateX(0)_rotateY(0)]",
        "transition-[border-color,box-shadow,transform,background-color] duration-300 ease-[var(--bk-ease)]",
        "outline-none",
        // 1, 2, 4 — border, glow, lift and tilt
        "hover:border-[var(--bk-accent)] hover:bg-[#12161d]",
        "hover:[transform:perspective(1000px)_translateY(-6px)_rotateX(var(--rx,0deg))_rotateY(var(--ry,0deg))]",
        "hover:shadow-[0_0_0_1px_rgba(62,123,250,0.45),0_22px_50px_-18px_rgba(62,123,250,0.6),0_3px_10px_-3px_rgba(0,0,0,0.7)]",
        // Keyboard users see exactly what pointer users see.
        "focus-visible:border-[var(--bk-accent)] focus-visible:ring-2 focus-visible:ring-[var(--bk-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "motion-reduce:transition-none motion-reduce:hover:[transform:none]",
      ].join(" ")}
    >
      <div className="relative aspect-[4/3] overflow-hidden rounded-t-[9px]">
        {/* 7 — art scales and drifts against the cursor */}
        <div
          className={[
            "absolute -inset-1.5 transition-[transform,filter] duration-[480ms] ease-[var(--bk-ease)]",
            "group-hover:[transform:scale(1.07)_translate(var(--px,0px),var(--py,0px))]",
            "group-hover:brightness-110 group-hover:saturate-[1.06]",
            "motion-reduce:transition-none motion-reduce:group-hover:[transform:scale(1.02)]",
          ].join(" ")}
        >
          <ListingImage
            listingId={listing.id}
            title={listing.title}
            // Their Phase 3 work: a real uploaded photo when the seller has
            // added one. Falls back to the deterministic gradient when not.
            src={listing.coverUrl}
            className="h-full w-full object-cover"
            priority={priority}
          />
        </div>

        {/* 5 — blue wash rising off the bottom of the art */}
        <div
          aria-hidden="true"
          className="absolute inset-0 z-[1] bg-[linear-gradient(to_top,rgba(62,123,250,0.38)_0%,rgba(62,123,250,0.07)_46%,transparent_76%)] opacity-0 transition-opacity duration-[260ms] ease-[var(--bk-ease)] group-hover:opacity-100"
        />

        {/* 8 — one diagonal pass of light. Does NOT loop: a repeating shimmer
            reads as a skeleton loader, telling the eye content is still on its
            way, which is exactly wrong once it has arrived. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-[60%] -bottom-[60%] left-[-75%] z-[2] w-[55%] skew-x-[-18deg] bg-[linear-gradient(100deg,transparent,rgba(255,255,255,0.16)_45%,rgba(255,255,255,0.05)_60%,transparent)] group-hover:animate-[bk-sweep_700ms_cubic-bezier(0.3,0.7,0.3,1)_forwards] motion-reduce:group-hover:animate-none"
        />

        {/* 6 — status pill lifts and warms */}
        <StatusBadge serverNow={serverNow} endsAt={listing.ends_at} />

        {/*
          The reveal, sitting INSIDE the image rather than below it.

          It began life as a row in the card body with an animated max-height.
          That looked right in isolation and was wrong in a grid: growing the
          card grew its whole row, so hovering one card pushed its three
          neighbours taller and opened a gap under each of them. Layout shift
          on hover, across the entire row.

          Sliding it up over the artwork costs no height at all, so the grid
          never moves — and the blue wash is already darkening exactly this
          strip, so it has a backdrop for free.
        */}
        <div
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 z-[3] flex translate-y-full items-center justify-between bg-[linear-gradient(to_top,rgba(6,10,20,0.92),rgba(6,10,20,0.55))] px-[15px] py-2.5 text-xs font-semibold tracking-[0.02em] text-white backdrop-blur-[2px] transition-transform duration-[280ms] ease-[var(--bk-ease)] group-hover:translate-y-0 motion-reduce:transition-none"
        >
          <span>Place bid</span>
          <ArrowRight className="size-3.5 transition-transform duration-300 ease-[var(--bk-ease)] delay-[80ms] group-hover:translate-x-1 motion-reduce:transition-none" />
        </div>
      </div>

      {/* 3 — corner brackets. Instrument markings, not decoration. */}
      <Bracket className="top-[7px] left-[7px] rounded-tl border-t border-l translate-x-[5px] translate-y-[5px]" />
      <Bracket className="top-[7px] right-[7px] rounded-tr border-t border-r -translate-x-[5px] translate-y-[5px]" />
      <Bracket className="bottom-[7px] left-[7px] rounded-bl border-b border-l translate-x-[5px] -translate-y-[5px]" />
      <Bracket className="bottom-[7px] right-[7px] rounded-br border-b border-r -translate-x-[5px] -translate-y-[5px]" />

      {/* 4 — spotlight tracking the pointer */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-[3] rounded-[10px] bg-[radial-gradient(260px_circle_at_var(--mx,50%)_var(--my,50%),rgba(62,123,250,0.16),transparent_62%)] opacity-0 transition-opacity duration-[260ms] ease-[var(--bk-ease)] group-hover:opacity-100"
      />

      <div className="relative z-[4] flex flex-1 flex-col p-[14px_15px_15px]">
        <h3 className="m-0 line-clamp-2 text-sm leading-snug font-medium tracking-[-0.005em] text-[#C9CDD4] transition-[color,transform] duration-200 ease-[var(--bk-ease)] group-hover:translate-x-0.5 group-hover:text-white motion-reduce:transition-none motion-reduce:group-hover:translate-x-0">
          {listing.title}
        </h3>

        {/* Price, bid count and countdown deliberately do NOT react to hover.
            They are the facts being scanned for; shifting them under the
            cursor makes a grid harder to read, not more premium. */}
        <div className="mt-auto flex items-baseline justify-between gap-2.5 pt-[11px]">
          <div>
            <div className="text-[10px] tracking-[0.1em] text-[var(--bk-subtle)] uppercase">
              {bidded ? "Current bid" : "Starting bid"}
            </div>
            <div className="tnum mt-[3px] font-mono text-[21px] font-medium tracking-[-0.02em]">
              {formatPaise(price)}
            </div>
          </div>
          <div className="text-right">
            <div className="tnum font-mono text-xs text-muted-foreground">
              {listing.bid_count} {listing.bid_count === 1 ? "bid" : "bids"}
            </div>
            {listing.ends_at && (
              <Countdown
                serverNow={serverNow}
                endsAt={listing.ends_at}
                className="mt-[3px] block font-mono text-xs text-[#C9CDD4]"
              />
            )}
          </div>
        </div>

      </div>
    </Link>
  );
}

function Bracket({ className }: { className: string }) {
  return (
    <span
      aria-hidden="true"
      className={[
        "pointer-events-none absolute z-[4] size-3.5 border-[var(--bk-accent)] opacity-0",
        "transition-[opacity,transform] duration-[320ms] ease-[var(--bk-ease)] delay-[60ms]",
        "group-hover:translate-x-0 group-hover:translate-y-0 group-hover:opacity-[0.85]",
        "motion-reduce:transition-none",
        className,
      ].join(" ")}
    />
  );
}

/**
 * "Ending soon" is decided on the SERVER, from the database clock, not from
 * the viewer's device. A wrong client clock must never be able to label an
 * auction urgent or calm.
 */
function StatusBadge({
  serverNow,
  endsAt,
}: {
  serverNow: string;
  endsAt: string | null;
}) {
  if (!endsAt) return null;

  const remaining = Date.parse(endsAt) - Date.parse(serverNow);
  const urgent = remaining > 0 && remaining < 60 * 60 * 1000;
  const ended = remaining <= 0;

  return (
    <span
      className={[
        "absolute top-2.5 left-2.5 z-[5] inline-flex items-center gap-1.5 rounded-full border px-2.5 py-[5px]",
        "text-[11px] font-semibold tracking-[0.04em] uppercase backdrop-blur-lg",
        "transition-[transform,border-color,color] duration-[260ms] ease-[var(--bk-ease)]",
        "group-hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-y-0",
        urgent
          ? "border-[rgba(255,92,77,0.42)] bg-[rgba(38,14,12,0.82)] text-[var(--bk-urgent-soft)]"
          : ended
            ? "border-border bg-[rgba(10,12,15,0.78)] text-[var(--bk-subtle)]"
            : "border-[#2A303A] bg-[rgba(10,12,15,0.78)] text-muted-foreground group-hover:border-[rgba(62,123,250,0.5)] group-hover:text-[#C9CDD4]",
      ].join(" ")}
    >
      <span
        aria-hidden="true"
        className={[
          "size-[5px] rounded-full bg-current",
          urgent ? "animate-[bk-pulse_1.6s_ease-in-out_infinite] motion-reduce:animate-none" : "",
        ].join(" ")}
      />
      {ended ? "Ended" : urgent ? "Ending soon" : "Live"}
    </span>
  );
}
