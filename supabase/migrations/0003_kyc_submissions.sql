-- ===========================================================================
-- 0003 · kyc_submissions
--
-- ###################################################################
-- #                                                                 #
-- #   NO COLUMN IN THIS TABLE MAY EVER HOLD AN AADHAAR OR PAN       #
-- #   NUMBER. NOT ENCRYPTED. NOT HASHED. NOT TEMPORARILY.           #
-- #                                                                 #
-- ###################################################################
--
-- This is a legal constraint, not a design preference.
--
--   * Aadhaar Act 2016 s.29(4) prohibits publishing or displaying an Aadhaar
--     number. s.40 makes using collected identity information for a purpose
--     other than the consented one punishable by up to 3 years' imprisonment.
--   * K.S. Puttaswamy v. Union of India (26 September 2018) struck down the
--     part of s.57 that allowed private body corporates to seek Aadhaar
--     authentication. A private project has NO LAWFUL BASIS to authenticate
--     Aadhaar at all.
--   * The DPDP Act 2023 independently requires data minimisation, with
--     penalties to Rs 250 crore for security-safeguard failures.
--
-- "Store it encrypted" does not help. The offence is collection and use
-- without lawful basis, not weak storage.
--
-- What actually happens: the number is format-checked in memory (Verhoeff for
-- Aadhaar, a regex for PAN) and then discarded. Only the three facts below are
-- written: which kind of document it was, whether the format checked out, and
-- a non-reversible masked hint so a human reviewer can tell two submissions
-- apart.
--
-- scripts/check-compliance.mjs fails CI on any column added here whose name
-- suggests it holds a document number. Do not work around it.
--
-- See docs/COMPLIANCE.md §1.
-- ===========================================================================

create table public.kyc_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,

  doc_type text not null
    check (doc_type in ('pan', 'aadhaar')),

  -- The outcome of the in-memory format check. Not the input to it.
  format_valid boolean not null,

  -- Derived at submit time. Not reversible: the discarded characters are not
  -- recoverable from this value.
  --
  -- FORMAT: the mask character is '*', never 'X'.
  --   PAN     -> '*****1234*'
  --   Aadhaar -> '**** **** 1234'
  --
  -- This is not cosmetic. A hint masked with 'X' — 'XXXXX1234X' — matches the
  -- PAN pattern [A-Z]{5}[0-9]{4}[A-Z] exactly, so it is indistinguishable from
  -- a real stored PAN both to scripts/check-compliance.mjs and to a human
  -- reading the table. A mask that cannot be told apart from the thing it is
  -- masking is useless as evidence that we are complying.
  --
  -- The constraint below enforces it in the database, so the rule holds even
  -- if application code is rewritten:
  --   * at least one '*' must be present
  --   * the value must not be PAN-shaped
  --   * no run of 7 or more digits, so a 12-digit Aadhaar cannot fit
  masked_hint text not null
    check (
      char_length(masked_hint) <= 20
      and masked_hint like '%*%'
      and masked_hint !~ '^[A-Z]{5}[0-9]{4}[A-Z]$'
      and masked_hint !~ '[0-9]{7,}'
    ),

  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),

  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  review_note text,

  created_at timestamptz not null default now(),

  -- A decision must record who made it and when. In a real product this table
  -- is the evidence that verification actually happened.
  constraint decision_is_attributed check (
    (status = 'pending' and reviewed_by is null and reviewed_at is null)
    or (status <> 'pending' and reviewed_by is not null and reviewed_at is not null)
  )
);

comment on table public.kyc_submissions is
  'Simulated identity verification. NO COLUMN MAY HOLD A DOCUMENT NUMBER. '
  'Only doc_type, format_valid and a non-reversible masked_hint are persisted. '
  'Aadhaar Act 2016 s.29(4) and s.40; Puttaswamy (2018); DPDP Act 2023.';

comment on column public.kyc_submissions.masked_hint is
  'Non-reversible hint, masked with *. PAN: *****1234*  Aadhaar: **** **** 1234. '
  'Never the full number. Constrained so it can never be document-shaped.';

create index kyc_submissions_user_id_idx on public.kyc_submissions (user_id);
create index kyc_submissions_pending_idx on public.kyc_submissions (created_at)
  where status = 'pending';

-- One open submission at a time. Without this, a user could flood the admin
-- queue, and it would be ambiguous which submission a decision applies to.
create unique index kyc_submissions_one_pending_per_user
  on public.kyc_submissions (user_id)
  where status = 'pending';


-- ---------------------------------------------------------------------------
-- Row Level Security — owner and admin only, never public
-- ---------------------------------------------------------------------------
alter table public.kyc_submissions enable row level security;
alter table public.kyc_submissions force row level security;

create policy "users read their own submissions"
  on public.kyc_submissions for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "admins read every submission"
  on public.kyc_submissions for select
  to authenticated
  using (public.is_admin());

create policy "users create their own submissions"
  on public.kyc_submissions for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    -- A submission always starts pending. Without this check a user could
    -- insert a row that is already approved and verify themselves.
    and status = 'pending'
    and reviewed_by is null
    and reviewed_at is null
  );

create policy "admins decide submissions"
  on public.kyc_submissions for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- No user UPDATE policy: a submitted record is evidence and is not editable by
-- its subject. No DELETE policy at all, for the same reason.

revoke all on public.kyc_submissions from anon, authenticated;

grant select (id, user_id, doc_type, format_valid, masked_hint, status,
              reviewed_at, review_note, created_at)
  on public.kyc_submissions to authenticated;

grant insert (user_id, doc_type, format_valid, masked_hint)
  on public.kyc_submissions to authenticated;

-- Only admins update, and they do so through a Server Action running with an
-- admin session; the policy above is what authorises it.
grant update (status, reviewed_by, reviewed_at, review_note)
  on public.kyc_submissions to authenticated;

-- anon gets nothing. Identity submissions are never publicly readable.
