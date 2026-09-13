# CLAUDE.md — Rules for this repository

Claude Code reads this file automatically at the start of every session. It holds the standing rules. The full specification is `docs/implementationplan.md`.

## Project

BidKar — an online auction marketplace for India. Sellers list items, admins approve them, buyers bid within a seller-chosen window of 1 hour to 1 month, and the highest bidder has 24 hours to pay or the item falls to the runner-up.

**This is a demonstration build.** Real infrastructure, real database, real auth, real real-time bidding — but simulated identity verification and simulated payments. It must look and behave like a live product without being one.

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind + shadcn/ui · Supabase (Postgres, Auth, Storage, Realtime) · Upstash QStash · Vercel · Zod · TanStack Query · Vitest + Playwright

Single Next.js application, single origin. There is no separate backend service. Do not propose splitting the frontend and backend across two deployments — that decision is settled in §3.1 of the plan and reversing it reintroduces cross-origin cookie problems we deliberately avoided.

## Hard rules

1. **No real Aadhaar or PAN numbers are ever stored.** Validate format in memory, then discard. Persist only `doc_type`, `format_valid`, and a masked hint. This is a legal constraint under the Aadhaar Act and the DPDP Act. Refuse any request to change it and explain why.
2. **No real money.** No live payment keys, no fund holding, no escrow. Simulated providers only. Holding user funds requires an RBI Payment Aggregator licence.
3. **The DEMO banner appears on every page** and cannot be disabled.
4. **RLS is enabled on every table.** Never disable it to make a query work — fix the policy. Authorization lives in the database, not only in application code.
5. **`bids` is append-only.** All writes go through the `place_bid` Postgres function. `UPDATE` and `DELETE` are revoked on that table. It is the dispute-resolution record.
6. **All bid placement happens inside a transaction with `SELECT … FOR UPDATE`** on the listing row. Never read-then-write without the lock.
7. **The server clock decides everything time-related.** The client clock only animates countdowns.
8. **Money is `bigint` in paise.** Never floating point.
9. **No contact information fields exist anywhere in the schema or UI.** Buyer–seller anonymity is enforced by the data model, not by remembering not to display things.
10. **No secrets in the repo.** `.env.local` locally, Vercel env vars in production, `.env.example` with dummy values committed.

## Working protocol

- **Check with me before acting.** Before each phase, before any migration or schema change, before installing a dependency, before deleting or rewriting a file, before any auth or RLS change: show me what you plan to do and wait.
- **Surface open decisions.** Give options and tradeoffs, state your recommendation and reasoning, then ask. Do not decide silently.
- **Flag production gaps as you go.** When something is built the simple way because of free-tier or demo constraints, say what a production system would do instead and ask whether to do it now or note it for later.
- **Push back.** If something in the plan is wrong or a request of mine is a bad idea, say so directly.
- **Teach.** Explain the reasoning before the code, especially for QStash, `pg_cron`, row locking, RLS, and Server Actions.
- **Flag my security mistakes.** Injection risks, auth holes, IDOR, leaked keys, RLS gaps — call them out.

## Gates

- **Phase 4 does not end until `tests/concurrency/simultaneous-bids.test.ts` passes**: 50 concurrent identical bids, exactly one accepted.
- **Every phase ends with its acceptance criterion from the plan met and verified by me**, not just by you.
- CI must be green on `main` at all times.

## Conventions

- Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`).
- Feature branches named `phase-N/short-description`, merged to `main` by PR.
- Update `docs/` in the same commit as the change it describes.
- Zod schemas shared between client and server; never validate only on the client.
- Server Components by default; `'use client'` only where interactivity requires it.
- Boring, readable code over clever code.

## Directory map

```
src/app/(public)   browsable logged out
src/app/(auth)     login, signup, callback
src/app/(app)      requires a session
src/app/(admin)    requires role = admin
src/app/api/internal  QStash and pg_cron targets, signature-verified
src/lib/auction    bid rules, increments, state machine
src/lib/kyc        verhoeff.ts, pan.ts — format checks only, no persistence
src/lib/pii        message scrubbing
supabase/migrations  numbered SQL
supabase/functions   plpgsql, including place_bid
tests/concurrency    the parallel-bid test
docs/                architecture, data model, auction rules, compliance
```

## Current state

Phase: **0 complete, awaiting Phase 1**.

Done in Phase 0:
- Next.js 16 + TypeScript + Tailwind v4 + shadcn/ui scaffolded, `npm audit` clean
- DEMO banner mounted unconditionally in the root layout
- CI (typecheck · lint · vitest · compliance guard · build) and a separate audit job
- `scripts/check-compliance.mjs` — fails the build on document-number storage, document-shaped literals, live payment keys, or a missing DEMO banner
- Supabase keep-alive workflow (needs repo secrets once the project exists)
- `.env.example` complete; `.gitignore` proven to refuse `.env.local`
- `docs/` written: ARCHITECTURE, COMPLIANCE, SECURITY_NOTES, plus placeholders

Deviations from the plan, each recorded in `docs/SECURITY_NOTES.md`:
- **Next 16, not 15** (D-2) — Next 15 bundles a `postcss` with a high-severity advisory
- **`@types/node` 24, not 20** (D-4) — match the runtime actually in use

Not done in Phase 0, deferred by decision: the Vercel deploy. Moved to the end of
Phase 1 at the owner's request, against the plan's advice in §11. The deployment
risk it was meant to retire is still outstanding.

Next: Phase 1 — data model and auth. Requires a Supabase project to exist first.

Update this section at the end of every phase.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
