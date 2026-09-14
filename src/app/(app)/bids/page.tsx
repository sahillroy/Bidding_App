import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getServerNow } from "@/lib/listings";
import { Countdown } from "@/components/countdown";
import { formatPaise } from "@/lib/money";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your bids" };

/**
 * Every auction this person has bid on, and where they stand in each.
 *
 * THE `bidder_id` FILTER BELOW IS NOT REDUNDANT, and an earlier version of
 * this file omitted it on the reasoning that RLS already scopes the table.
 * RLS does scope it — to three audiences. `bids` is readable by its own
 * bidder, by the SELLER of the listing it is on, and by ADMINS. So without the
 * filter a seller opening this page saw strangers' bids on their own listings
 * rendered under the heading "Your bid", and an admin saw the entire site's
 * bidding history presented as their own.
 *
 * RLS decides what you are *allowed* to read. It does not decide what this
 * page is *about*. Those are different questions and only one of them is the
 * database's job.
 *
 * "Winning" is computed by comparing the viewer's own id to the listing's
 * highest_bidder_id on the server. That uuid never reaches the browser: the
 * page sends a word.
 */
export default async function MyBidsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const [{ data: myBids }, serverNow] = await Promise.all([
    supabase
      .from("bids")
      .select("id, amount, created_at, listing_id")
      .eq("bidder_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100),
    getServerNow(),
  ]);

  // One row per listing: the person's own highest bid on each.
  const best = new Map<string, { amount: number; at: string }>();
  for (const bid of myBids ?? []) {
    const existing = best.get(bid.listing_id);
    if (!existing || bid.amount > existing.amount) {
      best.set(bid.listing_id, { amount: bid.amount, at: bid.created_at });
    }
  }

  const listingIds = [...best.keys()];

  const { data: listings } = listingIds.length
    ? await supabase
        .from("listings")
        .select(
          "id, title, status, current_price, bid_count, ends_at, highest_bidder_id",
        )
        .in("id", listingIds)
    : { data: [] };

  const rows = (listings ?? [])
    .map((listing) => ({
      listing,
      mine: best.get(listing.id)!,
      winning: listing.highest_bidder_id === user.id,
    }))
    .sort((a, b) => (a.listing.ends_at ?? "").localeCompare(b.listing.ends_at ?? ""));

  return (
    <main className="mx-auto max-w-[900px] px-5 pb-24 sm:px-10">
      <h1 className="pt-10 font-[family-name:var(--font-display)] text-[34px] leading-[1.05] tracking-[-0.015em]">
        Your bids
      </h1>
      <p className="mt-2 text-[13.5px] text-muted-foreground">
        {rows.length === 0
          ? "You have not bid on anything yet."
          : `${rows.length} ${rows.length === 1 ? "auction" : "auctions"}`}
      </p>

      {rows.length === 0 ? (
        <Link
          href="/"
          className="mt-8 inline-block rounded-lg border border-border px-4 py-2 text-sm transition-colors duration-200 hover:border-[rgba(62,123,250,0.55)] hover:text-[var(--bk-accent)]"
        >
          Browse live auctions
        </Link>
      ) : (
        <ul className="mt-8 space-y-3">
          {rows.map(({ listing, mine, winning }) => (
            <li key={listing.id}>
              <Link
                href={`/listings/${listing.id}`}
                className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card p-4 transition-colors duration-200 hover:border-[rgba(62,123,250,0.55)]"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2.5">
                    <span
                      className={[
                        "rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-[0.06em] uppercase",
                        listing.status !== "live"
                          ? "border-border text-[var(--bk-subtle)]"
                          : winning
                            ? "border-[#3FBF8F]/40 text-[#6FD3AC]"
                            : "border-[var(--bk-urgent)]/40 text-[var(--bk-urgent-soft)]",
                      ].join(" ")}
                    >
                      {listing.status !== "live"
                        ? listing.status
                        : winning
                          ? "Winning"
                          : "Outbid"}
                    </span>
                    {listing.ends_at && listing.status === "live" && (
                      <Countdown
                        serverNow={serverNow}
                        endsAt={listing.ends_at}
                        className="font-mono text-[12px]"
                      />
                    )}
                  </div>
                  <p className="mt-1.5 truncate text-sm font-medium">
                    {listing.title}
                  </p>
                </div>

                <div className="flex gap-8 text-right">
                  <div>
                    <div className="text-[10px] tracking-[0.1em] text-[var(--bk-subtle)] uppercase">
                      Your bid
                    </div>
                    <div className="tnum mt-0.5 font-mono text-[15px]">
                      {formatPaise(BigInt(mine.amount))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] tracking-[0.1em] text-[var(--bk-subtle)] uppercase">
                      Current
                    </div>
                    <div className="tnum mt-0.5 font-mono text-[15px] font-medium">
                      {formatPaise(BigInt(listing.current_price ?? 0))}
                    </div>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
