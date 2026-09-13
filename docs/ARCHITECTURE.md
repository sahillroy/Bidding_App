# Architecture

> **Status:** Phase 3. Sections marked _(Phase N)_ for N > 3 describe what is
> planned, not what exists.

---

## The shape of the system

One Next.js application. No separate backend service.

```
                    ┌──────────────────────────────┐
   browser ───────► │  Next.js 16 on Vercel        │
                    │  ├─ Server Components        │  public pages render here
                    │  ├─ Server Actions           │  mutations
                    │  └─ /api/internal/*          │  QStash + pg_cron targets
                    └──────┬───────────────────────┘
                           │ supabase-js (anon key, RLS-constrained)
                           │ service role key (server only, bypasses RLS)
                    ┌──────▼───────────────────────┐
                    │  Supabase                    │
                    │  ├─ Postgres + RLS           │  authorization lives here
                    │  ├─ Auth (cookie sessions)   │
                    │  ├─ Storage (listing images) │
                    │  └─ Realtime (live bids)     │
                    └──────────────────────────────┘
                           ▲
                           │ delayed HTTP callback
                    ┌──────┴───────────────────────┐
                    │  Upstash QStash              │  closes auctions on time
                    └──────────────────────────────┘
```

## Why one application and not two

This is settled in §3.1 of the implementation plan and should not be reopened.
The short version:

1. **Cross-origin cookies.** A Vercel frontend talking to a separately hosted
   backend cannot share an httpOnly session cookie without fighting SameSite
   rules. A single origin makes that entire class of bug impossible.
2. **Free-tier spin-down.** Render's free web services sleep after 15 minutes
   and take about a minute to wake. Vercel functions are serverless — there is
   no process to sleep. A recruiter opening a cold demo sees the site, not a
   blank minute.
3. **Server Components make anonymous browsing nearly free.** Public listing
   pages render on the server, are fast, and are indexable.
4. **One deployment, one environment surface, one CI pipeline.**

Python re-enters in Phase 8 for ML image moderation, as an **on-demand job**
invoked by the main app — not an always-on service.

## Route groups

| Group | Requires | Contents |
|---|---|---|
| `(public)` | nothing | home, listing detail, categories |
| `(auth)` | nothing | login, signup, OAuth callback |
| `(app)` | a session | sell, verify, bids, orders, messages |
| `(admin)` | `role = 'admin'` | moderation queues, user management |
| `api/internal` | a valid QStash signature | auction close, payment deadline, sweep |

Route groups organise the code. They are **not** the security boundary — the
security boundary is Row Level Security in Postgres. A missing check in a layout
must not be able to leak data.

## Three layers of authorization _(Phase 1)_

1. **Middleware** refreshes the session cookie and redirects unauthenticated
   users away from `(app)` and `(admin)`. This is user experience, not security.
2. **Server-side checks** in Server Components and Server Actions.
3. **Row Level Security** in Postgres. This is the one that actually matters.
   If layers 1 and 2 were both deleted, RLS would still prevent one user reading
   another's data.

## Trust boundaries

| Boundary | Who is on the untrusted side | Control |
|---|---|---|
| Browser → Server Action | anyone | Zod schema, session check, RLS |
| Browser → Supabase (anon key) | anyone | RLS policies only — the anon key is public by design |
| QStash → `/api/internal/*` | anyone who guesses the URL | QStash signature verification |
| Server → Supabase (service key) | our own code | key is server-only; never `NEXT_PUBLIC_` |

The anon key being public is not a leak. It is a public identifier whose
capabilities are entirely defined by RLS. The **service role key** is the real
secret: it bypasses RLS completely.

## Selling and moderation _(Phase 3)_

The seller wizard writes **drafts** through the ordinary Supabase client.
The INSERT policy requires `status = 'draft'`, so a crafted POST cannot
publish. Submit, approve and reject go through `security definer` functions
(`submit_listing`, `approve_listing`, `reject_listing`) because
`auction_events` has no INSERT policy — only those functions may write the
audit trail.

Approve takes the listing live immediately (see D-7 in
[SECURITY_NOTES.md](./SECURITY_NOTES.md)). The public catalogue still cannot
see a row until that happens: the listings SELECT policy excludes
`draft`, `pending_review` and `rejected`.

Photos live in the public `listing-images` Storage bucket. The path is
`{seller_id}/{listing_id}/{image_id}.webp`. Public read, seller-prefixed
write. The 8-image cap is a CHECK on `listing_images.sort_order` (0–7) as
well as an application limit.

## Why auctions do not close on a cron _(Phase 5)_

Auctions end at an arbitrary second. Vercel Hobby cron runs **once per day and
is only accurate to the hour**. `pg_cron` and GitHub Actions give minute
granularity at best. None can close an auction at the moment it expires.

QStash publishes a message with `delay = ends_at - now()`, which calls back at
the right second. `pg_cron` runs a sweep every minute as a safety net for lost
callbacks. Because both can fire, **the close handler must be idempotent**: it
re-reads the listing `FOR UPDATE` and returns early if the status is no longer
`live`.

## Records

- [DATA_MODEL.md](./DATA_MODEL.md) — schema and RLS rationale
- [AUCTION_RULES.md](./AUCTION_RULES.md) — the state machine in plain English
- [COMPLIANCE.md](./COMPLIANCE.md) — the legal constraints
- [SECURITY_NOTES.md](./SECURITY_NOTES.md) — triaged findings and decisions
- [implementationplan.md](./implementationplan.md) — the full specification
