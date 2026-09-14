"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Subscribes to live changes on ONE listing row.
 *
 * Postgres Changes on `listings`, not on `bids`. Realtime delivers whole rows,
 * and a bids row carries `bidder_id` — a stable identifier that would let
 * anyone collecting payloads correlate a bidder across every auction they have
 * entered. RLS filters which rows reach a subscriber, but the safest payload is
 * the one that never contains the identifier at all.
 *
 * The listing row carries what every viewer actually needs: current_price and
 * bid_count. It also carries highest_bidder_id, which is why this hook returns
 * only the two fields the interface is allowed to render.
 *
 * WHAT THIS IS NOT. It is a notification that the price moved, nothing more.
 * Whether a bid is legal is decided inside place_bid, under the row lock,
 * against the database clock. A viewer whose socket drops sees a stale price
 * and can still only ever place a bid the engine agrees with.
 */
export type LivePrice = {
  currentPricePaise: number | null;
  bidCount: number;
  /** True for a moment after an update lands, so the UI can flash the change. */
  justChanged: boolean;
  /** False when the socket is not connected — the page shows server values. */
  connected: boolean;
};

export function useListingRealtime(
  listingId: string,
  initial: { currentPricePaise: number | null; bidCount: number },
): LivePrice {
  const [price, setPrice] = useState(initial.currentPricePaise);
  const [count, setCount] = useState(initial.bidCount);

  /*
    Follow the server values when they change.

    useState only reads its initialiser on the first render, so without this
    the hook ignored every later prop. With the socket offline that was a real
    failure: placing a bid revalidates the page, the server sends the new
    price, and this kept showing the old one — so the amount field pre-filled a
    minimum that was already too low and the next bid was rejected.

    Compared during render rather than in an effect, which is React's
    documented way to reset state from a changed input.
  */
  const [seenInitial, setSeenInitial] = useState(initial);
  if (
    initial.currentPricePaise !== seenInitial.currentPricePaise ||
    initial.bidCount !== seenInitial.bidCount
  ) {
    setSeenInitial(initial);
    setPrice(initial.currentPricePaise);
    setCount(initial.bidCount);
  }
  const [justChanged, setJustChanged] = useState(false);
  const [connected, setConnected] = useState(false);

  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestPrice = useRef(initial.currentPricePaise);

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`listing:${listingId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "listings",
          filter: `id=eq.${listingId}`,
        },
        (payload) => {
          const row = payload.new as {
            current_price: number | null;
            bid_count: number;
          };

          // Only flash when the price actually moved. The listing row is also
          // updated by moderation and settlement, and flashing on an unrelated
          // change would cry wolf.
          //
          // Compared against a ref rather than inside a setPrice updater: a
          // state updater must be pure, and StrictMode double-invokes it, so
          // scheduling a timer in there fires twice.
          if (row.current_price !== latestPrice.current) {
            latestPrice.current = row.current_price;
            setJustChanged(true);
            if (flashTimer.current) clearTimeout(flashTimer.current);
            flashTimer.current = setTimeout(() => setJustChanged(false), 1200);
          }
          setPrice(row.current_price);
          setCount(row.bid_count);
        },
      )
      .subscribe((status) => {
        setConnected(status === "SUBSCRIBED");
      });

    return () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
      supabase.removeChannel(channel);
    };
  }, [listingId]);

  return {
    currentPricePaise: price,
    bidCount: count,
    justChanged,
    connected,
  };
}
