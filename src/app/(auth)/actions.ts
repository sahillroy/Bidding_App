"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  loginSchema,
  signupSchema,
  safeRedirectPath,
} from "@/lib/validation/auth";

export type AuthState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

/**
 * Why every failure returns the same message.
 *
 * "No account with that email" and "wrong password" are different facts, and
 * telling them apart turns the login form into an account-enumeration oracle:
 * an attacker can discover which addresses are registered, which is useful for
 * credential stuffing and for phishing. One message for both costs a little
 * clarity and removes the oracle.
 */
const GENERIC_CREDENTIALS_ERROR = "That email or password is not correct.";

export async function login(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  // Re-validated on the server. The browser already checked this, but a Server
  // Action is a public HTTP endpoint and anyone can post whatever they like.
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return { error: GENERIC_CREDENTIALS_ERROR };
  }

  revalidatePath("/", "layout");
  redirect(safeRedirectPath(formData.get("next")?.toString()));
}

export async function signup(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = signupSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    // Supabase deliberately does not reveal whether an address is already
    // registered, and neither do we. The success path below says "check your
    // email", which is true either way.
    return { error: "Could not create that account. Please try again." };
  }

  // The profile row, and the generated handle, are created by the
  // on_auth_user_created trigger in migration 0002 — not here. A trigger cannot
  // be skipped; application code can.

  revalidatePath("/", "layout");
  redirect("/signup/check-email");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}
