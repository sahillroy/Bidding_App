# Demo script

> **Status:** Phase 0 — placeholder. Written properly in Phase 7.

What to click, in what order, to show the project in about five minutes.

## Planned outline

1. **Browse logged out** — the whole catalogue is visible without an account.
2. **Try to bid** — prompted to sign in.
3. **Sign up, then try to bid again** — blocked, identity check required.
4. **Complete the simulated identity check** — show the inline notice saying no
   real number should be entered, and show that the database row holds only a
   masked hint.
5. **Admin approves the identity check and a pending listing** — nothing is
   publicly visible before approval.
6. **Place a bid with two browsers open** — the other window updates live.
7. **Show the concurrency test** — 50 simultaneous identical bids, exactly one
   accepted.
8. **Run a short auction to completion** — close, order created, 24-hour
   deadline, simulated payment, item sold.
9. **Show a default** — deadline passes, strike issued, runner-up offered.
10. **Try to send a phone number in a message** — blocked, with the reason.
11. **Close on the compliance story** — what is real, what is simulated, and
    what a production build would have to do differently.
