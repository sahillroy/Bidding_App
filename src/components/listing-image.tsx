/**
 * Listing photograph, or a deterministic placeholder when none exists.
 *
 * Seeded catalogue rows have no Storage object — they keep the SVG so the
 * grid does not depend on an external image host. Seller-uploaded photos
 * arrive as a public Supabase Storage URL and render as a plain <img>.
 * next/image is not used: the local stack and a hosted project have different
 * hosts, and a missing remotePattern would 400 every photo.
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
  src = null,
  priority = false,
}: {
  listingId: string;
  title: string;
  className?: string;
  src?: string | null;
  /** Ignored for SVG; kept so the call sites do not change. */
  priority?: boolean;
}) {
  void priority;

  const h = hash(listingId);
  const [from, to] = PALETTES[h % PALETTES.length];

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        className={className}
        /*
          The gradient sits BEHIND the photograph, as the element's own
          background, so a broken image shows it instead of a blank rectangle.

          This is not hypothetical. A `listing_images` row can outlive the
          Storage object it points at — a half-failed upload, an object deleted
          out of the bucket, a database restored from a snapshot taken after
          the files were cleared. Before this, any of those turned the card
          into an empty hole. Now it degrades to the same placeholder a listing
          with no photo gets.

          Deliberately not an onError handler: that would make this a client
          component, and 40 of them on a grid is a real cost for a case a
          single CSS declaration already covers.
        */
        style={{ background: `linear-gradient(${h % 90}deg, ${from}, ${to})` }}
      />
    );
  }
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
