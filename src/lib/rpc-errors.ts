/**
 * Map the exception codes raised by our plpgsql functions to a message a
 * person can act on.
 *
 * Postgres exceptions arrive as `error.message`. We raise a short token
 * (`NOT_ADMIN`, `LISTING_NEEDS_IMAGE`) so the UI does not depend on the
 * surrounding "P0001: ..." wrapper staying stable.
 */

const MESSAGES: Record<string, string> = {
  NOT_AUTHENTICATED: "Sign in to continue.",
  ACCOUNT_NOT_ACTIVE: "This account cannot do that right now.",
  LISTING_NOT_FOUND: "That listing does not exist.",
  NOT_SELLER: "You can only submit your own listings.",
  NOT_EDITABLE: "That listing is no longer editable.",
  LISTING_NEEDS_IMAGE: "Add at least one photo before submitting.",
  NOT_ADMIN: "Only an administrator can do that.",
  NOT_PENDING: "That listing is not waiting for review.",
  REVIEW_NOTE_REQUIRED: "Explain the rejection in at least 8 characters.",
  REVIEW_NOTE_TOO_LONG: "Keep the review note under 2,000 characters.",
};

const TOKEN = /[A-Z][A-Z_]+/;

export function messageForRpcError(error: { message?: string } | null): string {
  const raw = error?.message ?? "";
  const match = raw.match(TOKEN);
  if (match && MESSAGES[match[0]]) return MESSAGES[match[0]];
  return "Something went wrong. Please try again.";
}
