# Implementation Plan — Online Auction Marketplace (India, Zero Budget Demo)

**Working name:** BidKar
**Status:** Planning — no code written yet
**Owner:** Sahil Roy
**Document version:** 1.0
**Last updated:** 12 September 2026

---

## 0. What this document is

This is the single source of truth for building the project. It defines scope, the stack and why each piece was chosen, the data model, the auction mechanics, the legal boundaries that must not be crossed, and the phase-by-phase build order with acceptance criteria.

Read this before writing any code. The companion file `CLAUDE.md` holds the rules Claude Code must follow while building. The file `CLAUDE_CODE_PROMPT.md` is the kickoff prompt.

---

## 1. Product summary

A public online auction marketplace where sellers list items and buyers place bids, aimed at users across India.

**Core loop:** seller lists item → admin approves → auction goes live for a seller-chosen window (1 hour to 1 month) → buyers bid → highest bidder at expiry has 24 hours to pay → item settles or falls through to the runner-up.

**Anyone can browse without an account.** Login is required only to bid, sell, comment, or like. Bidding additionally requires completing identity verification.

### 1.1 Scope boundary — read this twice

This is a **demonstration build**. It must look and behave like a real marketplace, but:

- **No real money moves.** Payments are simulated end to end.
- **No real identity documents are collected or stored.** Identity verification is format validation on synthetic data only.
- **A persistent DEMO banner is visible on every page** so the site cannot be mistaken for a live money-handling service.

Everything else — the database, the auth, the real-time bidding, the auction closure, the moderation queue, the deployment — is real and running on production infrastructure.

---

## 2. Hard constraints (non-negotiable)

These came out of the compliance research. Violating any of them creates real legal exposure for the students personally, not just for the project.

### 2.1 Aadhaar — do not collect, do not store, ever

- The Aadhaar Act 2016 (Section 29(4)) prohibits publicly displaying or publishing an Aadhaar number. Section 40 penalises using collected identity information for any purpose other than the one consented to, with imprisonment up to 3 years.
- In *Justice K.S. Puttaswamy v. Union of India* (26 September 2018), the Supreme Court struck down the portion of Section 57 that allowed private body corporates to seek Aadhaar authentication. **A private student project has no lawful basis to authenticate Aadhaar.**
- Proposed amendments add civil penalties up to ₹1 crore per contravention.

**What the build does instead:** a client-and-server **format check only** — 12 digits plus the Verhoeff checksum. No number is ever written to the database. The stored record is `{doc_type, format_valid, masked_hint, status}` where `masked_hint` is `XXXX XXXX 1234` derived at submit time and never reversible. Seed and demo data use synthetic numbers that pass Verhoeff but are not issued Aadhaars (UIDAI never issues numbers beginning with 0 or 1).

### 2.2 Money — never hold or route real funds

- Pooling buyer funds before paying sellers makes you a Payment Aggregator under RBI's PA/PG Guidelines, requiring **₹15 crore net worth at application, rising to ₹25 crore by the end of the third financial year**, plus a scheduled-bank escrow account, PCI-DSS, and data localisation.
- Operating a payment system without authorisation is an offence under the Payment and Settlement Systems Act, 2007.

**What the build does instead:** a mock payment screen that mimics a gateway checkout and records a simulated `payment_intent`. Optionally wire **Razorpay test mode** keys (free, no company registration, no real settlement) for a more authentic flow. Test mode never touches real money.

### 2.3 DPDP Act 2023

Rules were notified 13 November 2025; substantive obligations and penalties commence around **14 May 2027**, with penalties up to ₹250 crore for security-safeguard failures. It applies regardless of company size.

**Design consequence:** practise data minimisation from day one. Collect nothing you do not need. This is another reason the KYC flow stores no document numbers.

### 2.4 The anonymity conflict — document it, do not hide it

The Consumer Protection (E-Commerce) Rules 2020 require a marketplace to ensure **sellers disclose their identity, address, and contact details**, and to appoint a grievance officer who acknowledges complaints within 48 hours and resolves them within one month.

This **directly conflicts** with the buyer–seller anonymity requirement in the brief.

**Resolution for the demo:** anonymity is between *users*; the platform itself holds full seller identity internally and exposes it to admins. This is the same pattern real marketplaces use (masked relay, disclosed-to-platform). A README section must state this openly. Before any real launch, this needs legal advice — it is the single biggest legal tension in the design and it should not be quietly ignored.

### 2.5 Prohibited goods list (drives the moderation checklist)

Weapons and ammunition; explosives and hazardous chemicals; narcotics (NDPS Act 1985); wildlife products (Wildlife Protection Act 1972 / CITES); counterfeit and IP-infringing goods; tobacco, and e-cigarettes/vaping products (banned nationwide since 2019); prescription drugs and medical devices; antiquities (Antiquities and Art Treasures Act 1972); maps misrepresenting India's borders; adult content; stolen goods; personal data or databases.

---

## 3. Tech stack — decisions and rationale

### 3.1 The core decision: one Next.js app, not a split frontend/backend

**Chosen:** Next.js 15 (App Router) full-stack on Vercel, with Supabase as the data and auth layer.

**Rejected:** Next.js frontend on Vercel + FastAPI backend on Render.

Reasoning:

1. **You already lost time to this exact problem.** Your CampusHire project needed JWT dual delivery through an httpOnly cookie *and* an Authorization header specifically to work around cross-origin cookie blocking between a Vercel frontend and a Render backend. A single-origin app makes that entire class of bug disappear.
2. **Render's free web services spin down after 15 minutes of inactivity and take about a minute to wake.** A demo that a recruiter or examiner opens cold would show a one-minute blank screen. Vercel functions are serverless — there is no process to sleep.
3. **Server Components make the "browse without login" requirement almost free.** Public listing pages render on the server, are fast, and are indexable — which matters for a marketplace.
4. **One deployment, one env-var surface, one CI pipeline.** With a two-person student team and zero budget, operational simplicity is worth more than architectural purity.

**Where FastAPI still comes in:** the future-scope ML image moderation. Python is the right language for that and it is your strongest one. It runs as an **on-demand job** invoked by the main app, not an always-on service — which sidesteps the spin-down problem entirely. This is Phase 8, not MVP.

### 3.2 Component-by-component

| Layer | Choice | Why this one |
|---|---|---|
| Framework | **Next.js 15, App Router** | Single origin; Server Components for anonymous browsing; Route Handlers for webhooks; you already know it from ProofStack |
| Language | **TypeScript** | Already your stack; the auction state machine has enough states that type safety genuinely prevents bugs |
| Validation | **Zod** | You used a discriminated union schema in ProofStack; the same pattern fits listing-vs-bid payloads. Shared between client and server |
| Database | **Supabase Postgres** | Free tier includes auth, storage, and realtime in one project. Postgres is required anyway for row-level locking on bids |
| Bid atomicity | **plpgsql function + `SELECT … FOR UPDATE`** | The single most important correctness decision in the project. See §6 |
| Auth | **Supabase Auth** (`@supabase/ssr`) | Cookie-based sessions that work with Server Components; email/password + Google OAuth; 50K MAU free; `auth.uid()` drives RLS |
| Authorization | **Postgres Row Level Security** | Enforcement lives in the database, so a missed check in application code cannot leak data. Non-negotiable for a security-focused portfolio project |
| Realtime bids | **Supabase Realtime** | Included free; 200 concurrent connections. Self-hosted Socket.IO is not viable on free tiers because of spin-down |
| Images | **Supabase Storage** | 1 GB free, bundled, integrates with the same RLS model. Move to Cloudflare R2 (10 GB, zero egress) if storage becomes the binding constraint |
| Auction closure | **Upstash QStash delayed messages** | 1,000 messages/day free, delays up to 1 year, automatic retries, DLQ. Vercel Hobby cron is **once per day, accurate only to the hour** — useless for auctions ending at an arbitrary second. See §7 |
| Closure safety net | **Supabase `pg_cron`** sweep every minute | Catches any auction whose QStash callback was lost |
| Hosting | **Vercel Hobby** | Free, Git-push deploys, preview deployments per PR, no cold-start penalty for this workload |
| UI | **Tailwind CSS + shadcn/ui** | Free, copy-in components, no runtime dependency, fast to make something look credible |
| Data fetching | **TanStack Query** | Already in your skill set; handles the optimistic-update-then-reconcile pattern that live bidding needs |
| Email | **Resend or Brevo free tier** | Outbid notices, auction-won notices, payment reminders. Mailgun gives 20K/month for 12 months via the Student Pack |
| Errors | **Sentry** | Free for a year via the GitHub Student Developer Pack |
| CI | **GitHub Actions** | Free on public repos; also runs the Supabase keep-alive ping |
| Tests | **Vitest + Playwright** | The concurrency test in §6.4 is the one test that must exist |

### 3.3 Free-tier limits and what breaks first

| Service | Free limit | What to watch |
|---|---|---|
| Supabase DB | 500 MB, 60 direct / 200 pooled connections | **Projects pause after 7 days of low activity** and return HTTP 540. Mitigate with a GitHub Actions cron ping every 3 days. **No backups on free** — take periodic `pg_dump` snapshots into the repo's `backups/` folder (schema only, never user data) |
| Supabase Realtime | 200 concurrent connections, 2M messages/month | If a demo goes viral, switch to Ably (6M messages/month free) |
| Supabase Storage | 1 GB, 50 MB max file | Compress images to WebP on upload, cap at 8 images per listing |
| Supabase Auth | 50K MAU | Not a realistic constraint |
| Vercel Hobby | 30s function timeout (5 min with Fluid Compute) | Never run auction closure inline in a request |
| QStash | 1,000 messages/day | Each auction uses ~2–3 messages (close, payment deadline, optional extension). ~300 auctions/day headroom |
| GitHub Actions | Free unlimited on public repos | Keep the repo public |

**Budget lever:** activate the **GitHub Student Developer Pack** on day one. Currently useful: Azure $100 credit, a free `.me` domain plus 1-year SSL from Namecheap, a free 1-year domain from Name.com, Mailgun 20K emails/month, Sentry, New Relic, and Copilot Pro. Note that **DigitalOcean's $200 student credit ended on 1 August 2026** — do not plan around it.

---

## 4. Repository setup

**Single repository, public.** Not a monorepo — there is one deployable app. Public because GitHub Actions minutes are unlimited on public repos and because the repo is itself a portfolio artifact.

```
bidkar/
├── .github/
│   └── workflows/
│       ├── ci.yml                 # typecheck, lint, unit tests, build
│       └── keepalive.yml          # cron: ping Supabase every 3 days
├── docs/
│   ├── implementationplan.md      # this file
│   ├── ARCHITECTURE.md            # diagrams, request flows
│   ├── DATA_MODEL.md              # schema + RLS policy rationale
│   ├── AUCTION_RULES.md           # the state machine, written in plain English
│   ├── COMPLIANCE.md              # §2 of this doc, expanded
│   └── DEMO_SCRIPT.md             # what to click, in order, to show the project
├── src/
│   ├── app/
│   │   ├── (public)/              # browsable without auth
│   │   │   ├── page.tsx           # home / listing grid
│   │   │   ├── listings/[id]/     # listing detail + live bid panel
│   │   │   └── categories/[slug]/
│   │   ├── (auth)/                # login, signup, callback
│   │   ├── (app)/                 # requires session
│   │   │   ├── sell/              # create listing wizard
│   │   │   ├── verify/            # simulated KYC
│   │   │   ├── bids/              # my bids
│   │   │   ├── orders/[id]/pay/   # simulated checkout
│   │   │   └── messages/
│   │   ├── (admin)/admin/         # moderation queue, user management
│   │   └── api/
│   │       └── internal/
│   │           ├── auctions/close/route.ts      # QStash target
│   │           ├── orders/deadline/route.ts     # QStash target
│   │           └── sweep/route.ts               # pg_cron safety net
│   ├── components/
│   ├── lib/
│   │   ├── supabase/              # server, client, middleware factories
│   │   ├── auction/               # bid rules, increments, state machine
│   │   ├── kyc/                   # verhoeff.ts, pan.ts — format checks only
│   │   ├── pii/                   # message scrubbing
│   │   └── qstash/
│   └── types/
├── supabase/
│   ├── migrations/                # numbered SQL migrations
│   ├── functions/                 # plpgsql: place_bid, close_auction, etc.
│   └── seed.sql                   # demo data
├── tests/
│   ├── unit/
│   ├── concurrency/               # the parallel-bid test
│   └── e2e/
├── .env.example
├── CLAUDE.md                      # rules for Claude Code
└── README.md
```

**Branching:** `main` is always deployable. Feature branches named `phase-N/short-description`. Every phase merges via a PR so there is a reviewable history — this matters because the repo is a portfolio piece. Enable branch protection on `main` requiring the CI check to pass.

**Commits:** Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`).

**Secrets:** `.env.local` locally, Vercel project env vars in production, never committed. `.env.example` lists every key with a dummy value.

---

## 5. Data model

Full SQL lives in `supabase/migrations/`. This is the shape and the reasoning.

### 5.1 Tables

**`profiles`** — one row per `auth.users` row.
`id` (uuid, FK auth.users), `handle` (text, unique, generated e.g. `bidder_7f2a` — this is the *only* identifier other users ever see), `display_name` (admin-visible only), `role` (`user` | `admin`), `kyc_status` (`none` | `pending` | `verified` | `rejected`), `account_status` (`active` | `suspended` | `banned`), `strike_count` (int), `suspended_until`, `created_at`.

**`kyc_submissions`** — deliberately holds no document number.
`id`, `user_id`, `doc_type` (`pan` | `aadhaar`), `format_valid` (bool), `masked_hint` (text, e.g. `XXXXXX1234`), `status` (`pending` | `approved` | `rejected`), `reviewed_by`, `reviewed_at`, `review_note`, `created_at`.
**Constraint:** no column may ever store a full PAN or Aadhaar number. Add a comment in the migration saying so.

**`categories`** — `id`, `slug`, `name`, `parent_id`.

**`listings`**
`id`, `seller_id`, `title`, `description`, `category_id`, `condition`, `starting_price` (numeric, paise as bigint preferred), `reserve_price` (nullable), `bid_increment` (derived from price band, stored for auditability), `duration_seconds` (3600 to 2592000), `status`, `starts_at`, `ends_at`, `original_ends_at`, `extension_count`, `current_price`, `bid_count`, `highest_bidder_id`, `review_note`, `created_at`, `updated_at`.

`status` enum: `draft` → `pending_review` → `rejected` | `approved` → `live` → `ended` → `settling` → `sold` | `unsold` | `cancelled`.

**`listing_images`** — `id`, `listing_id`, `storage_path`, `sort_order`.

**`bids`** — **append only. Never `UPDATE`, never `DELETE`.**
`id`, `listing_id`, `bidder_id`, `amount`, `max_amount` (nullable, for Phase 8 proxy bidding), `created_at`.
This table is the dispute-resolution record. Revoke `UPDATE` and `DELETE` on it at the database role level so no application bug can rewrite history.

**`auction_events`** — audit trail. `id`, `listing_id`, `event_type`, `actor_id`, `payload` (jsonb), `created_at`. Every state transition writes a row here.

**`orders`** — created when an auction ends with a winner.
`id`, `listing_id`, `buyer_id`, `seller_id`, `amount`, `attempt_number` (1 = highest bidder, 2 = runner-up, …), `payment_deadline`, `status` (`awaiting_payment` | `paid` | `defaulted` | `awaiting_seller_decision` | `seller_declined` | `cancelled`), `created_at`.

**`payment_intents`** — simulated. `id`, `order_id`, `provider` (`mock` | `razorpay_test`), `provider_ref`, `status`, `simulated` (bool, always true), `created_at`.

**`strikes`** — `id`, `user_id`, `order_id`, `reason`, `created_at`.

**`messages`** — `id`, `listing_id`, `sender_id`, `recipient_id`, `body` (already scrubbed), `pii_flags` (jsonb), `blocked` (bool), `created_at`.

**`comments`**, **`likes`**, **`watchlist`**, **`notifications`** — straightforward.

**`admin_actions`** — `id`, `admin_id`, `action`, `target_type`, `target_id`, `note`, `created_at`.

### 5.2 Row Level Security

RLS **on for every table**, no exceptions.

Key policies:
- `listings`: public `SELECT` where `status IN ('live','ended','sold')`. Sellers see their own rows in any status. Admins see everything.
- `bids`: public `SELECT` of `amount` and `created_at` only — never `bidder_id` — via a view. Bidders see their own full rows.
- `kyc_submissions`: owner and admin only.
- `profiles`: a public view exposing `handle` only. `display_name`, email, and everything else are admin-only.
- `orders`, `messages`: participants and admins only.
- Writes to `bids` go **only** through the `place_bid` function — revoke direct `INSERT` from the authenticated role.

### 5.3 Money representation

Store all amounts as **`bigint` in paise**. Never use floating point for money. Format for display at the edge only.

---

## 6. The bidding engine

This is the part most likely to be subtly wrong, so it gets its own section.

### 6.1 Bid validation rules

A bid is accepted only if **all** hold, checked server-side inside one transaction:

1. Listing `status = 'live'`.
2. `now() < ends_at` — evaluated with the **database clock**, never the client clock.
3. Bidder is authenticated, `kyc_status = 'verified'`, `account_status = 'active'`.
4. Bidder is not the seller.
5. `amount >= current_price + bid_increment` (or `>= starting_price` for the first bid).
6. `amount` is a positive integer in paise and below a sanity ceiling.

### 6.2 Bid increments by price band

| Current price | Minimum increment |
|---|---|
| under ₹500 | ₹10 |
| ₹500 – ₹4,999 | ₹50 |
| ₹5,000 – ₹24,999 | ₹250 |
| ₹25,000 – ₹99,999 | ₹1,000 |
| ₹1,00,000 – ₹4,99,999 | ₹2,500 |
| ₹5,00,000 and above | ₹5,000 |

### 6.3 Atomic placement — the critical piece

Two users bidding at the same millisecond must not both win. The fix is a Postgres function that takes a row lock:

```sql
create or replace function place_bid(
  p_listing_id uuid,
  p_amount     bigint
) returns bids
language plpgsql
security definer
as $$
declare
  v_listing  listings%rowtype;
  v_bidder   uuid := auth.uid();
  v_profile  profiles%rowtype;
  v_min      bigint;
  v_bid      bids%rowtype;
begin
  -- lock the auction row; concurrent callers queue here
  select * into v_listing from listings where id = p_listing_id for update;

  if not found then raise exception 'LISTING_NOT_FOUND'; end if;
  if v_listing.status <> 'live' then raise exception 'AUCTION_NOT_LIVE'; end if;
  if now() >= v_listing.ends_at then raise exception 'AUCTION_ENDED'; end if;
  if v_listing.seller_id = v_bidder then raise exception 'SELLER_CANNOT_BID'; end if;

  select * into v_profile from profiles where id = v_bidder;
  if v_profile.kyc_status <> 'verified' then raise exception 'KYC_REQUIRED'; end if;
  if v_profile.account_status <> 'active' then raise exception 'ACCOUNT_NOT_ACTIVE'; end if;

  v_min := coalesce(v_listing.current_price + v_listing.bid_increment,
                    v_listing.starting_price);
  if p_amount < v_min then raise exception 'BID_TOO_LOW:%', v_min; end if;

  insert into bids (listing_id, bidder_id, amount)
  values (p_listing_id, v_bidder, p_amount)
  returning * into v_bid;

  update listings
     set current_price     = p_amount,
         highest_bidder_id = v_bidder,
         bid_count         = bid_count + 1,
         updated_at        = now()
   where id = p_listing_id;

  insert into auction_events (listing_id, event_type, actor_id, payload)
  values (p_listing_id, 'bid_placed', v_bidder,
          jsonb_build_object('amount', p_amount, 'bid_id', v_bid.id));

  return v_bid;
end;
$$;
```

The `for update` is what makes this safe. The second concurrent transaction blocks until the first commits, then re-reads the updated `current_price` and correctly rejects a now-too-low bid.

### 6.4 The one test that must exist

```
tests/concurrency/simultaneous-bids.test.ts
```

Fire 50 concurrent `place_bid` calls at the same listing with identical amounts using `Promise.all`. Assert: exactly one succeeds, 49 fail with `BID_TOO_LOW`, `bid_count` incremented by exactly 1, and `current_price` matches the single winning bid.

**Do not move past Phase 3 until this test passes.** If the bidding engine is wrong, everything built on top of it is wrong.

### 6.5 Countdown timers

The server returns `ends_at` as a UTC timestamp plus a `server_now` value. The client computes an offset once and renders the countdown against the corrected clock. The client clock never decides anything — it only animates. All closure decisions happen server-side.

---

## 7. Auction closure and settlement

### 7.1 Why not cron

Auctions end at an arbitrary second. Vercel Hobby cron runs **once per day and is only guaranteed accurate to the hour**. `pg_cron` and GitHub Actions give minute granularity at best. None of these can close an auction at the moment it expires.

### 7.2 The design

**On go-live:** publish a QStash message with `delay = ends_at - now()` targeting `POST /api/internal/auctions/close` with `{listing_id}`. Verify the QStash signature on receipt.

**The close handler must be idempotent.** It re-reads the listing with `FOR UPDATE`, returns early if `status <> 'live'`, and only then transitions. A retried message, a duplicate delivery, or the sweep firing at the same moment must never double-close.

**Safety net:** `pg_cron` runs every minute and closes any listing where `status = 'live' AND ends_at < now()`. This catches lost callbacks.

**On any extension** (48-hour re-open, or soft close): publish a new delayed message for the new `ends_at`.

### 7.3 Settlement state machine

```
auction ends
  ├─ no bids ──────────────────────► unsold
  └─ has bids
       └─ create order (attempt 1, highest bidder)
          payment_deadline = now + 24h
          QStash message scheduled for the deadline
            ├─ buyer pays in time ─► order.paid ─► listing.sold
            └─ deadline passes
                 ├─ strike the buyer
                 │    strike 1 ─► suspend account
                 │    strike 2 ─► permanent ban
                 ├─ runner-up exists?
                 │    ├─ yes ─► order.awaiting_seller_decision
                 │    │          seller is asked: sell to runner-up at their bid?
                 │    │            ├─ accepts ─► new order (attempt 2), 24h deadline
                 │    │            └─ declines ─► listing.status = live
                 │    │                          ends_at = now + 48h
                 │    │                          extension_count += 1
                 │    │                          reschedule QStash close
                 │    └─ no ─► seller chooses: relist or cancel
                 └─ (loop)
```

**Edge cases that must be handled explicitly:**
- The seller does not respond to the runner-up offer. Give them 48 hours, then auto-decline and re-open.
- The runner-up also defaults. Allow the loop, but cap `attempt_number` at 3, then mark `unsold`.
- `extension_count` capped at 2 so an auction cannot be extended forever.
- The runner-up's account was suspended between bidding and the offer — skip to the next eligible bidder.
- The seller cancels mid-auction — allowed only if `bid_count = 0`.

### 7.4 Strikes and bans

One default = account suspended (cannot bid, can still browse). Two defaults = permanent ban. Both recorded in `strikes` with the triggering `order_id`. A suspended user's existing winning bids on other live auctions are voided and those auctions fall to their runner-up.

---

## 8. Moderation

Two queues in `/admin`:

**Listing approval.** Every new listing enters `pending_review`. The admin sees images, description, category, and price, with a checklist against the prohibited-goods list from §2.5, and a **price sanity flag** that highlights listings whose starting price is far outside the median for the category — this is the "laptop for 10 crore" case from the brief. Approve moves to `approved` and schedules go-live; reject writes a `review_note` the seller can see.

**KYC approval.** Format-valid submissions queue for a manual approve/reject. In the demo this is a click; in a real product it would be a verification API.

**User management.** Suspend, ban, lift suspension, view strike history. Every admin action writes to `admin_actions`.

Admin access is gated by `profiles.role = 'admin'` enforced in RLS, not just in the UI.

---

## 9. Anonymity implementation

1. **Handles only.** Every API response and every rendered page shows `profiles.handle` (`bidder_7f2a`). Real names, emails, and phone numbers are never selected into any public query. Enforce with a `public_profiles` view rather than relying on the application to remember.
2. **No contact fields anywhere.** There is no phone field, no social field, no "contact seller" button. The schema simply does not have the columns.
3. **In-app messaging only**, unlocked only after an order exists — there is no reason for a buyer and seller to talk before that.
4. **PII scrubbing on every message and comment.** Detect and block: phone numbers (including spaced, dashed, and `+91` forms), email addresses (including `name at domain dot com` obfuscation), URLs, and social handles (`@name`, `insta`, `tg`, `wa`). Normalise homoglyphs and strip zero-width characters before matching, because obfuscation defeats naive regex.
5. **Blocked messages are flagged, not silently dropped.** The sender is told why. Repeat attempts create a strike. Real marketplaces treat circumvention as a ban-level offence.
6. **Shipping is the hard leak.** An address has to reach someone eventually. The demo simulates a platform-generated shipping label so neither party sees the other's address. Document in the README that this is where the anonymity model is weakest in a real deployment.

Be honest in the docs that message filtering is necessary but not sufficient — determined users work around it, and false positives block legitimate logistics conversations.

---

## 10. Simulated KYC and payments

### 10.1 KYC

- **PAN:** normalise to uppercase, match `^[A-Z]{5}[0-9]{4}[A-Z]$`.
- **Aadhaar:** 12 digits, validated with the **Verhoeff checksum** (standard `d`, `p`, and `inv` tables). A random 12-digit number passes only about 10% of the time, so the check feels real.
- Validation runs client-side for instant feedback and is **re-run server-side** — never trust the client.
- **Only `format_valid`, `doc_type`, and a masked hint are persisted.** The number itself is discarded after validation. Write this as a comment in both the migration and the handler so nobody "improves" it later.
- The verify page carries an inline notice: this is a simulated check, no data is sent to UIDAI or NSDL, do not enter a real number.
- Seed data uses synthetic values that pass the checksum but are not issued numbers.

### 10.2 Payments

Build a `PaymentProvider` interface with two implementations:

- **`MockProvider`** (default) — a checkout page styled like a real gateway with UPI / card / netbanking tabs, a processing spinner, and success/failure outcomes the user can choose. Records a `payment_intent` with `simulated = true`.
- **`RazorpayTestProvider`** (optional) — Razorpay **test mode** keys, which are free and need no company registration. Simulate UPI success with `success@razorpay`; use Razorpay's published test card numbers.

Keeping this behind an interface means a real provider could be swapped in later without touching the settlement logic — which is a good thing to be able to say in an interview.

Every payment screen carries the DEMO banner.

---

## 11. Build phases

Each phase ends with a working, deployed increment. **Deploy in Phase 0, not at the end** — the worst failure mode for a student project is discovering deployment problems the night before the demo.

### Phase 0 — Foundations
Repo created, Next.js 15 + TypeScript + Tailwind scaffolded, Supabase project created, Vercel connected, CI green, keep-alive workflow running, `.env.example` complete, `CLAUDE.md` and docs committed, a "hello world" page live on a public URL.
**Acceptance:** a URL that loads, and a `git push` that redeploys it.

### Phase 1 — Data model and auth
All migrations applied, RLS on every table with policies written and tested, Supabase Auth with email/password + Google OAuth, `profiles` row auto-created on signup with a generated handle, middleware-based session refresh, protected route groups.
**Acceptance:** sign up, log in, log out. A test proving an anonymous client cannot read another user's `profiles` row.

### Phase 2 — Public browsing
Listing grid, category filter, search, listing detail page, all server-rendered and fully usable **logged out**. Seed script with ~40 realistic listings and images.
**Acceptance:** open the site in a private window, browse everything, and be prompted to log in only when clicking Bid, Sell, Like, or Comment.

### Phase 3 — Selling and moderation
Multi-step listing wizard (details → images → pricing → duration → review), image upload to Supabase Storage with WebP compression and an 8-image cap, submission to `pending_review`, admin queue with approve/reject, price-sanity flag, go-live scheduling.
**Acceptance:** a listing created by a seller is invisible publicly until an admin approves it.

### Phase 4 — The bidding engine
`place_bid` function, bid increments, validation rules, Realtime subscription pushing new highest bids, server-authoritative countdown, optimistic UI with reconciliation, bid history on the listing page showing handles only.
**Acceptance:** **the 50-concurrent-bid test in §6.4 passes.** Two browsers open on the same listing show each other's bids within a second.

### Phase 5 — Closure and settlement
QStash integration, idempotent close handler, `pg_cron` sweep, order creation, 24-hour payment deadline, strikes, suspension, ban, runner-up offer, seller accept/decline, 48-hour extension, all edge cases from §7.3.
**Acceptance:** an end-to-end test running a 2-minute auction through: bid, close, default, strike, runner-up offer, seller decline, 48-hour extension. Time is injectable so tests do not actually wait.

### Phase 6 — Simulated KYC and payment
Verhoeff and PAN validation, verify page, KYC gating on bidding, admin KYC queue, `PaymentProvider` interface, mock checkout, payment marks the order paid and the listing sold, DEMO banner sitewide.
**Acceptance:** an unverified user cannot bid. A full purchase completes with no real money.

### Phase 7 — Anonymity, social, polish
In-app messaging unlocked post-order, PII scrubber, comments, likes, watchlist, notifications, email on outbid/won/deadline, mobile responsiveness, empty and error states, `DEMO_SCRIPT.md`.
**Acceptance:** attempting to send a phone number in any of five obfuscated forms is blocked with a clear reason.

### Phase 8 — Optional upgrades (ask before starting)
Proxy/max-bid bidding, soft-close anti-sniping (bid in final 60s extends by 2 minutes), shill-bidding detection signals, FastAPI image-moderation service with a CLIP zero-shot or NSFW model, seller ratings.

---

## 12. Testing strategy

- **Unit:** bid increment bands, Verhoeff, PAN regex, PII scrubber (with an obfuscation corpus), state machine transitions.
- **Concurrency:** §6.4. Non-negotiable.
- **Integration:** RLS policies — for each table, assert that anonymous, non-owner, owner, and admin see exactly what they should.
- **E2E (Playwright):** browse logged out; signup → KYC → bid → win → pay; seller lists → admin approves → auction runs → settles; default → runner-up → decline → extension.
- **Time:** inject a clock rather than using real waits, so a one-week auction is testable in milliseconds.

---

## 13. Environment variables

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=          # server only, never exposed
QSTASH_TOKEN=
QSTASH_CURRENT_SIGNING_KEY=
QSTASH_NEXT_SIGNING_KEY=
NEXT_PUBLIC_APP_URL=
RESEND_API_KEY=                     # optional
RAZORPAY_TEST_KEY_ID=               # optional
RAZORPAY_TEST_KEY_SECRET=           # optional
NEXT_PUBLIC_DEMO_MODE=true          # controls the banner; never set false
```

---

## 14. What "production ready" would actually require

Keep this list in the README. It is worth more in an interview than the code is.

1. Legal advice on the E-Commerce Rules seller-disclosure versus anonymity conflict (§2.4).
2. A licensed Payment Aggregator integration — Razorpay Route or Cashfree Easy Split — rather than holding funds. Never build your own escrow.
3. Real identity verification through DigiLocker or an authorised KYC provider. Raw Aadhaar collection stays off the table permanently.
4. DPDP Act readiness before 14 May 2027: consent records, data-minimisation audit, breach notification, a grievance officer.
5. GST registration, TCS under GST, and Section 194-O TDS on seller payouts.
6. Paid Supabase (removes the 7-day pause, adds backups) and a paid Vercel plan.
7. Dispute resolution, refunds, and returns — entirely absent from the current design.
8. Shipping integration and the address-disclosure problem from §9.6.
9. Rate limiting, bot protection, and shill-bidding detection.
10. Security review: penetration test, dependency scanning, secret rotation.

---

## 15. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Supabase pauses before demo day | High if idle | Keep-alive workflow; check the dashboard the day before |
| Bid race condition ships undetected | Medium | The concurrency test gates Phase 4 |
| QStash message lost, auction never closes | Low | `pg_cron` sweep every minute |
| Free-tier limits change mid-build | Medium | Providers are behind thin interfaces; §3.3 lists switch targets |
| Scope creep past a demoable product | High | Phases 0–7 are the product. Phase 8 only if time remains |
| Someone "improves" the code to store real Aadhaar | Low but severe | Comments in the migration and handler; a CI grep that fails the build on a 12-digit-storing column |
