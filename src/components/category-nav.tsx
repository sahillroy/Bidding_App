import Link from "next/link";
import type { CategoryRow } from "@/lib/listings";

/**
 * Horizontal category filter.
 *
 * Plain links, not buttons with client state — each category is its own URL, so
 * it is shareable, back-button-friendly, and server-rendered. A category page
 * that only existed in client state would be invisible to a crawler.
 */
export function CategoryNav({
  categories,
  activeSlug,
}: {
  categories: CategoryRow[];
  activeSlug?: string;
}) {
  return (
    <nav aria-label="Categories" className="-mx-6 overflow-x-auto px-6">
      <ul className="flex w-max gap-2 pb-1">
        <li>
          <CategoryPill href="/" active={!activeSlug}>
            All
          </CategoryPill>
        </li>
        {categories.map((c) => (
          <li key={c.id}>
            <CategoryPill
              href={`/categories/${c.slug}`}
              active={activeSlug === c.slug}
            >
              {c.name}
            </CategoryPill>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function CategoryPill({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={[
        "focus-visible:ring-ring inline-block rounded-full border px-3.5 py-1.5 text-sm whitespace-nowrap transition-colors outline-none focus-visible:ring-2",
        active
          ? "bg-foreground text-background border-transparent"
          : "hover:bg-muted text-muted-foreground hover:text-foreground",
      ].join(" ")}
    >
      {children}
    </Link>
  );
}
