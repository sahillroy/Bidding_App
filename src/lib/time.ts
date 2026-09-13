/**
 * Time handling.
 *
 * THE SERVER CLOCK DECIDES EVERYTHING. The browser clock only animates.
 *
 * A visitor's device clock can be wrong by minutes, wrong by hours, or
 * deliberately set wrong. None of that may affect whether a bid is accepted:
 * that decision is made inside the `place_bid` transaction using `now()` on the
 * database, and it is re-checked there no matter what the page believed.
 *
 * What the client gets is a pair — the auction's `ends_at` and the server's
 * current time at the moment the page was rendered. From those it computes a
 * one-time offset and animates a countdown against the corrected clock. A user
 * with a badly wrong clock sees a correct countdown; a user who tampers with
 * theirs sees a wrong countdown and still cannot place a late bid.
 */

/** What every page hands to a countdown component. */
export type ServerTimeSnapshot = {
  /** The database's idea of "now", ISO 8601, captured at render time. */
  serverNow: string;
  /** When this auction closes, ISO 8601. */
  endsAt: string;
};

/**
 * Milliseconds remaining, corrected for clock skew between the viewer's device
 * and the server.
 *
 * `renderedAtClientMs` is Date.now() taken once when the component mounts. The
 * difference between that and `serverNow` is the skew, and it is applied to
 * every subsequent tick.
 */
export function remainingMs(
  snapshot: ServerTimeSnapshot,
  renderedAtClientMs: number,
  nowClientMs: number,
): number {
  const serverNowMs = Date.parse(snapshot.serverNow);
  const endsAtMs = Date.parse(snapshot.endsAt);

  // Positive when the client clock runs ahead of the server.
  const skewMs = renderedAtClientMs - serverNowMs;

  const correctedNowMs = nowClientMs - skewMs;
  return Math.max(0, endsAtMs - correctedNowMs);
}

export type Countdown = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  totalMs: number;
  ended: boolean;
};

export function breakDown(ms: number): Countdown {
  const totalSeconds = Math.floor(ms / 1000);
  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
    totalMs: ms,
    ended: ms <= 0,
  };
}

/**
 * Short human label: "2d 4h", "4h 12m", "12m 30s", "45s".
 *
 * Shows progressively finer units as the deadline approaches, because "2d" is
 * useful at two days out and useless at two minutes out.
 */
export function formatCountdown(c: Countdown): string {
  if (c.ended) return "Ended";
  if (c.days > 0) return `${c.days}d ${c.hours}h`;
  if (c.hours > 0) return `${c.hours}h ${c.minutes}m`;
  if (c.minutes > 0) return `${c.minutes}m ${c.seconds}s`;
  return `${c.seconds}s`;
}

/** True when an auction is close enough to closing to deserve visual urgency. */
export function isEndingSoon(ms: number): boolean {
  return ms > 0 && ms < 60 * 60 * 1000; // under an hour
}

/** Absolute time, for a title attribute and for screen readers. */
export function formatAbsolute(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(iso));
}
