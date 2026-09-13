# BidKar

An online auction marketplace for India. Sellers list items, admins approve
them, buyers bid within a seller-chosen window of one hour to one month, and the
highest bidder has 24 hours to pay or the item falls to the runner-up.

> ### This is a demonstration build
>
> **No real money moves.** Payments are simulated end to end. This project holds
> no funds and routes no funds.
>
> **No real identity documents are collected or stored.** Identity verification
> is a format check performed in memory on synthetic data. No Aadhaar or PAN
> number is ever written to the database.
>
> A DEMO banner appears on every page and cannot be switched off.
>
> Everything else is real: the Postgres database with row-level security, the
> authentication, the real-time bidding, the atomic bid placement, the scheduled
> auction closure, and the deployment.

---

## Why the interesting parts are interesting

**Two people bidding at the same millisecond must not both win.** Bids are
placed by a Postgres function that takes a `SELECT … FOR UPDATE` row lock on the
listing. The second transaction blocks until the first commits, then re-reads
the new price and correctly rejects a now-too-low bid. There is a test that
fires 50 simultaneous identical bids and asserts exactly one is accepted.

**Authorization lives in the database.** Row Level Security is enabled on every
table. If every check in the application code were deleted, one user still could
not read another's data.

**Auctions end at an arbitrary second, so they cannot close on a cron.** Vercel's
free cron runs once a day and is accurate only to the hour. Instead, going live
schedules an Upstash QStash message with `delay = ends_at - now()`. A `pg_cron`
sweep runs every minute as a safety net, which means the close handler must be
idempotent — and it is.

**Buyer–seller anonymity is enforced by the schema.** There are no contact
information columns anywhere in the database. Users see a generated handle
(`bidder_7f2a`) and nothing else.

---

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind CSS + shadcn/ui · Supabase
(Postgres, Auth, Storage, Realtime) · Upstash QStash · Vercel · Zod ·
TanStack Query · Vitest + Playwright

One Next.js application on a single origin. There is no separate backend
service — see [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) for why.

---

## Running it locally

Node 24 or newer (`.nvmrc` pins 24.8). Docker Desktop is required for the
database, auth, and image uploads. Give Docker **at least 6 GB of RAM**
(Settings → Resources). At ~3.7 GB the Storage container fails its health
check and uploads die.

```bash
# If you received a copy of this folder (USB / zip / this branch), cd into it.
# If you cloned GitHub, also: git checkout phase-3/selling-and-moderation
cd Bidding_App
npm ci
npm run setup:local
npm run test:integration
npm run dev
```

`setup:local` starts Dockerized Supabase, applies migrations `0001`–`0012`,
loads the seed, and writes `.env.local` with the published local-stack keys
(the same on every machine; they are not secrets).

| Command | What it does |
|---|---|
| `npm run setup:local` | Docker check, `.env.local`, `supabase start`, `db reset` |
| `npm run dev` | development server on http://localhost:3000 |
| `npm run build` | production build |
| `npm run typecheck` | TypeScript, no emit |
| `npm run lint` | ESLint |
| `npm test` | Vitest in watch mode |
| `npm run test:run` | Vitest once, as CI runs it |
| `npm run test:integration` | the Row Level Security suite (needs the local stack) |
| `npm run check:compliance` | the legal-constraint tripwire described below |
| `npm run db:start` | start the local stack without resetting data |
| `npm run db:stop` | stop the local stack |
| `npm run db:status` | print local URLs and keys |
| `npm run db:reset` | re-apply every migration from scratch and re-seed |
| `npm run db:push` | apply migrations to the linked hosted project |

Studio is at http://127.0.0.1:54323 and the local mail catcher at
http://127.0.0.1:54324.

### Demo logins

Password for every seeded account: `demo-password-not-secret`

| Email | What they can do |
|---|---|
| `admin@example.test` | `/admin/listings` — pending queue, price-sanity flag |
| `seller-anaya@example.test` | `/sell` — one rejected listing and two pending ones |

### Phase 3 acceptance path (what to click)

1. Open http://localhost:3000 in a **private window**. The live catalogue
   is visible. “Gaming laptop listed at ten crore” is **not** — it is
   `pending_review`.
2. Search that title. Zero results. Search is not `security definer`, so
   unapproved listings stay unsearchable.
3. Sign in as the admin. `/admin/listings` shows the pending rows. The
   ten-crore laptop is price-flagged (10× the electronics median).
4. Sign in as Anaya, or create a new account. `/sell` → **List an item**.
   Walk the wizard (details → photos → pricing → duration → review), add
   at least one photo, submit.
5. Confirm the new listing is absent from `/` and from search.
6. As admin, tick the prohibited-goods checklist and approve. The listing
   must then appear on `/` and be searchable.

That is the Phase 3 acceptance criterion: a seller-created listing is
invisible publicly until an admin approves it. The database enforces it,
not the page.

### The compliance check

`npm run check:compliance` fails the build if anyone adds a database column that
looks built to hold an Aadhaar or PAN number, embeds a document-shaped literal
in the source, introduces a live payment key, or removes the DEMO banner from
the root layout.

It is deliberately crude and is not a security boundary. It exists because the
constraints it guards are legal ones, and someone will eventually try to
"improve" the KYC flow by storing the number.

---

## The legal tension we did not hide

The Consumer Protection (E-Commerce) Rules 2020 require a marketplace to ensure
sellers disclose their identity, address and contact details. That **directly
conflicts** with the buyer–seller anonymity this project is built around.

The resolution here is the one real marketplaces use: anonymity is between
*users*, while the platform holds full seller identity internally and exposes it
to administrators. That is a defensible position for a non-commercial
demonstration. It is not a claim that the design is launch-ready.

This is the single biggest unresolved legal question in the design, and it is
written down rather than glossed over. Details in
[docs/COMPLIANCE.md](./docs/COMPLIANCE.md).

---

## What production would actually require

Worth more than the code, in an interview:

1. Legal advice on the seller-disclosure versus anonymity conflict above.
2. A licensed payment aggregator with split settlement — Razorpay Route or
   Cashfree Easy Split. **Never build your own escrow**: holding user funds
   requires an RBI Payment Aggregator licence, which needs ₹15 crore of net
   worth at application, rising to ₹25 crore by year three.
3. Real identity verification through DigiLocker or an authorised KYC provider.
   Raw Aadhaar collection stays off the table permanently.
4. DPDP Act readiness before 14 May 2027: consent records, a data-minimisation
   audit, breach notification, a grievance officer.
5. GST registration, TCS under GST, and Section 194-O TDS on seller payouts.
6. Paid Supabase — removes the 7-day pause and adds backups — and paid Vercel.
7. Dispute resolution, refunds and returns. Entirely absent from this design.
8. Shipping integration, and the address-disclosure problem it re-introduces.
9. Rate limiting, bot protection, and shill-bidding detection.
10. A penetration test, dependency scanning, and secret rotation.

---

## Documentation

| Document | Contents |
|---|---|
| [context.md](./context.md) | session hand-off: what is built, what is next, how to test |
| [implementationplan.md](./docs/implementationplan.md) | the full specification and build order |
| [ARCHITECTURE.md](./docs/ARCHITECTURE.md) | system shape, trust boundaries, request flows |
| [DATA_MODEL.md](./docs/DATA_MODEL.md) | schema and the reasoning behind each RLS policy |
| [AUCTION_RULES.md](./docs/AUCTION_RULES.md) | the auction state machine in plain English |
| [COMPLIANCE.md](./docs/COMPLIANCE.md) | the legal constraints and how code enforces them |
| [SECURITY_NOTES.md](./docs/SECURITY_NOTES.md) | triaged findings, decisions, known weaknesses |
| [DEMO_SCRIPT.md](./docs/DEMO_SCRIPT.md) | what to click, in order, to show the project |

---

## Build progress

- [x] **Phase 0** — Foundations: scaffold, CI, compliance guard, docs
- [x] **Phase 1** — Data model and auth: 9 migrations, RLS on every table, email/password auth
- [x] **Phase 2** — Public browsing: listing grid, categories, full-text search, seed data
- [x] **Phase 3** — Selling and moderation: listing wizard, Storage uploads, admin queue
- [ ] **Phase 4** — The bidding engine
- [ ] **Phase 5** — Closure and settlement
- [ ] **Phase 6** — Simulated KYC and payment
- [ ] **Phase 7** — Anonymity, social, polish

---

Built by [Sahil Roy](https://github.com/sahillroy).
