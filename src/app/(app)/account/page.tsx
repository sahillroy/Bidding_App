import { createClient } from "@/lib/supabase/server";
import { logout } from "../../(auth)/actions";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Your account" };

export default async function AccountPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // RLS decides what comes back here. This selects the caller's own row only,
  // because the "users read their own profile" policy scopes it to auth.uid().
  // Passing another user's id would return nothing rather than their data.
  const { data: profile } = await supabase
    .from("profiles")
    .select("handle, role, kyc_status, account_status, strike_count, created_at")
    .eq("id", user!.id)
    .single();

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Your account</h1>

      <div className="bg-card mt-8 rounded-lg border p-6">
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Your handle</dt>
            <dd className="mt-1 font-mono">{profile?.handle ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Email</dt>
            <dd className="mt-1">{user?.email}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Identity check</dt>
            <dd className="mt-1 capitalize">{profile?.kyc_status ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Account status</dt>
            <dd className="mt-1 capitalize">{profile?.account_status ?? "—"}</dd>
          </div>
        </dl>

        <p className="text-muted-foreground mt-6 border-t pt-4 text-xs leading-relaxed">
          Your handle is the only thing other users see. Your email address is
          never shown to another user, and this site stores no phone number or
          address for anyone.
        </p>
      </div>

      <form action={logout} className="mt-8">
        <Button type="submit" variant="outline">
          Sign out
        </Button>
      </form>
    </main>
  );
}
