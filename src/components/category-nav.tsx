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
        "inline-block rounded-full border px-3.5 py-1.5 text-sm whitespace-nowrap outline-none",
        "transition-[color,background-color,border-color,transform] duration-200 ease-[var(--bk-ease)]",
        "focus-visible:ring-2 focus-visible:ring-[var(--bk-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        active
          ? "border-transparent bg-foreground font-medium text-background"
          : "border-border text-muted-foreground hover:-translate-y-px hover:border-[rgba(62,123,250,0.55)] hover:bg-[#14181E] hover:text-foreground motion-reduce:hover:translate-y-0",
      ].join(" ")}
    >
      {children}
    </Link>
  );
}
