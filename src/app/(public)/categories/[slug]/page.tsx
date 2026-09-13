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
import { ScrollProgress } from "@/components/scroll-progress";

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
    <>
    <ScrollProgress />
    <main className="mx-auto max-w-[1400px] px-5 pb-20 sm:px-10">
      <div className="flex flex-col gap-4 pt-7 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-[34px] leading-[1.05] tracking-[-0.015em] sm:text-[40px]">
            {category.name}
          </h1>
          <p className="mt-2 text-[13.5px] text-muted-foreground">
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
        <div className="mt-24 mb-16 text-center">
          <p className="font-[family-name:var(--font-display)] text-2xl">
            {query
              ? "Nothing matched that search here"
              : "No live auctions in this category"}
          </p>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
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
    </>
  );
}
