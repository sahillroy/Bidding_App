# Data model

The schema, and the reasoning behind each Row Level Security policy.

> **Status:** all Phase 1 migrations are **written** (`supabase/migrations/0001`
> – `0009`). At the time of writing they have **not been executed against any
> database** — no Supabase project exists yet and Docker was unavailable
> locally. Treat the SQL as reviewed-but-unverified until
> `npm run test:integration` passes.

---

## Principles

1. **RLS is enabled — and forced — on every table.** `force row level security`
   matters: without it, the table owner bypasses every policy, which makes the
   policies untestable and means a service-role query silently sees everything.
2. **Money is `bigint` in paise.** Never `numeric`, never float. ₹1,250.50 is
   `125050`. Formatting happens once, at the edge, for display.
3. **`bids` is append-only.** Three independent mechanisms enforce it.
4. **No contact-information columns exist anywhere.** No phone, no address, no
   social handle. Anonymity is enforced by absence.
5. **No column may hold an Aadhaar or PAN number.** See
   [COMPLIANCE.md](./COMPLIANCE.md) §1.
6. **Public reads go through views**, not through base tables.

---

## The three access levels

Almost every policy set is a variation on the same three questions:

| Who | Reads | Writes |
|---|---|---|
| `anon` | only what is genuinely public: live listings, categories, handles, unblocked comments | nothing, anywhere |
| `authenticated` | their own rows, plus the public set | their own rows, and only the columns granted |
| admin | everything | everything, and every action is logged |

Admin status is checked with `public.is_admin()`, never with a JWT claim. A
claim is a snapshot — an admin demoted five minutes ago would keep access until
their token expired.

---

## Tables

### `profiles` — migration 0002

One row per `auth.users` row, created by the `on_auth_user_created` trigger.
Created by trigger rather than by application code because a user without a
profile is invisible to every policy and fails in confusing ways; a trigger
cannot be skipped.

`handle` is the only identifier another user ever sees. It is **generated, not
chosen**: `bidder_` plus 6 hex characters from `gen_random_bytes`. A chosen
handle would let people carry a recognisable identity between listings or
impersonate a seller.

> The plan's example uses 4 hex characters. That is 65,536 possibilities, which
> by the birthday bound gives a ~50% chance of a collision at about 300 users —
> a realistic demo size. 6 characters moves that point past 4,800. The
> generator retries on collision either way; the wider space just stops it
> mattering.

**The important part is at the bottom of the migration: column-level grants.**

RLS controls *which rows* a policy applies to. It does not control *which
columns* may be written. A policy saying "a user may update their own row"
therefore permits:

```sql
update profiles set role = 'admin' where id = auth.uid();
```

The row is theirs, so the policy allows it, and any user becomes an admin. What
actually prevents it is:

```sql
revoke all on public.profiles from anon, authenticated;
grant update (display_name) on public.profiles to authenticated;
```

`display_name` is the only column a user may write. `role`, `kyc_status`,
`account_status`, `strike_count` and `suspended_until` are changed by admin
action or by server-side functions. This is covered by two tests in
`tests/integration/rls.test.ts`.

A `suspension_has_an_end` CHECK keeps `account_status` and `suspended_until`
consistent: a suspension without an end date is indistinguishable from a ban.

### `public_profiles` — a view, migration 0002

```sql
create view public.public_profiles with (security_invoker = off)
  as select id, handle, created_at from public.profiles;
```

`security_invoker = off` means it runs with its owner's privileges and so is not
blocked by the `profiles` policies. **The column list is therefore the entire
security boundary.** Adding a column here is a data leak, not a feature. A test
asserts the view has exactly these three columns.

### `kyc_submissions` — migration 0003

Holds `doc_type`, `format_valid`, `masked_hint`, and a decision. **No document
number, in any form.**

The masked hint is written with `*`, never `X`. This is not cosmetic: a hint
masked as `XXXXX1234X` matches the PAN pattern `[A-Z]{5}[0-9]{4}[A-Z]` exactly,
so it would be indistinguishable from a stored PAN both to
`scripts/check-compliance.mjs` and to a human reading the table. A CHECK
constraint enforces the rule in the database — at least one `*`, not PAN-shaped,
and no run of 7 or more digits, so a 12-digit Aadhaar cannot fit.

A partial unique index allows one pending submission per user, so a user cannot
flood the review queue.

The INSERT policy pins `status = 'pending'`. Without it a user could insert a
row that is already `approved` and verify themselves.

### `categories` — migration 0004

Admin-curated, at most two levels deep, enforced by a trigger because a CHECK
cannot query another row. Sellers select from the list and cannot add to it — a
free-text category would make the prohibited-goods checklist unenforceable.

One of the few tables `anon` may read, because anonymous visitors browse by
category.

### `listings` and `listing_images` — migration 0005

`current_price` is **NULL until the first bid**, and this is load-bearing. The
plan's `place_bid` computes the minimum as
`coalesce(current_price + bid_increment, starting_price)`, which is only correct
while `current_price` starts NULL. Initialising it to `starting_price` would
make `coalesce` never fall through, wrongly forcing the *first* bid up to
`starting_price + increment`. Display uses
`coalesce(current_price, starting_price)`.

`bid_increment` is derived from the price band at creation time and then
**stored**, so that changing the band table later cannot silently rewrite the
rules of an auction already running. Auditability beats normalisation here.

Four CHECK constraints encode rules rather than trusting application code:
a live auction must have an `ends_at`; `ends_at` must follow `starts_at`;
`current_price` and `highest_bidder_id` move together; `bid_count` and
`current_price` agree.

The policy that makes Phase 3's acceptance criterion true:

```sql
create policy "anyone reads public listings" ... 
  using (status in ('live','ended','settling','sold','unsold'));
```

`draft`, `pending_review` and `rejected` are absent, so an unapproved listing is
invisible to the public regardless of what the UI does.

Sellers may edit only while a listing is `draft` or `rejected`. Once it is
pending, approved or live the content freezes — otherwise a seller could get a
benign item approved and then swap in a prohibited one.

Note what a seller is **not** granted: `current_price`, `highest_bidder_id`,
`bid_count`, `extension_count`. A seller who could write `current_price` could
set their own auction's price to anything.

### `bids` — migration 0006, append-only

The dispute record. Immutability is enforced three times over:

1. No UPDATE or DELETE policy exists (RLS denies by default).
2. UPDATE and DELETE are revoked from every application role.
3. **A trigger raises on UPDATE, DELETE and TRUNCATE regardless of who
   attempts it.**

Mechanism 3 is the one that matters. Our own server code holds the service-role
key, which bypasses RLS entirely, so mechanisms 1 and 2 would not stop a buggy
migration or a careless cleanup script. The trigger does. TRUNCATE needs its own
statement-level trigger because it bypasses row-level ones.

Foreign keys use `on delete restrict`, not `cascade`: deleting a listing or a
profile must not be able to erase bid history. Accounts are banned, not deleted.

Direct INSERT is also revoked — all writes go through `place_bid` (Phase 4).

### `public_bids` — a view, migration 0006

Phase 4 needs bid history "showing handles only" while `bidder_id` must never
reach the public. The view joins through to `handle` and does not select the
uuid. Exposing the uuid would defeat anonymity even though it looks opaque: it
is a stable identifier, so anyone could correlate a bidder across every auction
they have entered.

### `auction_events` — migration 0007

Append-only audit trail; every state transition writes a row. `actor_id` is NULL
for system actions, because a QStash callback or the `pg_cron` sweep has no user
behind it.

### `orders`, `payment_intents`, `strikes` — migration 0008

A partial unique index allows one open order per listing, so two people cannot
both be told to pay for the same item.

`payment_intents.simulated` is `CHECK`-constrained to `true`. The constraint is
the point: a future provider integration cannot start recording real payments
without deliberately altering it, which is a conversation rather than an
accident.

`attempt_number` is capped at 3 — after three defaults the item is marked
unsold rather than walking the bid list forever.

Orders are never public. An order reveals that a specific handle bought a
specific item, which is exactly what anonymity protects.

### `comments`, `likes`, `watchlist`, `notifications`, `messages`, `admin_actions` — migration 0009

`messages` is keyed on **`order_id`, not `listing_id`**. That is the enforcement
of "messaging unlocks only after an order exists": there is no reason for a
buyer and seller to talk before money is owed, and every reason not to let them
— pre-order contact is how people arrange to settle off-platform.

Blocked messages and comments are **retained and flagged**, never silently
dropped. The sender is told why, and repeated attempts are evidence for a
strike. `blocked` and `pii_flags` are not grantable to users: only the
server-side scrubber sets them.

Like *counts* are public; *who* liked is not. Public pages read an aggregate,
never the rows.

---

## Verifying it

```bash
npm run db:start          # local Supabase stack (needs Docker)
npm run db:reset          # apply every migration from scratch
npm run test:integration  # the RLS suite
```

The RLS suite skips when no database is configured, so `npm run test:run` stays
green on a machine without one. **Phase 1 is not complete until it actually
runs and passes.**
