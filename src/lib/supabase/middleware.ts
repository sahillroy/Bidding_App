import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Session refresh, and route-group gating.
 *
 * WHY MIDDLEWARE IS NEEDED AT ALL
 *
 * Supabase sessions are short-lived JWTs paired with a long-lived refresh
 * token. Server Components cannot set cookies, so if the access token expired
 * between requests, a Server Component would read a stale session and treat a
 * logged-in user as anonymous. Middleware runs before the request is handled
 * and *can* write cookies, so it is the one place the token can be refreshed.
 *
 * Without this, users appear randomly logged out roughly every hour.
 *
 * WHAT THIS IS NOT
 *
 * The redirects below are user experience, not security. Middleware can be
 * misconfigured, its matcher can miss a route, and a Route Handler can be
 * called directly. The actual boundary is Row Level Security in Postgres: even
 * if every check here were deleted, a user still could not read another user's
 * data. Treat this as "send people somewhere sensible", never as "keep people
 * out".
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: getUser(), not getSession().
  //
  // getSession() reads the JWT straight out of the cookie and decodes it
  // without verification — a user can edit that cookie, so its contents are
  // attacker-controlled. getUser() revalidates the token against the Supabase
  // auth server, so the answer can be trusted.
  //
  // This call must also not be removed or reordered: it is what triggers the
  // token refresh that the whole middleware exists for.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  const isAuthRoute =
    pathname.startsWith("/login") || pathname.startsWith("/signup");

  // Route groups like (app) and (admin) are a source-layout concept and do not
  // appear in URLs, so the protected prefixes are listed explicitly.
  const protectedPrefixes = [
    "/sell",
    "/verify",
    "/bids",
    "/orders",
    "/messages",
    "/account",
    "/admin",
  ];
  const isProtected = protectedPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // Preserve where they were going so login can send them back. Only the
    // path is kept, never a full URL from the query string — echoing an
    // attacker-supplied absolute URL into a redirect is an open-redirect hole.
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // The response object must be returned as-is. Constructing a new one here
  // would drop the refreshed auth cookies set above, and the session would be
  // lost on the next request.
  return supabaseResponse;
}
