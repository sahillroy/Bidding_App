import { Suspense } from "react";
import Link from "next/link";
import {
  browseListings,
  countLiveListings,
  getCategories,
  getServerNow,
} from "@/lib/listings";
import { ListingCard } from "@/components/listing-card";
import { CategoryNav } from "@/components/category-nav";
import { SearchBar } from "@/components/search-bar";
import { ScrollProgress } from "@/components/scroll-progress";

/**
 * The public catalogue.
 *
 * Fully usable logged out — this is the Phase 2 acceptance criterion. A visitor
 * with no account and no cookies sees every live auction, can filter, search,
 * and open any listing. They are asked to sign in only when they try to act.
 *
 * Server-rendered on request rather than statically generated: prices and
 * countdowns change continuously, and a cached grid would show stale bids.
 */
export const dynamic = "force-dynamic";

const PAGE_SIZE = 24;

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const params = await searchParams;
  const query = params.q?.trim() || undefined;
  const page = Math.max(1, Number(params.page) || 1);

  const [categories, serverNow, listings, total] = await Promise.all([
    getCategories(),
    getServerNow(),
    browseListings({
      query,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    countLiveListings(),
  ]);

  return (
    <>
      <ScrollProgress />

      <main className="mx-auto max-w-[1400px] px-5 pb-20 sm:px-10">
        <div className="flex flex-col gap-4 pt-7 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-[family-name:var(--font-display)] text-[34px] leading-[1.05] tracking-[-0.015em] sm:text-[40px]">
              {query ? (
                <>
                  Results for{" "}
                  <span className="text-[var(--bk-accent)]">
                    &ldquo;{query}&rdquo;
                  </span>
                </>
              ) : (
                "Live auctions"
              )}
            </h1>
            <p className="mt-2 text-[13.5px] text-muted-foreground">
              {query
                ? `${listings.length} ${listings.length === 1 ? "match" : "matches"}`
                : `${total} open for bidding · ending soonest first`}
            </p>
          </div>

          <div className="w-full sm:max-w-xs">
            <Suspense fallback={null}>
              <SearchBar />
            </Suspense>
          </div>
        </div>

        <div className="mt-6">
          <CategoryNav categories={categories} />
        </div>

        {listings.length === 0 ? (
          <EmptyState query={query} />
        ) : (
          <>
            <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {listings.map((listing, i) => (
                <ListingCard
                  key={listing.id}
                  listing={listing}
                  serverNow={serverNow}
                  // The first row is above the fold on most screens; letting it
                  // animate in means a visitor watches their content arrive.
                  priority={i < 4}
                />
              ))}
            </div>

            <Pagination
              page={page}
              hasMore={listings.length === PAGE_SIZE}
              query={query}
            />
          </>
        )}
      </main>
    </>
  );
}

function EmptyState({ query }: { query?: string }) {
  return (
    <div className="mt-24 mb-16 text-center">
      <p className="font-[family-name:var(--font-display)] text-2xl">
        {query ? "Nothing matched that search" : "No auctions are live yet"}
      </p>
      <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
        {query ? (
          <>
            Try fewer words, or a more general term. Search looks at listing
            titles and descriptions, so a brand or model name usually works
            better than a category.
          </>
        ) : (
          <>
            Listings appear here once a seller submits them and an administrator
            approves them.
          </>
        )}
      </p>
      {query && (
        <Link
          href="/"
          className="mt-6 inline-block rounded-lg border border-border px-4 py-2 text-sm transition-colors duration-200 hover:border-[rgba(62,123,250,0.55)] hover:text-[var(--bk-accent)]"
        >
          Browse everything
        </Link>
      )}
    </div>
  );
}

function Pagination({
  page,
  hasMore,
  query,
}: {
  page: number;
  hasMore: boolean;
  query?: string;
}) {
  if (page === 1 && !hasMore) return null;

  const href = (n: number) => {
    const p = new URLSearchParams();
    if (query) p.set("q", query);
    if (n > 1) p.set("page", String(n));
    const s = p.toString();
    return s ? `/?${s}` : "/";
  };

  const base =
    "rounded-lg border px-4 py-2 transition-colors duration-200 ease-[var(--bk-ease)]";
  const live = `${base} border-border hover:border-[rgba(62,123,250,0.55)] hover:text-[var(--bk-accent)]`;
  const dead = `${base} border-border/50 text-[var(--bk-subtle)]/50`;

  return (
    <nav
      aria-label="Pagination"
      className="mt-12 flex items-center justify-center gap-3 text-sm"
    >
      {page > 1 ? (
        <Link href={href(page - 1)} className={live}>
          Previous
        </Link>
      ) : (
        <span className={dead}>Previous</span>
      )}

      <span className="tnum px-2 font-mono text-muted-foreground">
        Page {page}
      </span>

      {hasMore ? (
        <Link href={href(page + 1)} className={live}>
          Next
        </Link>
      ) : (
        <span className={dead}>Next</span>
      )}
    </nav>
  );
}
