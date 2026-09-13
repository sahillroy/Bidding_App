import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Run on every path except static assets and image files.
     *
     * The session refresh has to happen on ordinary page requests, including
     * public ones — a logged-in user browsing the public catalogue still needs
     * their token refreshed, or they will appear logged out when they finally
     * click Bid.
     *
     * Static assets are excluded because refreshing a session to serve a .svg
     * is wasted work on every single request.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
