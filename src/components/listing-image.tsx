/**
 * Placeholder imagery for seeded listings.
 *
 * Real uploads arrive in Phase 3 via Supabase Storage. Until then this renders
 * a deterministic inline SVG derived from the listing id, so the same listing
 * always looks the same across reloads and across machines.
 *
 * Deliberately NOT a remote image service. A grid that depends on an external
 * host breaks offline, breaks behind a restrictive network, and would show a
 * random landscape photo above a listing titled "Canon DSLR" — which reads
 * worse than an honest placeholder.
 *
 * Inline SVG rather than a data URI: no base64 bloat in the HTML, it scales
 * cleanly at any size, and it inherits the page's theme.
 */

/** FNV-1a. Small, fast, and stable across runtimes — which matters, because the
 *  same listing must produce the same colours on the server and in the browser
 *  or React will report a hydration mismatch. */
function hash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Muted, low-saturation pairs. Bright placeholders would pull attention away
 *  from real content once Phase 3 lands actual photographs. */
const PALETTES = [
  ["#1e3a5f", "#2d5a87"],
  ["#3d2f4f", "#5a4570"],
  ["#1f4037", "#2d5f4f"],
  ["#4a3728", "#6b5140"],
  ["#2b3a4a", "#3f5468"],
  ["#4a2f3a", "#6b4553"],
  ["#2f4538", "#456b52"],
  ["#3a3550", "#524a75"],
] as const;

export function ListingImage({
  listingId,
  title,
  className = "",
  priority = false,
}: {
  listingId: string;
  title: string;
  className?: string;
  /** Ignored for SVG; kept so the call sites do not change in Phase 3. */
  priority?: boolean;
}) {
  void priority;

  const h = hash(listingId);
  const [from, to] = PALETTES[h % PALETTES.length];
  const gradientId = `g-${listingId.replace(/[^a-zA-Z0-9]/g, "")}`;
  const angle = h % 90;

  // First letters of the first two words, e.g. "Canon EOS" -> "CE".
  const initials = title
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  return (
    <svg
      viewBox="0 0 400 300"
      className={className}
      role="img"
      // The title is already displayed as text next to this in every call site,
      // so announcing it again would make a screen reader read it twice.
      aria-label={`Placeholder image for ${title}`}
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id={gradientId} gradientTransform={`rotate(${angle})`}>
          <stop offset="0%" stopColor={from} />
          <stop offset="100%" stopColor={to} />
        </linearGradient>
      </defs>
      <rect width="400" height="300" fill={`url(#${gradientId})`} />
      <text
        x="200"
        y="150"
        textAnchor="middle"
        dominantBaseline="central"
        fill="rgba(255,255,255,0.22)"
        fontSize="96"
        fontWeight="600"
        fontFamily="system-ui, sans-serif"
        letterSpacing="4"
      >
        {initials}
      </text>
    </svg>
  );
}
