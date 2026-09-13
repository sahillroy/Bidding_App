import Link from "next/link";
import { countPendingListings } from "@/lib/listings/admin";

export const metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const pending = await countPendingListings();

  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        You can see this page because your profile row has{" "}
        <code className="bg-muted rounded px-1 py-0.5 text-xs">
          role = &apos;admin&apos;
        </code>
        . Anyone else gets a 404. The role is read from the database on every
        request, not from the JWT.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Link
          href="/admin/listings"
          className="bg-card hover:border-foreground/30 rounded-lg border p-5 transition-colors"
        >
          <h2 className="text-sm font-semibold">Listing approval</h2>
          <p className="text-muted-foreground mt-1.5 text-sm">
            {pending === 0
              ? "The queue is empty."
              : `${pending} ${pending === 1 ? "listing" : "listings"} waiting.`}
          </p>
        </Link>
        <div className="bg-card rounded-lg border p-5">
          <h2 className="text-sm font-semibold">Identity checks</h2>
          <p className="text-muted-foreground mt-1.5 text-sm">
            Built in Phase 6.
          </p>
        </div>
      </div>
    </main>
  );
}
