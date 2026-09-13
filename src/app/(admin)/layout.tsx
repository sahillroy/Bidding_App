import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Layout for admin-only routes.
 *
 * The role is read from the database, never from the JWT or from anything the
 * client sent. A JWT claim would be faster, but it is a snapshot: an admin
 * demoted five minutes ago would keep their access until the token expired.
 *
 * Note this reads `profiles`, which is itself RLS-protected — the query returns
 * the caller's own row under the "users read their own profile" policy, so the
 * check cannot be tricked into reading somebody else's role.
 *
 * A non-admin gets 404, not 403. A 403 confirms that /admin exists and is worth
 * attacking; a 404 says nothing. The admin surface is not a secret, but there is
 * no reason to advertise it either.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    notFound();
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    notFound();
  }

  return <>{children}</>;
}
