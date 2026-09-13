import Link from "next/link";
import { ListingImage } from "@/components/listing-image";
import { Countdown } from "@/components/countdown";
import { formatPaise } from "@/lib/money";
import {
  displayPricePaise,
  hasBids,
  CONDITION_LABELS,
  type ListingRow,
} from "@/lib/listings";

/**
 * One card in the public grid.
 *
 * A server component — there is no interactivity here beyond the link, and the
 * countdown is the only client island. Rendering 40 of these on the server
 * keeps the page fast and, more importantly, indexable: a marketplace whose
 * listings cannot be crawled is invisible.
 *
 * Shows no seller identity at all. Even the handle is omitted from the card,
 * because who is selling is not information a buyer needs while scanning a
 * grid, and every field left out is a field that cannot leak.
 */
export function ListingCard({
  listing,
  serverNow,
}: {
  listing: ListingRow;
  serverNow: string;
}) {
  const price = displayPricePaise(listing);
  const bidded = hasBids(listing);

  return (
    <Link
      href={`/listings/${listing.id}`}
      className="group focus-visible:ring-ring bg-card flex flex-col overflow-hidden rounded-lg border transition-colors outline-none hover:border-neutral-500 focus-visible:ring-2"
    >
      <div className="bg-muted aspect-[4/3] overflow-hidden">
        <ListingImage
          listingId={listing.id}
          title={listing.title}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        />
      </div>

      <div className="flex flex-1 flex-col p-4">
        <h3 className="line-clamp-2 text-sm leading-snug font-medium">
          {listing.title}
        </h3>

        <div className="mt-auto pt-4">
          <p className="text-muted-foreground text-xs">
            {bidded ? "Current bid" : "Starting bid"}
          </p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums">
            {formatPaise(price)}
          </p>

          <div className="text-muted-foreground mt-2 flex items-center justify-between gap-2 text-xs">
            <span>
              {listing.bid_count}{" "}
              {listing.bid_count === 1 ? "bid" : "bids"}
            </span>
            {/*
              ends_at is nullable in the schema because a draft has no end
              time. A CHECK constraint guarantees a live listing has one, but
              the type cannot know that, and asserting non-null here would just
              move the failure to a blank render. Absent means no countdown.
            */}
            {listing.ends_at && (
              <Countdown serverNow={serverNow} endsAt={listing.ends_at} />
            )}
          </div>

          <p className="text-muted-foreground/70 mt-2 text-xs">
            {CONDITION_LABELS[listing.condition] ?? listing.condition}
          </p>
        </div>
      </div>
    </Link>
  );
}
