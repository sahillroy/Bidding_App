# Auction rules

> **Status:** Phase 3 has the listing lifecycle as far as go-live. Bidding
> and settlement are Phases 4 and 5. The authoritative specification is §6
> and §7 of [implementationplan.md](./implementationplan.md).

This file will state the rules in plain English, so that a non-programmer can
check the behaviour without reading SQL.

## The rules, in outline

**Duration.** A seller chooses any window from 1 hour to 30 days.

**Who may bid.** A signed-in user whose identity check is verified and whose
account is active. A seller may never bid on their own listing.

**Minimum bid.** The current price plus the increment for its price band. The
first bid may equal the starting price.

| Current price | Minimum increment |
|---|---|
| under ₹500 | ₹10 |
| ₹500 – ₹4,999 | ₹50 |
| ₹5,000 – ₹24,999 | ₹250 |
| ₹25,000 – ₹99,999 | ₹1,000 |
| ₹1,00,000 – ₹4,99,999 | ₹2,500 |
| ₹5,00,000 and above | ₹5,000 |

**The clock.** The server decides everything. The browser receives `ends_at`
together with the server's current time, computes the offset once, and animates
a countdown against the corrected clock. A browser with a wrong clock sees a
wrong countdown but can never place a late bid, because the database re-checks
the time inside the transaction.

**Ties are impossible.** Bid placement takes a row lock on the listing, so two
simultaneous bids are serialised. The second one re-reads the new price and is
rejected if it is now too low.

**After the auction ends.** The highest bidder has 24 hours to pay. If they do
not, they take a strike and the item is offered to the runner-up at the
runner-up's own bid — if the seller agrees. One strike suspends an account; two
bans it permanently.

**Before it goes live (Phase 3).** A seller writes a draft, adds photos, and
submits it. An administrator checks it against the prohibited-goods list and
a price-sanity flag. Approve takes the auction live immediately for the
duration the seller chose. Reject returns it to the seller with a note.
An unapproved listing is invisible on the public site because the database
refuses to return it, not because the page hides it.
