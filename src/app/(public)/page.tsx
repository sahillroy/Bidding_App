import { Suspense } from "react";
import {
  browseListings,
  countLiveListings,
  getCategories,
  getServerNow,
} from "@/lib/listings";
import { ListingCard } from "@/components/listing-card";
import { CategoryNav } from "@/components/category-nav";
import { SearchBar } from "@/components/search-bar";

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
    <main className="mx-auto max-w-6xl px-6 py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {query ? `Results for “${query}”` : "Live auctions"}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {query
              ? `${listings.length} ${listings.length === 1 ? "match" : "matches"}`
              : `${total} ${total === 1 ? "auction" : "auctions"} open for bidding`}
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
            {listings.map((listing) => (
              <ListingCard
                key={listing.id}
                listing={listing}
                serverNow={serverNow}
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
  );
}

function EmptyState({ query }: { query?: string }) {
  return (
    <div className="mt-16 text-center">
      <p className="text-lg font-medium">
        {query ? "Nothing matched that search" : "No auctions are live yet"}
      </p>
      <p className="text-muted-foreground mx-auto mt-2 max-w-md text-sm leading-relaxed">
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

  const base = (n: number) => {
    const p = new URLSearchParams();
    if (query) p.set("q", query);
    if (n > 1) p.set("page", String(n));
    const s = p.toString();
    return s ? `/?${s}` : "/";
  };

  return (
    <nav
      aria-label="Pagination"
      className="mt-10 flex items-center justify-center gap-3 text-sm"
    >
      {page > 1 ? (
        <a href={base(page - 1)} className="hover:bg-muted rounded-lg border px-4 py-2">
          Previous
        </a>
      ) : (
        <span className="text-muted-foreground/50 rounded-lg border px-4 py-2">
          Previous
        </span>
      )}

      <span className="text-muted-foreground tabular-nums">Page {page}</span>

      {hasMore ? (
        <a href={base(page + 1)} className="hover:bg-muted rounded-lg border px-4 py-2">
          Next
        </a>
      ) : (
        <span className="text-muted-foreground/50 rounded-lg border px-4 py-2">
          Next
        </span>
      )}
    </nav>
  );
}
