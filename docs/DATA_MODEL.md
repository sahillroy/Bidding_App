# Data model

> **Status:** Phase 0 — placeholder. The schema is designed in §5 of
> [implementationplan.md](./implementationplan.md) and will be implemented in
> Phase 1. This file is filled in migration by migration, in the same commit as
> the migration it describes.

## What goes here

For every table:

- the columns and why each one exists
- the RLS policies, written out, with the reasoning for each
- what an anonymous user, a non-owner, the owner, and an admin each see
- any constraint that encodes a rule rather than a data type

## Principles fixed before the first migration

1. **RLS is enabled on every table, without exception.** If a query fails, the
   policy is wrong — the fix is never to disable RLS.
2. **Money is `bigint` in paise.** Never floating point. Formatted for display
   at the edge only.
3. **`bids` is append-only.** `UPDATE` and `DELETE` are revoked at the role
   level. All writes go through `place_bid`. It is the dispute record.
4. **No contact information columns exist anywhere.** No phone, no email visible
   to users, no social handle, no "contact seller". Anonymity is enforced by the
   absence of the columns, not by remembering not to select them.
5. **No column may hold an Aadhaar or PAN number.** See
   [COMPLIANCE.md](./COMPLIANCE.md) §1. Enforced by CI.
6. **`public_profiles` is a view exposing `handle` only.** Public queries select
   from the view, never from `profiles`, so a forgotten column list cannot leak
   a display name.
