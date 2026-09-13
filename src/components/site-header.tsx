import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";

/**
 * Site header. Server component, so the signed-in state is resolved before the
 * page reaches the browser and there is no logged-out flash.
 *
 * It shows a handle, never an email address — even to the account owner in a
 * shared-screen situation. The handle is the identity this product uses.
 */
export async function SiteHeader() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let handle: string | null = null;
  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("handle")
      .eq("id", user.id)
      .single();
    handle = data?.handle ?? null;
  }

  return (
    <header className="border-b">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
        <Link href="/" className="font-semibold tracking-tight">
          BidKar
        </Link>

        <nav className="flex items-center gap-2">
          {user ? (
            <>
              <Link
                href="/account"
                className="text-muted-foreground hover:text-foreground font-mono text-xs transition-colors"
              >
                {handle ?? "account"}
              </Link>
              <Button asChild size="sm" variant="outline">
                <Link href="/account">Account</Link>
              </Button>
            </>
          ) : (
            <>
              <Button asChild size="sm" variant="ghost">
                <Link href="/login">Sign in</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/signup">Create account</Link>
              </Button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
