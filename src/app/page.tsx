import { Button } from "@/components/ui/button";

const PHASES = [
  { n: 0, name: "Foundations", done: true },
  { n: 1, name: "Data model and auth", done: false },
  { n: 2, name: "Public browsing", done: false },
  { n: 3, name: "Selling and moderation", done: false },
  { n: 4, name: "The bidding engine", done: false },
  { n: 5, name: "Closure and settlement", done: false },
  { n: 6, name: "Simulated KYC and payment", done: false },
  { n: 7, name: "Anonymity, social, polish", done: false },
];

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <p className="text-muted-foreground font-mono text-xs tracking-widest uppercase">
        Phase 0 · Foundations
      </p>

      <h1 className="mt-3 text-4xl font-semibold tracking-tight">BidKar</h1>

      <p className="text-muted-foreground mt-4 text-lg leading-relaxed">
        An online auction marketplace for India. Sellers list items, admins
        approve them, buyers bid within a window of one hour to one month, and
        the highest bidder has 24 hours to pay.
      </p>

      <div className="bg-card mt-10 rounded-lg border p-6">
        <h2 className="text-sm font-semibold tracking-wide uppercase">
          What is real, and what is not
        </h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="font-medium text-emerald-500">Real</dt>
            <dd className="text-muted-foreground mt-1 leading-relaxed">
              Postgres with row-level security, cookie-based auth, real-time
              bidding with row-locked atomic bid placement, scheduled auction
              closure, and a live deployment.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-amber-500">Simulated</dt>
            <dd className="text-muted-foreground mt-1 leading-relaxed">
              Identity verification is a format check only — no document number
              is ever stored. Payments are mocked end to end. No funds are
              held, routed, or settled.
            </dd>
          </div>
        </dl>
      </div>

      <div className="mt-10">
        <h2 className="text-sm font-semibold tracking-wide uppercase">
          Build progress
        </h2>
        <ol className="mt-4 space-y-1.5 font-mono text-sm">
          {PHASES.map((phase) => (
            <li key={phase.n} className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className={
                  phase.done
                    ? "text-emerald-500"
                    : "text-muted-foreground/40"
                }
              >
                {phase.done ? "[x]" : "[ ]"}
              </span>
              <span
                className={
                  phase.done ? "" : "text-muted-foreground/60"
                }
              >
                Phase {phase.n} — {phase.name}
              </span>
            </li>
          ))}
        </ol>
      </div>

      <div className="mt-10 flex flex-wrap gap-3">
        <Button asChild>
          <a href="https://github.com/sahillroy/Bidding_App">
            Source on GitHub
          </a>
        </Button>
        <Button asChild variant="outline">
          <a href="https://github.com/sahillroy/Bidding_App/blob/main/docs/implementationplan.md">
            Implementation plan
          </a>
        </Button>
      </div>
    </main>
  );
}
