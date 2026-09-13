import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";

/**
 * Site header. Server component, so the signed-in state is resolved before the
 * page reaches the browser and there is no logged-out flash.
 *
 * It shows a handle, never an email address — even to the account owner. The
 * handle is the identity this product uses.
 */
export async function SiteHeader() {
  /*
    Anonymous browsing must survive the database being unavailable.

    The Supabase free tier pauses a project after seven days of inactivity and
    then returns HTTP 540. Without the catch below, that would 500 the root
    layout and take down every page — including the public catalogue that is
    specified to be browsable without an account at all.

    Failing to "render as if signed out" is the correct degraded state. It is
    NOT a security weakness: nothing is granted on this path, every protected
    route re-checks the session server-side, and all of it is backed by RLS.
  */
  let user: { id: string } | null = null;
  let handle: string | null = null;
  let isAdmin = false;

  try {
    const supabase = await createClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    user = authUser;

    if (user) {
      const { data } = await supabase
        .from("profiles")
        .select("handle, role")
        .eq("id", user.id)
        .single();
      handle = data?.handle ?? null;
      isAdmin = data?.role === "admin";
    }
  } catch {
    // Rendered signed-out. See above.
  }

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--bk-line)] bg-background/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-6 px-5 py-3.5 sm:px-10">
        <Link
          href="/"
          className="flex items-baseline gap-[3px] font-[family-name:var(--font-display)] text-[25px] leading-none tracking-[-0.01em] outline-none focus-visible:ring-2 focus-visible:ring-[var(--bk-accent)] focus-visible:ring-offset-4 focus-visible:ring-offset-background"
        >
          <span>Bid</span>
          <span className="text-[var(--bk-accent)]">Kar</span>
        </Link>

        <nav className="flex items-center gap-2.5">
          {/* Their Phase 3 route. Always visible: a logged-out visitor
              clicking Sell lands on login, which is the honest prompt. */}
          <Button asChild size="sm" variant="ghost">
            <Link href="/sell">Sell</Link>
          </Button>
          {user ? (
            <>
              {isAdmin && (
                <Button asChild size="sm" variant="ghost">
                  <Link href="/admin">Admin</Link>
                </Button>
              )}
              <Link
                href="/account"
                className="tnum hidden rounded-full border border-border px-3 py-[7px] font-mono text-xs text-[var(--bk-subtle)] transition-colors duration-200 hover:border-[rgba(62,123,250,0.5)] hover:text-foreground sm:inline-block"
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
