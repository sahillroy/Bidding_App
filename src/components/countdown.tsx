"use client";

import { useEffect, useState } from "react";
import {
  breakDown,
  formatCountdown,
  formatAbsolute,
  isEndingSoon,
  remainingMs,
  type ServerTimeSnapshot,
} from "@/lib/time";

/**
 * Animated countdown.
 *
 * This component decides nothing. It renders a number that ticks. Whether a bid
 * is actually still allowed is determined inside the `place_bid` transaction
 * against the database clock, and re-checked there regardless of what this says.
 *
 * On first render it captures Date.now() once and compares it to the server
 * time the page was rendered with. That difference is the viewer's clock skew,
 * and every subsequent tick is corrected by it — so a device whose clock is an
 * hour fast still shows the right remaining time.
 *
 * The mount timestamp is held in state with a lazy initialiser rather than in a
 * ref. A ref read during render is a genuine React hazard, and state gives the
 * same run-once semantics without it.
 */
export function Countdown({
  serverNow,
  endsAt,
  className = "",
}: ServerTimeSnapshot & { className?: string }) {
  const [mountedAt] = useState(() => Date.now());

  const [ms, setMs] = useState(() =>
    remainingMs({ serverNow, endsAt }, mountedAt, Date.now()),
  );

  useEffect(() => {
    // One second is enough: nothing here is precise to the frame, and a
    // requestAnimationFrame loop would burn battery on a grid of 40 cards.
    const tick = () =>
      setMs(remainingMs({ serverNow, endsAt }, mountedAt, Date.now()));

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [serverNow, endsAt, mountedAt]);

  const c = breakDown(ms);
  const urgent = isEndingSoon(ms);

  return (
    <time
      dateTime={endsAt}
      title={`Ends ${formatAbsolute(endsAt)} IST`}
      // Announced once with an absolute time. A per-second live region would be
      // unusable with a screen reader.
      aria-label={`Ends ${formatAbsolute(endsAt)} IST`}
      className={[
        "tabular-nums",
        urgent ? "font-medium text-amber-500" : "",
        c.ended ? "text-muted-foreground" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      // The server renders one value and the client immediately recomputes
      // against the corrected clock; a one-second difference between them is
      // expected, not a bug.
      suppressHydrationWarning
    >
      {formatCountdown(c)}
    </time>
  );
}
