import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 *
 * Uses the ANON key, so every query it runs is subject to Row Level Security.
 * That is the point: server code holding a key that bypasses RLS is one bug
 * away from serving another user's data, and we would never find out.
 *
 * The anon key being public is not a leak. It identifies the project; what it
 * can actually do is defined entirely by the RLS policies in
 * supabase/migrations. For the key that *does* bypass RLS, see
 * createAdminClient below.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Components cannot set cookies. This throw is expected and
            // harmless: the middleware refreshes the session on every request,
            // so the cookie is already current by the time we get here.
            //
            // Swallowing it in a Server Action or Route Handler would be a bug,
            // but those contexts can set cookies, so they never reach here.
          }
        },
      },
    },
  );
}

/**
 * Service-role client. Bypasses Row Level Security completely.
 *
 * ─────────────────────────────────────────────────────────────────────────
 *  DO NOT REACH FOR THIS TO MAKE A FAILING QUERY WORK.
 *
 *  A query that fails under RLS is telling you the policy is wrong. Fix the
 *  policy. Using this client to route around it moves authorization out of
 *  the database and into whichever code path happened to call it, which is
 *  exactly the mistake RLS exists to prevent. See CLAUDE.md hard rule 4.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Legitimate uses, and essentially only these:
 *   - QStash callback handlers in /api/internal, which act as the system and
 *     have no user session at all
 *   - the pg_cron sweep target
 *   - seed scripts
 *
 * It reads SUPABASE_SERVICE_ROLE_KEY, which has no NEXT_PUBLIC_ prefix, so
 * Next.js will not inline it into the client bundle. Importing this module
 * from a Client Component is a build error rather than a silent key leak —
 * which is why it lives in its own export and not alongside the browser client.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. This client bypasses RLS and " +
        "must only ever run on the server.",
    );
  }

  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    cookies: {
      // No cookies: this client is deliberately session-less. It acts as the
      // system, not as a user, so auth.uid() is null inside its queries.
      getAll() {
        return [];
      },
      setAll() {},
    },
  });
}
