import { getCategories } from "@/lib/listings";
import { ListingWizard } from "@/components/sell/listing-wizard";

export const metadata = { title: "List an item" };
export const dynamic = "force-dynamic";

export default async function NewListingPage() {
  const categories = await getCategories();

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">List an item</h1>
      <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">
        Five steps. The listing is a draft until you submit it, and it stays
        invisible to everyone else until an administrator approves it.
      </p>
      <div className="mt-8">
        <ListingWizard listing={null} categories={categories} initialStep={1} />
      </div>
    </main>
  );
}
