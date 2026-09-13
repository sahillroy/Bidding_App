import { TriangleAlert } from "lucide-react";

/**
 * Sitewide DEMO banner.
 *
 * This component is mounted in the root layout and is rendered on every page.
 * It takes no props and has no "hide" or "dismiss" behaviour, deliberately.
 *
 * Why it exists (see docs/implementationplan.md §1.1 and §2):
 *   - This site simulates identity verification and payments. Without a
 *     visible, permanent notice, it could be mistaken for a live
 *     money-handling service, which creates real legal exposure under the
 *     Payment and Settlement Systems Act 2007 and misleads users into
 *     entering real personal data.
 *   - It is a server component with no client state so there is no code path,
 *     and no prop, that can switch it off.
 *
 * Do not add a `dismissible` prop. Do not gate it behind an environment
 * variable. NEXT_PUBLIC_DEMO_MODE exists for other demo affordances; this
 * banner does not read it, because a missing or misconfigured env var must
 * never be able to remove the notice.
 *
 * Amber is reserved for this banner alone across the whole design, so the
 * notice never reads as just another status chip.
 */
export function DemoBanner() {
  return (
    <div
      role="region"
      aria-label="Demonstration site notice"
      className="border-b border-amber-500/25 bg-amber-500/[0.08]"
    >
      <div className="mx-auto flex max-w-[1400px] items-start gap-2.5 px-5 py-2.5 text-[12.5px] leading-snug text-amber-200/85 sm:items-center sm:px-10">
        <TriangleAlert
          aria-hidden="true"
          className="mt-0.5 size-[15px] shrink-0 text-amber-400 sm:mt-0"
        />
        <p>
          <span className="text-[11px] font-bold tracking-[0.1em] text-amber-400">
            DEMO
          </span>
          <span className="mx-2 opacity-30" aria-hidden="true">
            |
          </span>
          <span className="hidden sm:inline">
            This is a demonstration project. No real money moves and no real
            identity documents are stored.{" "}
          </span>
          <span className="sm:hidden">No real money moves. </span>
          <strong className="font-semibold text-amber-100/90">
            Do not enter a real Aadhaar or PAN number.
          </strong>
        </p>
      </div>
    </div>
  );
}
