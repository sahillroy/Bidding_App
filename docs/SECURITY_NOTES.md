# Security notes

A running record of security decisions, triaged findings, and known weaknesses.
Written so that every item can be explained out loud, not just fixed silently.

---

## Decisions

### D-1 · `security definer` functions get a pinned `search_path`

**Phase 0 (applies from Phase 4).**

The `place_bid` function in §6.3 of the plan is declared `security definer`,
meaning it executes with the privileges of the user who owns it rather than the
caller. That is necessary: it must write to `bids`, which the `authenticated`
role has no direct `INSERT` on.

The plan's SQL omits `set search_path`. As written, that is a privilege
escalation vector — if an attacker can create objects in any schema that appears
earlier on the session `search_path`, they can shadow `listings` or `bids` with
their own table and the function will operate on it with the owner's privileges.

**Every `security definer` function in this project must therefore:**

```sql
create function ...
  language plpgsql
  security definer
  set search_path = public, pg_temp   -- <— required
as $$ ... $$;

revoke execute on function ... from public;
grant  execute on function ... to authenticated;
```

`pg_temp` goes last, never first, for the same reason.

---

### D-2 · Next.js 16 instead of the planned 15

**Phase 0.**

Next 15.5.25 bundles `postcss` ≤ 8.5.22, which carries four advisories, one
high severity (GHSA-qx2v-qp2m-jg93 and related `sourceMappingURL` path
traversal issues).

**Exploitability here: effectively nil.** All four require PostCSS to process
attacker-controlled CSS. This project compiles only its own stylesheets, at
build time, from the repository.

It was still upgraded, for two reasons: a permanently red `npm audit` on a
public security-portfolio repository invites exactly the wrong question, and
alert fatigue is how real findings get missed. Deviation from plan §3.2 is
deliberate and recorded here.

---

### D-3 · The DEMO banner does not read an environment variable

**Phase 0.**

`NEXT_PUBLIC_DEMO_MODE` exists, but `DemoBanner` ignores it. A legally
load-bearing notice must not be removable by deleting one line in a Vercel
settings page. The component takes no props and holds no client state; CI
asserts it is present in the root layout.

---

### D-4 · `@types/node` bumped from the scaffold's v20 to v24

**Phase 0.**

The Next scaffold pins `@types/node@^20` regardless of the installed runtime.
The project runs Node 24.8. Typechecking against a different major than the one
that executes the code hides real API differences. `.nvmrc` and `engines` pin
Node 24 so CI and local development agree.

---

### D-5 · The site header fails open to "signed out", deliberately

**Phase 1.**

`SiteHeader` runs in the root layout and calls Supabase on every request,
including anonymous ones. An unhandled failure there would 500 the layout and
therefore every page on the site — including the public catalogue, which is
specified to be browsable without an account.

The Supabase free tier pauses a project after seven days of inactivity and then
returns HTTP 540, so this is a routine condition, not a hypothetical.

The call is wrapped and failure renders the signed-out header. This is **not** a
security weakness: the degraded state grants nothing. The worst outcome is a
signed-in user briefly seeing a "Sign in" button. Every protected route
re-checks the session server-side, and all of it is backed by RLS regardless.

Failing *closed* would have been wrong here — it would mean an unrelated
database outage takes down anonymous browsing entirely.

### D-6 · Vitest pinned to 4.x, not 5.x

**Phase 1.**

Vitest 5 is rolldown-based and requires a native platform binding. npm has a
long-standing bug where a targeted `npm install <pkg>` drops optional platform
bindings from the lockfile, so on Windows the test runner broke after **every**
dependency addition, recoverable only by deleting `node_modules` and
`package-lock.json` and reinstalling.

Vitest 4 is vite/esbuild based and needs no native binding. Symptom to
recognise if someone upgrades: `Cannot find module '@rolldown/binding-...'`.

### D-7 · Approve goes live immediately; QStash close is Phase 5

**Phase 3.**

Plan §8 says approve moves the listing to `approved` and schedules go-live.
The scheduler is QStash, which is Phase 5. `approve_listing` therefore records
both audit events (`approved`, then `went_live`) and lands the row on `live`
in the same transaction, with delay = 0.

`starts_at` and `ends_at` are always written from `now()` plus
`duration_seconds`. They are never taken from the seller. Those columns are
grantable to the `authenticated` role (admins share that role, so they cannot
be revoked from sellers only), which means a crafted draft update could store
a nonsense end time. The function ignores whatever is there.

Phase 5 inserts the QStash close message between the two events. The
acceptance criterion — a seller-created listing is invisible until an admin
approves it — does not depend on delayed go-live.

---

## Known weaknesses

### W-1 · PII scrubbing is necessary but not sufficient

**Phase 7.**

Message filtering catches careless attempts to exchange contact details. It does
not stop a determined pair of users — spelled-out digits, an image of a phone
number, a coded reference to an external platform. It also produces false
positives that block legitimate logistics conversation.

The honest framing: filtering raises the cost of circumvention and creates an
auditable record of attempts. It is not a guarantee of anonymity.

### W-2 · Shipping is where the anonymity model breaks

**Phase 7, design only.**

An address has to reach someone eventually. The demo simulates a
platform-generated shipping label so neither party sees the other's address. In
a real deployment, a courier integration, a returned parcel, or a customer
service call re-introduces the leak.

### W-3 · No rate limiting yet

**Deferred.** Bid placement, login, and listing creation are all unthrottled.
Before anything resembling a launch this needs per-user and per-IP limits, and
bid placement specifically needs protection against automated sniping.

### W-4 · No backups on the Supabase free tier

**Phase 1 onward.** The free tier takes no backups and pauses the project after
seven days of inactivity. Mitigated by the keep-alive workflow
(`.github/workflows/keepalive.yml`) and by committing **schema-only** `pg_dump`
snapshots. **Never commit user data.**

### W-5 · Listing-image objects can be orphaned

**Phase 3.** Storage RLS scopes writes to `{auth.uid()}/…`. The
`listing_images` row is what attaches a file to a listing, and that insert is
itself RLS-protected. A seller can still upload a file to their own prefix
that is never referenced by a row — it counts against the 1 GB free quota and
is not served by the catalogue. Acceptable for the demo. A production sweeper
would delete unreferenced objects.

WebP conversion runs in the browser. The Server Action re-checks magic bytes
and size, so a client that skips compression cannot store a JPEG, but a
production build should re-encode on the server so the pipeline does not
depend on `canvas.toBlob`.

---

## Dependency audit policy

CI runs `npm audit --audit-level=high` as a separate job. High and critical
findings fail the build. Moderate and low findings are triaged here rather than
blocking work, so that the failing signal keeps meaning something.
