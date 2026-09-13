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

Phase: **3 complete, awaiting Phase 4**.

Done in Phase 3:
- Seller wizard at `/sell` and `/sell/new` / `/sell/[id]`: details → photos →
  pricing → duration → review. Drafts are private; submit calls `submit_listing`
- Images: browser canvas → WebP, 8-image cap, public `listing-images` bucket
  (migration 0012). Server re-checks magic bytes and size. No new dependency
- Admin queue at `/admin/listings` with the §2.5 prohibited-goods checklist
  and a price-sanity flag (10× / 0.1× the category median; ₹10 lakh if fewer
  than 3 live peers). Flag only — never auto-reject
- `approve_listing` / `reject_listing` / `submit_listing`: security definer,
  pinned `search_path`. Approve writes `approved` then `went_live` and takes
  the row live immediately (D-7). QStash close scheduling is Phase 5
- Seed: two pending listings (one ordinary, one ₹10 crore laptop) and one
  rejected listing so the queue is demoable after `db:reset`
- Acceptance: a seller-created listing is invisible to `anon` and to search
  until an admin approves it. Covered by `tests/integration/rls.test.ts`
- `npm run setup:local` for a Docker machine: writes local CLI JWTs into
  `.env.local`, starts Supabase, resets migrations + seed
- Owner-laptop checks: typecheck, lint, compliance, 56 unit tests, `next build`
  all green. RLS suite (22 tests) and the browser click-path need Docker —
  not present on the owner laptop. Not signed off until a Docker machine
  runs `test:integration` and the README acceptance path
- Session hand-off for the next chat: `context.md`

Done in Phase 2:
- Public catalogue at `/`, category pages, listing detail — all server-rendered
  and fully usable logged out. 50/50 tests pass
- Postgres full-text search (migration 0010): generated tsvector, GIN index, and
  `search_listings()` which is deliberately NOT security definer, so RLS still
  applies and unapproved listings stay unsearchable
- `server_now()` (migration 0011) anchors every countdown to the database clock
- `supabase/seed.sql` — 8 categories, 6 sellers, 1 admin, 41 live auctions.
  `npm run db:reset` reproduces the whole demo dataset deterministically
- Generated database types in `src/types/database.ts`, wired into every client.
  **Regenerate after any migration**, or queries silently lose their types:
  `npx supabase gen types typescript --local > src/types/database.ts`
- `src/lib/money.ts` (paise, en-IN grouping), `src/lib/auction/increments.ts`
  (the §6.2 bands, reused by Phase 4), `src/lib/time.ts` (skew-corrected countdown)
- `tsconfig` target raised to ES2022 — bigint literals need ES2020 or later, and
  the whole money design depends on them

Demo admin login: admin@example.test / demo-password-not-secret

Known gap, not a bug: search has no synonyms, so "camera" does not match a
listing titled "DSLR". Real marketplaces maintain a synonym dictionary. Noted
rather than fixed.

Done in Phase 1:
- All 9 migrations (`supabase/migrations/0001`–`0009`), applied and **verified
  against a real Postgres 17.6** via the local Supabase stack
- RLS enabled *and forced* on every table; `force` matters, or the table owner
  bypasses every policy and the policies become untestable
- Supabase Auth with email/password; signup trigger creates the profile row and
  its generated handle, so it cannot be skipped
- Three Supabase clients: anon (RLS applies) for server and browser, and a
  service-role client that bypasses RLS — for QStash and cron targets only,
  never to work around a failing query
- Session-refresh middleware, `(app)` and `(admin)` route groups, login, signup,
  logout, account page
- `tests/integration/rls.test.ts` — 14 tests, **passing**. 20/20 overall

Phase 1 acceptance criterion, demonstrated live:
`anon → GET /rest/v1/profiles` returns `42501 permission denied`, while
`public_profiles` returns handles only.

Decisions taken in Phase 1 (each raised with a recommendation first):
- `text` + `CHECK` rather than Postgres `ENUM` — enum values cannot be removed
- `current_price` NULL until the first bid — fixes a real bug in plan §6.3
- 6-hex handles, not the plan's 4 — 4 collides at ~300 users
- Email/password first; Google OAuth deferred until a deployed origin exists

Bugs found by actually running things, not by reading:
- Migrations failed on first execution — `is_admin()` in 0001 read `profiles`
  from 0002. `language sql` bodies are validated eagerly at CREATE, so it failed
  immediately; a plpgsql body would have hidden it until first call
- The RLS suite silently **skipped** without env vars, and "14 skipped" reads
  like success. Vitest now loads `.env.local` itself
- `SiteHeader` could 500 every page when Supabase pauses (free tier, HTTP 540),
  taking down anonymous browsing. Now degrades to signed-out (D-5)

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
- **Vitest 4, not 5** (D-6) — Vitest 5 needs a native rolldown binding that npm
  drops from the lockfile on every targeted install. Do not "upgrade" it back

**Vercel deploy is deferred until Phases 0–7 are complete**, at the owner's
request. No hosted Supabase project exists either — everything so far runs
against the local stack. The keep-alive workflow stays inert until both exist
and its repo secrets are set.

Next: Phase 4 — the bidding engine. Do not end Phase 4 until the 50-concurrent
bid test passes.

**Storage still needs Docker memory ≥ 6 GB.** The storage container failed its
health check at ~3.7 GB. Uploads need it healthy.

Local development (needs Docker Desktop, **≥ 6 GB RAM**):
`npm run setup:local` · `npm run test:integration` · `npm run dev`
Studio at http://127.0.0.1:54323, mail catcher at http://127.0.0.1:54324.

Update this section **and `context.md`** at the end of every phase.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
