import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Layout for every route that requires a session.
 *
 * This is the second of three layers, and none of them is redundant:
 *
 *   1. Middleware redirects anonymous users away. That is UX — it can miss a
 *      route through a matcher mistake, and it does not run for every
 *      invocation path.
 *   2. This layout re-checks server-side, so a page cannot render for an
 *      anonymous user even if the middleware were bypassed.
 *   3. Row Level Security in Postgres. This is the layer that actually holds.
 *      If 1 and 2 were both deleted, a user still could not read another
 *      user's data.
 *
 * Layers 1 and 2 exist to produce a sensible experience and to fail closed
 * early. Layer 3 exists because the other two are code, and code has bugs.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  // getUser(), never getSession(): getSession() decodes the cookie without
  // verifying it, and the cookie is under the user's control.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return <>{children}</>;
}
