import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for Client Components.
 *
 * Only ever the anon key. Every query this makes is subject to Row Level
 * Security, which is the only thing standing between a visitor and the
 * database — a browser client is fully under the user's control, so anything
 * it is permitted to do, a determined user can do.
 *
 * Used in Phase 4 for the Realtime bid subscription, and for auth calls that
 * need to run in the browser.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
