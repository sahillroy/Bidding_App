import Link from "next/link";
import { getPendingListings } from "@/lib/listings/admin";
import { formatPaise } from "@/lib/money";

export const metadata = { title: "Listing approval" };
export const dynamic = "force-dynamic";

export default async function AdminListingsPage() {
  const listings = await getPendingListings();

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <p className="text-muted-foreground text-sm">
        <Link href="/admin" className="underline">
          Admin
        </Link>
      </p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">
        Listing approval
      </h1>
      <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">
        Every new listing enters this queue. Nothing here is visible on the
        public site — that is a Row Level Security policy, not a filter in this
        page.
      </p>

      {listings.length === 0 ? (
        <p className="text-muted-foreground mt-16 text-center text-sm">
          The queue is empty.
        </p>
      ) : (
        <ul className="mt-8 divide-y rounded-lg border">
          {listings.map((listing) => (
            <li key={listing.id}>
              <Link
                href={`/admin/listings/${listing.id}`}
                className="hover:bg-muted/50 flex flex-col gap-1 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium">{listing.title}</p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {listing.category_name ?? "Uncategorised"}
                    <span className="mx-1.5 opacity-40">·</span>
                    {formatPaise(BigInt(listing.starting_price))}
                  </p>
                </div>
                {listing.sanity.flagged && (
                  <span className="bg-destructive/10 text-destructive rounded px-2 py-1 text-[11px] font-medium tracking-wide uppercase">
                    Price flag
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
