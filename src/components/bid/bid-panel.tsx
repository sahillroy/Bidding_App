"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, TriangleAlert } from "lucide-react";
import { placeBid, type BidState } from "@/app/(public)/listings/[id]/bid-action";
import { useListingRealtime } from "@/hooks/use-listing-realtime";
import { formatPaise } from "@/lib/money";

/**
 * The bid panel.
 *
 * THE INTERFACE NEVER DECIDES ANYTHING. `place_bid` decides, inside the row
 * lock, against the database clock. Every state below is a *report* of what
 * the database said. When the two disagree — because someone else's bid landed
 * 40ms earlier — the database wins and this corrects itself.
 *
 * Which is why the price is NOT optimistic. The plan says "optimistic UI with
 * reconciliation", and that is right for a like button and wrong for money:
 * showing someone they are winning at ₹25,500 and then snapping it back reads
 * as the site having lied about their position. The button says "placing…" for
 * the 100–300ms the round trip takes, and the price moves only when it is
 * true. Waiting a moment is cheaper than being wrong.
 */
export function BidPanel({
  listingId,
  startingPricePaise,
  currentPricePaise,
  bidIncrementPaise,
  bidCount,
  viewer,
}: {
  listingId: string;
  startingPricePaise: number;
  currentPricePaise: number | null;
  bidIncrementPaise: number;
  bidCount: number;
  viewer:
    | { state: "anonymous" }
    | { state: "unverified" }
    | { state: "suspended" }
    | { state: "seller" }
    | { state: "can-bid"; isHighest: boolean };
}) {
  const live = useListingRealtime(listingId, {
    currentPricePaise,
    bidCount,
  });

  const [state, formAction, pending] = useActionState<BidState, FormData>(
    placeBid,
    {},
  );

  // The minimum is derived from the LIVE price, so it climbs as other people
  // bid without the page reloading.
  const minimum =
    live.currentPricePaise === null
      ? BigInt(startingPricePaise)
      : BigInt(live.currentPricePaise) + BigInt(bidIncrementPaise);

  /*
    The field follows the live minimum until the bidder types something, and
    goes back to following it after a bid lands or is rejected with a new
    minimum.

    DERIVED, not synced. An effect that called setAmount whenever the minimum
    changed would re-render on every Realtime tick and fight anyone who was
    mid-type. "typed" holds only the deliberate override; everything else is
    computed during render. The comparison below is React's documented way to
    reset state when an input changes — no effect, no cascading render.
  */
  const [typed, setTyped] = useState<string | null>(null);
  const [seenResult, setSeenResult] = useState(state);

  if (state !== seenResult) {
    setSeenResult(state);
    // A rejection carrying a new minimum, or a successful bid, both mean the
    // amount in the box is stale — drop it and follow the minimum again.
    if (state.suggestPaise || state.ok) setTyped(null);
  }

  const suggested = state.suggestPaise ? BigInt(state.suggestPaise) : null;
  const amount = typed ?? rupees(suggested ?? minimum);
  const setAmount = setTyped;

  const quickBids = [
    minimum,
    minimum + BigInt(bidIncrementPaise),
    minimum + BigInt(bidIncrementPaise) * 4n,
  ];

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      {/* ---- price ---- */}
      <div className="p-[22px_22px_20px]">
        <div className="flex items-center justify-between">
          <div className="text-[10px] font-semibold tracking-[0.12em] text-[var(--bk-subtle)] uppercase">
            {live.bidCount > 0 ? "Current bid" : "Starting bid"}
          </div>
          {/* Honest about the socket. If Realtime is down the page still works
              from server-rendered values; saying so beats a silent stale price. */}
          <span
            className={[
              "flex items-center gap-1.5 text-[10.5px] tracking-[0.08em] uppercase",
              live.connected ? "text-[#3FBF8F]" : "text-[var(--bk-subtle)]",
            ].join(" ")}
          >
            <span
              className={[
                "size-[5px] rounded-full",
                live.connected
                  ? "animate-[bk-pulse_2s_ease-in-out_infinite] bg-current motion-reduce:animate-none"
                  : "bg-current",
              ].join(" ")}
            />
            {live.connected ? "Live" : "Offline"}
          </span>
        </div>

        <div
          className={[
            "tnum mt-2 font-mono text-[40px] leading-none font-medium tracking-[-0.03em] transition-colors duration-300",
            live.justChanged ? "text-[var(--bk-accent-bright)]" : "",
          ].join(" ")}
        >
          {formatPaise(BigInt(live.currentPricePaise ?? startingPricePaise))}
        </div>

        <p className="mt-2.5 text-[12.5px] text-muted-foreground">
          <span className="tnum font-mono">{live.bidCount}</span>{" "}
          {live.bidCount === 1 ? "bid" : "bids"}
          <span className="mx-2 opacity-40">·</span>
          minimum{" "}
          <span className="tnum font-mono text-foreground">
            {formatPaise(minimum)}
          </span>
        </p>
      </div>

      {/* ---- action ---- */}
      <div className="border-t border-[var(--bk-line)] p-[20px_22px_22px]">
        {viewer.state === "can-bid" ? (
          <>
            {viewer.isHighest && !state.error && (
              <p className="mb-4 flex items-center gap-2 rounded-lg border border-[#3FBF8F]/30 bg-[#3FBF8F]/10 px-3 py-2.5 text-[12.5px] text-[#6FD3AC]">
                <Check className="size-4 shrink-0" />
                You are the highest bidder.
              </p>
            )}

            <form action={formAction} className="space-y-3">
              <input type="hidden" name="listingId" value={listingId} />

              <div className="flex flex-wrap gap-2">
                {quickBids.map((q) => (
                  <button
                    key={q.toString()}
                    type="button"
                    onClick={() => {
                      setAmount(rupees(q));
                    }}
                    className="tnum rounded-full border border-border px-3 py-1.5 font-mono text-[12px] transition-colors duration-200 hover:border-[rgba(62,123,250,0.55)] hover:text-[var(--bk-accent-bright)]"
                  >
                    {formatPaise(q)}
                  </button>
                ))}
              </div>

              <div>
                <label htmlFor="amount" className="sr-only">
                  Your bid in rupees
                </label>
                <div className="relative flex items-center">
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3.5 font-mono text-muted-foreground"
                  >
                    ₹
                  </span>
                  <input
                    id="amount"
                    name="amount"
                    inputMode="decimal"
                    autoComplete="off"
                    value={amount}
                    onChange={(e) => {
                      setAmount(e.target.value);
                    }}
                    className="tnum w-full rounded-lg border border-border bg-[#0E1116] py-3 pr-3 pl-8 font-mono text-[17px] outline-none transition-colors duration-200 focus-visible:border-[rgba(62,123,250,0.6)] focus-visible:ring-2 focus-visible:ring-[var(--bk-accent)]/40"
                  />
                </div>
              </div>

              {state.error && (
                <p
                  role="alert"
                  className="flex items-start gap-2 rounded-lg border border-[var(--bk-urgent)]/30 bg-[var(--bk-urgent)]/10 px-3 py-2.5 text-[12.5px] leading-relaxed text-[var(--bk-urgent-soft)]"
                >
                  <TriangleAlert className="mt-px size-4 shrink-0" />
                  {state.error}
                </p>
              )}

              {state.ok && !state.error && (
                <p
                  role="status"
                  className="flex items-center gap-2 rounded-lg border border-[#3FBF8F]/30 bg-[#3FBF8F]/10 px-3 py-2.5 text-[12.5px] text-[#6FD3AC]"
                >
                  <Check className="size-4 shrink-0" />
                  Bid placed.
                </p>
              )}

              <button
                type="submit"
                disabled={pending}
                className="group flex w-full items-center justify-center gap-2.5 rounded-[9px] bg-[var(--bk-accent)] px-5 py-[15px] text-[14.5px] font-bold tracking-[-0.005em] text-[#04070D] shadow-[0_8px_26px_-10px_rgba(62,123,250,0.75)] outline-none transition-[background-color,transform,box-shadow,opacity] duration-200 ease-[var(--bk-ease)] hover:-translate-y-0.5 hover:bg-[var(--bk-accent-bright)] focus-visible:ring-2 focus-visible:ring-[var(--bk-accent-bright)] focus-visible:ring-offset-2 focus-visible:ring-offset-background active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
              >
                {pending ? "Placing…" : "Place bid"}
                {!pending && (
                  <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1 motion-reduce:transition-none" />
                )}
              </button>
            </form>

            <p className="mt-3 text-center text-[11px] leading-relaxed text-[var(--bk-subtle)]">
              A bid is binding and cannot be withdrawn. The server clock decides
              whether it arrived in time.
            </p>
          </>
        ) : (
          <BlockedState listingId={listingId} viewer={viewer} />
        )}
      </div>
    </div>
  );
}

function BlockedState({
  listingId,
  viewer,
}: {
  listingId: string;
  viewer: { state: "anonymous" | "unverified" | "suspended" | "seller" };
}) {
  const cta =
    "flex w-full items-center justify-center gap-2.5 rounded-[9px] bg-[var(--bk-accent)] px-5 py-[15px] text-[14.5px] font-bold text-[#04070D] shadow-[0_8px_26px_-10px_rgba(62,123,250,0.75)] transition-colors duration-200 hover:bg-[var(--bk-accent-bright)]";

  if (viewer.state === "anonymous") {
    return (
      <>
        <Link href={`/login?next=/listings/${listingId}`} className={cta}>
          Sign in to bid
          <ArrowRight className="size-4" />
        </Link>
        <p className="mt-3 text-center text-[11.5px] leading-relaxed text-[var(--bk-subtle)]">
          Bidding needs an account and a completed identity check. Browsing
          needs neither.
        </p>
      </>
    );
  }

  if (viewer.state === "unverified") {
    return (
      <>
        <Link href="/verify" className={cta}>
          Complete identity check
          <ArrowRight className="size-4" />
        </Link>
        <p className="mt-3 text-center text-[11.5px] leading-relaxed text-[var(--bk-subtle)]">
          A format check only. <strong>No document number is stored</strong> —
          not encrypted, not hashed, not temporarily.
        </p>
      </>
    );
  }

  if (viewer.state === "seller") {
    return (
      <p className="rounded-lg border border-border bg-[#0E1116] px-4 py-3.5 text-center text-[13px] text-muted-foreground">
        This is your listing. Sellers cannot bid on their own auctions.
      </p>
    );
  }

  return (
    <p className="rounded-lg border border-[var(--bk-urgent)]/30 bg-[var(--bk-urgent)]/10 px-4 py-3.5 text-center text-[13px] text-[var(--bk-urgent-soft)]">
      This account cannot bid at the moment. See your account page for details.
    </p>
  );
}

/** Paise → a plain rupee string for the input. No grouping: commas would have
 *  to be stripped on every keystroke and the field would fight the user. */
function rupees(paise: bigint): string {
  const whole = paise / 100n;
  const rest = paise % 100n;
  return rest === 0n
    ? whole.toString()
    : `${whole}.${rest.toString().padStart(2, "0")}`;
}
