# Compliance

The legal constraints this project is built around, why they exist, and how the
code enforces them. This expands §2 of [implementationplan.md](./implementationplan.md).

These are not style preferences. Violating them creates personal legal exposure
for the people who built it, not merely a bug.

---

## 1. Aadhaar — never collected, never stored

### The law

| Source | What it says |
|---|---|
| Aadhaar Act 2016, s.29(4) | Prohibits publishing or publicly displaying an Aadhaar number. |
| Aadhaar Act 2016, s.40 | Using collected identity information for a purpose other than the one consented to is punishable by up to 3 years' imprisonment. |
| *K.S. Puttaswamy v. Union of India* (26 Sep 2018) | Struck down the part of s.57 that let private body corporates seek Aadhaar authentication. **A private student project has no lawful basis to authenticate Aadhaar at all.** |
| Proposed amendments | Civil penalties up to ₹1 crore per contravention. |

### What we do instead

A **format check in memory only**: 12 digits plus the Verhoeff checksum. The
number is validated and then discarded. It is never written to the database,
never logged, never sent anywhere.

The persisted record is exactly:

```
kyc_submissions(doc_type, format_valid, masked_hint, status, …)
```

`masked_hint` is `XXXX XXXX 1234` — derived at submit time and not reversible.

### How it is enforced

1. The migration that creates `kyc_submissions` carries a SQL comment saying no
   column may hold a document number.
2. `scripts/check-compliance.mjs` runs in CI and fails the build on any SQL
   column whose name mentions Aadhaar or PAN and whose type could hold one.
3. The same script fails on any 12-digit literal beginning 2–9 in the source.
   UIDAI never issues numbers starting with 0 or 1, so **synthetic test values
   in this repo must start with 0 or 1** — that is what makes them provably not
   real Aadhaar numbers.

### If you are asked to change this

Refuse, and point at this file. "Just store it encrypted" does not help: the
offence is collection and use without lawful basis, not weak storage.

---

## 2. PAN

Same treatment. Format only: `^[A-Z]{5}[0-9]{4}[A-Z]$`, validated and discarded.
PAN is less tightly regulated than Aadhaar but is still sensitive personal data
under the DPDP Act, and we have no reason to keep it.

---

## 3. Money — never held, never routed

### The law

- Pooling buyer funds before paying sellers makes you a **Payment Aggregator**
  under RBI's PA/PG Guidelines. That requires **₹15 crore net worth at
  application, rising to ₹25 crore by the end of the third financial year**,
  plus a scheduled-bank escrow account, PCI-DSS compliance, and data
  localisation.
- Operating a payment system without authorisation is an offence under the
  **Payment and Settlement Systems Act, 2007**.

### What we do instead

A `PaymentProvider` interface with two implementations:

- `MockProvider` (default) — a checkout screen that looks like a real gateway,
  records a `payment_intent` with `simulated = true`, and moves no money.
- `RazorpayTestProvider` (optional) — Razorpay **test mode** keys only. Test
  mode is free, needs no company registration, and never settles real funds.

CI fails on any `rzp_live_`, `sk_live_`, or `pk_live_` string.

**A production version would never build escrow.** It would use a licensed
split-settlement product — Razorpay Route or Cashfree Easy Split — where the
licensed entity holds the funds and we only instruct the split.

---

## 4. DPDP Act 2023

Rules notified **13 November 2025**; substantive obligations and penalties
commence around **14 May 2027**. Penalties reach **₹250 crore** for failures of
security safeguards. It applies regardless of company size.

Design consequence, applied from day one: **data minimisation**. We collect
nothing we do not need. This is a second, independent reason the KYC flow stores
no document numbers — even if the Aadhaar Act did not exist, keeping them would
be indefensible under DPDP.

---

## 5. The anonymity conflict — stated openly, not hidden

The **Consumer Protection (E-Commerce) Rules 2020** require a marketplace to
ensure sellers disclose their **identity, address and contact details**, and to
appoint a grievance officer who acknowledges complaints within 48 hours and
resolves them within one month.

This **directly conflicts** with the buyer–seller anonymity requirement in the
brief. It is the single biggest unresolved legal tension in this design.

**How the demo resolves it:** anonymity is between *users*. The platform holds
full seller identity internally and exposes it to admins. This is the pattern
real marketplaces use — disclosed to the platform, masked between parties.

**Before any real launch this needs legal advice.** We are not claiming the
demo's resolution is lawful; we are documenting that we know about the conflict
and chose a defensible position for a non-commercial demonstration.

---

## 6. Prohibited goods

The admin moderation checklist is built from this list:

- Weapons and ammunition
- Explosives and hazardous chemicals
- Narcotics — NDPS Act 1985
- Wildlife products — Wildlife Protection Act 1972 / CITES
- Counterfeit and IP-infringing goods
- Tobacco; e-cigarettes and vaping products (banned nationwide since 2019)
- Prescription drugs and medical devices
- Antiquities — Antiquities and Art Treasures Act 1972
- Maps misrepresenting India's borders
- Adult content
- Stolen goods
- Personal data or databases

---

## 7. The DEMO banner

Rendered unconditionally from the root layout on every page. It does **not**
read `NEXT_PUBLIC_DEMO_MODE`, because a missing environment variable must never
be able to remove a legally load-bearing notice. The component takes no props
and holds no client state, so there is no code path that hides it.

CI asserts `<DemoBanner />` is present in `src/app/layout.tsx`.

---

## 8. What "compliant for real" would require

See §14 of the implementation plan. Summary: legal advice on §5 above, a
licensed payment aggregator integration, DigiLocker or an authorised KYC
provider, DPDP readiness before 14 May 2027, GST registration with TCS, and
Section 194-O TDS on seller payouts.
