import Link from "next/link";
import { formatPaise } from "@/lib/money";
import type { TickerBid } from "@/lib/home";

/**
 * The live bid ticker.
 *
 * A CSS marquee — one keyframe translating the row by -50%, with the list
 * rendered twice so the seam is invisible. No JS, no measurement, and it
 * pauses on hover so a passing bid can actually be read and clicked.
 *
 * IT RENDERS NOTHING WHEN THERE ARE NO BIDS. Before Phase 4 there are none,
 * and the honest thing is an absent strip rather than a fabricated feed of
 * plausible-looking activity. A demo whose entire premise is being truthful
 * about what is simulated would be a strange place to start inventing users.
 *
 * Handles only — `public_bids` never exposes a bidder id, because a uuid is a
 * stable identifier that would let anyone correlate a bidder across every
 * auction they have ever entered.
 */
export function BidTicker({ bids }: { bids: TickerBid[] }) {
  if (bids.length === 0) return null;

  // Duplicated so the -50% translation loops seamlessly.
  const doubled = [...bids, ...bids];

  return (
    <section
      aria-label="Recent bids"
      className="group overflow-hidden border-b border-[var(--bk-line)] bg-[#0C0F14] py-2.5"
    >
      <h2 className="sr-only">Recent bids across the marketplace</h2>
      <div className="flex w-max animate-[bk-marquee_38s_linear_infinite] gap-10 group-hover:[animation-play-state:paused] motion-reduce:animate-none">
        {doubled.map((bid, i) => (
          <Link
            key={`${bid.id}-${i}`}
            href={`/listings/${bid.listingId}`}
            // The second copy exists only to make the loop seamless; it is the
            // same content read twice to anything assistive.
            aria-hidden={i >= bids.length ? true : undefined}
            tabIndex={i >= bids.length ? -1 : undefined}
            className="flex shrink-0 items-center gap-2.5 text-[12.5px] whitespace-nowrap text-muted-foreground transition-colors duration-200 hover:text-foreground"
          >
            <span
              aria-hidden="true"
              className="size-[5px] shrink-0 rounded-full bg-[#3FBF8F]"
            />
            <span className="font-mono text-[var(--bk-subtle)]">
              {bid.handle}
            </span>
            <span>bid</span>
            <span className="tnum font-mono text-foreground">
              {formatPaise(BigInt(bid.amount))}
            </span>
            <span>on</span>
            <span className="max-w-[24ch] truncate">{bid.title}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
