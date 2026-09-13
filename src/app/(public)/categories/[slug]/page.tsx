import { notFound } from "next/navigation";
import { Suspense } from "react";
import type { Metadata } from "next";
import {
  browseListings,
  countLiveListings,
  getCategories,
  getCategoryBySlug,
  getServerNow,
} from "@/lib/listings";
import { ListingCard } from "@/components/listing-card";
import { CategoryNav } from "@/components/category-nav";
import { SearchBar } from "@/components/search-bar";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 24;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);
  if (!category) return { title: "Category not found" };

  return {
    title: category.name,
    description: `Live ${category.name.toLowerCase()} auctions.`,
  };
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);

  const category = await getCategoryBySlug(slug);
  if (!category) notFound();

  const query = sp.q?.trim() || undefined;
  const page = Math.max(1, Number(sp.page) || 1);

  const [categories, serverNow, listings, total] = await Promise.all([
    getCategories(),
    getServerNow(),
    browseListings({
      query,
      categoryId: category.id,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    countLiveListings(category.id),
  ]);

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {category.name}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {query
              ? `${listings.length} ${listings.length === 1 ? "match" : "matches"} in this category`
              : `${total} ${total === 1 ? "auction" : "auctions"} open for bidding`}
          </p>
        </div>

        <div className="w-full sm:max-w-xs">
          <Suspense fallback={null}>
            <SearchBar placeholder={`Search ${category.name.toLowerCase()}`} />
          </Suspense>
        </div>
      </div>

      <div className="mt-6">
        <CategoryNav categories={categories} activeSlug={category.slug} />
      </div>

      {listings.length === 0 ? (
        <div className="mt-16 text-center">
          <p className="text-lg font-medium">
            {query
              ? "Nothing matched that search here"
              : "No live auctions in this category"}
          </p>
          <p className="text-muted-foreground mx-auto mt-2 max-w-md text-sm leading-relaxed">
            {query
              ? "Try a broader term, or search across every category from the home page."
              : "Check back shortly, or browse another category above."}
          </p>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {listings.map((listing) => (
            <ListingCard
              key={listing.id}
              listing={listing}
              serverNow={serverNow}
            />
          ))}
        </div>
      )}
    </main>
  );
}
