import { TriangleAlert } from "lucide-react";

/**
 * Sitewide DEMO banner.
 *
 * This component is mounted in the root layout and is rendered on every page.
 * It takes no props and has no "hide" or "dismiss" behaviour, deliberately.
 *
 * Why it exists (see implementationplan.md §1.1 and §2):
 *   - This site simulates identity verification and payments. Without a visible,
 *     permanent notice, it could be mistaken for a live money-handling service,
 *     which creates real legal exposure under the Payment and Settlement Systems
 *     Act 2007 and misleads users into entering real personal data.
 *   - It is a server component with no client state so there is no code path,
 *     and no prop, that can switch it off.
 *
 * Do not add a `dismissible` prop. Do not gate it behind an environment
 * variable. NEXT_PUBLIC_DEMO_MODE exists for other demo affordances; this
 * banner does not read it, because a missing or misconfigured env var must
 * never be able to remove the notice.
 */
export function DemoBanner() {
  return (
    <div
      role="region"
      aria-label="Demonstration site notice"
      className="sticky top-0 z-50 w-full border-b border-amber-500/40 bg-amber-500/15 text-amber-100 backdrop-blur"
    >
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2 text-xs sm:text-sm">
        <TriangleAlert
          aria-hidden="true"
          className="size-4 shrink-0 text-amber-400"
        />
        <p className="leading-tight">
          <span className="font-semibold tracking-wide">DEMO</span>
          <span className="mx-2 opacity-50">|</span>
          This is a demonstration project. No real money moves and no real
          identity documents are collected or stored.{" "}
          <span className="font-medium">
            Do not enter a real Aadhaar or PAN number.
          </span>
        </p>
      </div>
    </div>
  );
}
