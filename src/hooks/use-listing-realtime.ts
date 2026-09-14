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
  const [justChanged, setJustChanged] = useState(false);
  const [connected, setConnected] = useState(false);

  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

          setPrice((previous) => {
            // Only flash when the price actually moved. The listing row is
            // also updated by moderation and settlement, and a flash on an
            // unrelated change would cry wolf.
            if (row.current_price !== previous) {
              setJustChanged(true);
              if (flashTimer.current) clearTimeout(flashTimer.current);
              flashTimer.current = setTimeout(() => setJustChanged(false), 1200);
            }
            return row.current_price;
          });
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
