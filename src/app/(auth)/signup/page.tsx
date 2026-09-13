"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signup, type AuthState } from "../actions";
import { Button } from "@/components/ui/button";

export default function SignupPage() {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    signup,
    {},
  );

  return (
    <div className="mx-auto w-full max-w-sm px-6 py-20">
      <h1 className="font-[family-name:var(--font-display)] text-[32px] leading-tight tracking-[-0.015em]">Create an account</h1>
      <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
        You will be given an anonymous handle such as{" "}
        <code className="bg-muted rounded px-1 py-0.5 text-xs">
          bidder_7f2a1c
        </code>
        . That handle is the only thing other users ever see.
      </p>

      <form action={formAction} className="mt-8 space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="email" className="text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="w-full rounded-lg border border-border bg-[#0E1116] px-3 py-2.5 text-sm outline-none transition-colors duration-200 focus-visible:border-[rgba(62,123,250,0.6)] focus-visible:ring-2 focus-visible:ring-[var(--bk-accent)]/40"
          />
          {state.fieldErrors?.email && (
            <p className="text-destructive text-xs">
              {state.fieldErrors.email[0]}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="password" className="text-sm font-medium">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            className="w-full rounded-lg border border-border bg-[#0E1116] px-3 py-2.5 text-sm outline-none transition-colors duration-200 focus-visible:border-[rgba(62,123,250,0.6)] focus-visible:ring-2 focus-visible:ring-[var(--bk-accent)]/40"
          />
          <p className="text-muted-foreground text-xs">
            At least 8 characters. A memorable phrase beats a short scramble.
          </p>
          {state.fieldErrors?.password && (
            <p className="text-destructive text-xs">
              {state.fieldErrors.password[0]}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="confirmPassword" className="text-sm font-medium">
            Confirm password
          </label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            className="w-full rounded-lg border border-border bg-[#0E1116] px-3 py-2.5 text-sm outline-none transition-colors duration-200 focus-visible:border-[rgba(62,123,250,0.6)] focus-visible:ring-2 focus-visible:ring-[var(--bk-accent)]/40"
          />
          {state.fieldErrors?.confirmPassword && (
            <p className="text-destructive text-xs">
              {state.fieldErrors.confirmPassword[0]}
            </p>
          )}
        </div>

        {state.error && (
          <p
            role="alert"
            className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border px-3 py-2 text-sm"
          >
            {state.error}
          </p>
        )}

        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Creating account…" : "Create account"}
        </Button>
      </form>

      <p className="text-muted-foreground mt-6 text-sm">
        Already have an account?{" "}
        <Link href="/login" className="text-foreground underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
