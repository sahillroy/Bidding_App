import { z } from "zod";

/**
 * Auth input schemas, shared between the client and the server.
 *
 * The same schema object is imported by the form (for instant feedback) and by
 * the Server Action (for the check that actually counts). Client-side
 * validation is a convenience and nothing more — anyone can POST directly to a
 * Server Action with whatever body they like, so the server must re-validate
 * every field. See CLAUDE.md conventions.
 */

export const emailSchema = z
  .string()
  .trim()
  .min(1, "Email is required")
  .email("That does not look like an email address")
  .max(254, "That email address is too long"); // RFC 5321 limit

/**
 * Minimum eight characters, matching Supabase Auth's own default.
 *
 * Deliberately no complexity rules — no "must contain a symbol". NIST SP
 * 800-63B recommends against them: they push people toward predictable
 * substitutions like Passw0rd! while blocking good passphrases. Length is what
 * actually helps.
 *
 * The upper bound exists because bcrypt silently truncates beyond 72 bytes; a
 * user whose 100-character password "works" but is really only checking the
 * first 72 should be told, not quietly accommodated.
 */
export const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters")
  .max(72, "Use at most 72 characters");

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required"),
});

export const signupSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Those passwords do not match",
    path: ["confirmPassword"],
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type SignupInput = z.infer<typeof signupSchema>;

/**
 * Validate a post-login redirect target.
 *
 * The `next` parameter comes from the URL, so it is attacker-controlled. If it
 * were used unchecked, a link like
 *
 *     https://our-site/login?next=https://evil.example/harvest
 *
 * would bounce a freshly authenticated user onto an attacker's page that looks
 * like ours. That is an open redirect, and it is a genuinely common finding.
 *
 * Only a site-relative single-slash path is allowed. `//evil.example` is
 * rejected because a protocol-relative URL is absolute in a browser despite
 * looking like a path.
 */
export function safeRedirectPath(next: string | null | undefined): string {
  if (!next) return "/";
  if (!next.startsWith("/")) return "/";
  if (next.startsWith("//")) return "/";
  if (next.includes("\\")) return "/"; // some parsers treat \ as /
  return next;
}
