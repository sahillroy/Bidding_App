import Link from "next/link";

export const metadata = { title: "Check your email" };

export default function CheckEmailPage() {
  return (
    <div className="mx-auto w-full max-w-sm px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Check your email</h1>
      <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
        If that address can be registered, a confirmation link is on its way.
        Open it to finish creating your account.
      </p>
      <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
        The link expires after an hour. Nothing else was sent to that address.
      </p>
      <p className="mt-6 text-sm">
        <Link href="/login" className="text-foreground underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
