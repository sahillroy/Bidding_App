# BidKar — session context

**Working name:** BidKar  
**Repo:** `Bidding_App` (branch `phase-3/selling-and-moderation`)  
**Owner:** Sahil Roy  
**Last updated:** 14 September 2026

This file is the hand-off for a new session. The full specification is still
`docs/implementationplan.md`. Standing rules for an agent are `CLAUDE.md`.
Read those before writing code. This file only records **what is true now**.

---

## Status

| Phase | State |
|---|---|
| 0 Foundations | Done |
| 1 Data model and auth | Done |
| 2 Public browsing | Done |
| **3 Selling and moderation** | **Implemented. Owner-laptop verification of the live click-path is pending Docker.** |
| 4 Bidding engine | Not started |
| 5 Closure and settlement | Not started |
| 6 Simulated KYC and payment | Not started |
| 7 Anonymity, social, polish | Not started |
| 8 Optional upgrades | Do not start unless asked |

**Do not deploy** until Phases 0–7 are complete. No hosted Supabase project
exists. Everything runs against the local Docker stack.

**Next phase:** 4 — `place_bid`, increments, Realtime, server-authoritative
countdown. Phase 4 does not end until
`tests/concurrency/simultaneous-bids.test.ts` passes (50 concurrent identical
bids, exactly one accepted).

---

## What Phase 3 built

### Product

- Seller wizard: details → photos → pricing → duration → review.
  Routes: `/sell` (hub), `/sell/new`, `/sell/[id]`.
- Login is required to sell (`/sell` is a protected prefix). KYC is **not**
  required to sell (it gates bidding in Phase 6).
- Submit sends the listing to `pending_review` via `submit_listing`.
- Admin queue at `/admin/listings` and `/admin/listings/[id]`.
- Prohibited-goods checklist from plan §2.5 / `COMPLIANCE.md` §6. Every box
  must be ticked; the Server Action rejects a crafted POST that skips them.
- Price-sanity flag: > 10× or < 0.1× the median of **live** listings in the
  same category. Fewer than 3 live peers: flag only if starting price >
  ₹10 lakh. **Flag only — never auto-reject.**
- Approve takes the auction **live immediately** (D-7). Reject writes a
  `review_note` the seller can see.
- Header: **Sell** is always visible (logged-out users hit login). **Admin**
  shows only when `profiles.role = 'admin'`.
- Public cards and detail pages show a Storage photo when one exists, otherwise
  the Phase 2 SVG placeholder.

### Acceptance criterion (plan §11 Phase 3)

A listing created by a seller is invisible on `/` and in search until an
admin approves it. Enforced by RLS, not by a filter in application code.

The public listings policy still only allows
`status in ('live','ended','settling','sold','unsold')`.
`search_listings()` is **not** `security definer`.

### Database (migration `0012_listing_moderation.sql`)

Three `security definer` functions, `search_path = public, pg_temp` (D-1):

| Function | Who | Effect |
|---|---|---|
| `submit_listing(id)` | seller, active, own `draft`/`rejected` | requires ≥1 image; writes `created` (if missing) + `submitted_for_review`; status → `pending_review` |
| `approve_listing(id)` | admin | lock row; `approved` event; `admin_actions`; then `live` with `starts_at`/`ends_at` from `now()` + `duration_seconds`; `went_live` event |
| `reject_listing(id, note)` | admin | note ≥ 8 chars; status → `rejected`; events + `admin_actions` |

`auction_events` has **no INSERT policy**. Only these functions write the
review audit trail.

**`created` is written at submit, not on INSERT.** An insert trigger would
leave every draft with an event row. `auction_events` is append-only and
references listings `ON DELETE RESTRICT`, which would make “sellers delete
their own drafts” impossible. A draft with no events can be deleted. After
submit, it cannot.

Seller-supplied `starts_at` / `ends_at` are **ignored** on approve. Those
columns are grantable to `authenticated` (admins share that role), so a
crafted draft could store a nonsense end time.

### Images

- Public bucket `listing-images` (migration 0012 **and** `config.toml`).
- Path: `{seller_id}/{listing_id}/{image_id}.webp`.
- Cap 8 (CHECK on `sort_order` 0–7 plus application limit).
- Browser canvas → WebP (no `sharp`). Server re-checks RIFF/WEBP magic bytes
  and a 2 MiB cap. Bucket MIME allow-list is `image/webp` only.
- `sort_order` may have gaps after a delete. Cover = lowest remaining
  `sort_order`. Next upload picks the first free slot in 0–7.

### Seed additions (after `db:reset`)

Still 8 categories, 6 sellers, 1 admin, 41 live auctions, **plus**:

- Pending: “Refurbished inkjet printer, working”
- Pending: “Gaming laptop listed at ten crore” (₹10 crore — price-sanity demo)
- Rejected: “Assorted charging cables, mixed condition” (has a `review_note`)

Password for every seeded account: `demo-password-not-secret`

| Email | Role |
|---|---|
| `admin@example.test` | admin |
| `seller-anaya@example.test` | seller (owns the three Phase 3 seed rows) |

---

## Decisions taken in this session

| ID | Decision | Why |
|---|---|---|
| D-7 | Approve → live in one transaction (events `approved` then `went_live`) | Plan §8 “schedules go-live” needs QStash, which is Phase 5. Delay = 0 for now. |
| — | Canvas WebP, no new npm dependency | Plan says compress to WebP; `sharp` is a native dep on Windows CI. |
| — | Public bucket | Listing photos are meant to be seen. Signed URLs add expiry to every card. |
| — | Sanity 10× / 0.1×, ₹10 lakh if < 3 peers | The “laptop for 10 crore” case. Admin still decides. |
| — | No Vercel / hosted Supabase until Phases 0–7 are done | Owner request. |
| — | `created` at submit, not INSERT | Protects draft delete. See above. |
| — | Split client-safe modules (`seller-view.ts`, `display.ts`) | Wizard is a Client Component. Importing `@/lib/supabase/server` (uses `next/headers`) failed `next build`. |

Also still in force from earlier phases: Next 16 not 15 (D-2), `@types/node` 24
(D-4), Vitest 4 not 5 (D-6), DEMO banner ignores env (D-3), SiteHeader fails
open to signed-out (D-5).

---

## Verification (this machine)

Owner laptop: **no Docker**.

| Check | Result |
|---|---|
| `tsc --noEmit` | Pass |
| `eslint` | Pass |
| `check:compliance` | Pass (81 files) |
| `vitest run` | **56 passed**, 22 skipped (RLS suite skips without a live DB) |
| `next build` | Pass after the client/server import split |
| `db:reset` / `test:integration` | **Not run here** — no Docker |
| Browser acceptance path | **Not run here** — needs the local stack |

A friend with Docker Desktop should run the hand-off below. Phase 3 is not
signed off until that click-path passes.

---

## Docker hand-off (friend’s laptop)

Give Docker Desktop **≥ 6 GB RAM** (Settings → Resources). Storage failed
its health check at ~3.7 GB.

```bash
cd Bidding_App
# this work lives on branch phase-3/selling-and-moderation
npm ci
npm run setup:local
npm run test:integration
npm run dev
```

`setup:local` (`scripts/setup-local.mjs`):

1. Fails if Docker is not running.
2. Fails if Node < 24.
3. Runs `npm ci` if `node_modules` is missing.
4. Writes `.env.local` with the **published local CLI JWTs** (same on every
   machine; not secrets) pointing at `http://127.0.0.1:54321`.
5. `npx supabase start`
6. `npx supabase db reset` (migrations 0001–0012 + seed)

Also available: `db:start`, `db:stop`, `db:status`, `db:reset`.

Studio: http://127.0.0.1:54323  
Mail catcher: http://127.0.0.1:54324  
App: http://localhost:3000

### Phase 3 click-path

1. Private window on `/`. Live catalogue visible. “Gaming laptop listed at
   ten crore” is **not**.
2. Search that title → zero results.
3. Admin login → `/admin/listings`. Ten-crore laptop is price-flagged.
4. Seller login (Anaya or a new account) → `/sell` → List an item → wizard
   with at least one photo → submit.
5. New listing absent from `/` and from search.
6. Admin ticks the checklist and approves. Listing appears on `/` and in search.

---

## Hard rules (do not reopen)

1. No real Aadhaar or PAN stored. Format-check in memory only.
2. No real money. No live payment keys.
3. DEMO banner on every page; it does not read an env var.
4. RLS on (and forced on) every table. Never disable it to make a query work.
5. `bids` is append-only. Writes go through `place_bid` (Phase 4).
6. Money is `bigint` paise. Never float.
7. No contact-information columns anywhere.
8. No secrets in the repo. `.env.local` is gitignored.
9. Single Next.js app. Do not split frontend/backend across two hosts.
10. Check with the owner before a new phase, a migration, a new dependency,
    or an auth/RLS change.

Full legal write-up: `docs/COMPLIANCE.md`.

---

## New / changed files in Phase 3

```
supabase/migrations/0012_listing_moderation.sql
supabase/seed.sql                          # +3 moderation demo rows
supabase/config.toml                       # listing-images bucket
.env.example                               # local CLI JWTs
scripts/setup-local.mjs
src/app/(app)/sell/page.tsx
src/app/(app)/sell/new/page.tsx
src/app/(app)/sell/[id]/page.tsx
src/app/(app)/sell/actions.ts
src/app/(admin)/admin/page.tsx
src/app/(admin)/admin/listings/page.tsx
src/app/(admin)/admin/listings/[id]/page.tsx
src/app/(admin)/admin/actions.ts
src/components/sell/listing-wizard.tsx
src/components/sell/image-step.tsx
src/components/admin/review-form.tsx
src/lib/validation/listing.ts
src/lib/listings/price-sanity.ts
src/lib/listings/images.ts
src/lib/listings/seller.ts                 # server queries only
src/lib/listings/seller-view.ts            # client-safe types/helpers
src/lib/listings/display.ts                # CONDITION_LABELS, CategoryRow
src/lib/listings/admin.ts
src/lib/listings.ts                        # cover URLs + images on detail
src/lib/compliance/prohibited-goods.ts
src/lib/images/compress.ts                 # browser-only
src/lib/rpc-errors.ts
tests/unit/price-sanity.test.ts
tests/unit/listing-validation.test.ts
tests/unit/images.test.ts
tests/unit/prohibited-goods.test.ts
tests/integration/rls.test.ts              # Phase 3 describe block
docs/SECURITY_NOTES.md                     # D-7, W-5
docs/ARCHITECTURE.md                       # Phase 3 section
docs/DATA_MODEL.md                         # 0012 functions + bucket
docs/AUCTION_RULES.md                      # pre-live rules
```

After any future migration, regenerate types:

```bash
npx supabase gen types typescript --local > src/types/database.ts
```

`submit_listing`, `approve_listing`, `reject_listing` are already in
`src/types/database.ts`.

---

## What is deliberately not in Phase 3

- QStash / delayed go-live / auction close (Phase 5)
- `place_bid`, Realtime, live bid panel (Phase 4)
- KYC, Verhoeff, PAN persist-nothing flow (Phase 6)
- Payments (Phase 6)
- Messaging, PII scrubber, comments, likes, watchlist (Phase 7)
- User suspend/ban UI (Phase 5 strikes)
- Google OAuth (needs a deployed origin)
- TanStack Query (Phase 4 live bidding)
- Deploy to Vercel

---

## Companion docs

| File | Role |
|---|---|
| `CLAUDE.md` | Standing rules + current-state blurb for an agent |
| `docs/implementationplan.md` | Full specification. Do not silently contradict it. |
| `docs/ARCHITECTURE.md` | Shape, trust boundaries, Phase 3 sell/admin flow |
| `docs/DATA_MODEL.md` | Schema + RLS rationale, now through 0012 |
| `docs/AUCTION_RULES.md` | Plain-English rules, including pre-live |
| `docs/COMPLIANCE.md` | Legal constraints |
| `docs/SECURITY_NOTES.md` | D-1…D-7, W-1…W-5 |
| `docs/DEMO_SCRIPT.md` | Still a Phase 7 placeholder |
| `README.md` | How to run, demo logins, acceptance click-path |

---

## Working protocol (from CLAUDE.md)

- Show the plan and wait before a new phase, a migration, a dependency, or
  an auth/RLS change.
- Surface open decisions with a recommendation.
- Flag production gaps as you go.
- Conventional Commits. Feature branches `phase-N/short-description`.
- Update `docs/` in the same change as the code it describes.
- **Update this file (`context.md`) at the end of every phase.**
