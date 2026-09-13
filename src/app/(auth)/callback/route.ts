import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeRedirectPath } from "@/lib/validation/auth";

/**
 * Auth callback. Handles the email confirmation link, and OAuth once it is
 * wired up in a later phase.
 *
 * Supabase sends the user here with a one-time `code`, which is exchanged for
 * a session. The exchange has to happen in a Route Handler rather than a
 * Server Component because it sets cookies.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeRedirectPath(searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=invalid_code`);
  }

  // `origin` comes from the incoming request URL, and `next` has already been
  // constrained to a site-relative path, so this cannot be pointed off-site.
  return NextResponse.redirect(`${origin}${next}`);
}
