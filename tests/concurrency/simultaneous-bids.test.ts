import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * THE PHASE 4 GATE.
 *
 * Fire 50 concurrent identical bids at one listing. Exactly one must be
 * accepted, 49 must fail with BID_TOO_LOW, bid_count must have moved by
 * exactly 1, and current_price must equal the single winning bid.
 *
 * This is the test the whole project is arranged around. If it fails, the
 * bidding engine has a race and everything built on top of it — settlement,
 * strikes, orders, the entire dispute story — is built on a table that can
 * contain two winners for the same auction with no way to tell which is real.
 *
 * WHAT IT IS ACTUALLY PROVING
 *
 * Without `select ... for update` in place_bid, the interleaving is:
 *
 *     tx A: read current_price = X
 *     tx B: read current_price = X       <- same stale value
 *     tx A: amount >= X + increment, accept, write
 *     tx B: amount >= X + increment, accept, write
 *
 * Both bids are individually valid against what each transaction saw. The lock
 * removes the possibility by making B block at the read until A commits, so B
 * re-reads the price A just wrote and correctly rejects.
 *
 * WHY THIS IS FIVE ROUNDS AND NOT ONE
 *
 * The plan specifies a single burst of fifty. That version was written, run,
 * and then run again with `for update` deleted from the function — and it
 * PASSED BOTH TIMES. A gate that passes with the lock removed is not a gate.
 *
 * The reason is timing: the transaction takes about a millisecond, and fifty
 * HTTP round-trips issued by Promise.all do not reliably overlap inside a
 * window that small. Promise.all guarantees the requests are *issued*
 * together; it guarantees nothing about them interleaving inside Postgres.
 *
 * Five rounds fixes it. By the second round the HTTP connections are warm and
 * latency has dropped, so the requests genuinely overlap. Measured with the
 * lock removed, round two accepted EIGHT bids instead of one, the listing
 * ended with nine bid rows instead of five, and highest_bidder_id pointed at
 * someone who was not the top bidder. With the lock restored, all nine
 * assertions pass.
 *
 * The ladder invariant below is the other half. Counting rows would not have
 * caught this on its own: `set bid_count = bid_count + 1` re-reads under the
 * exclusive lock the UPDATE itself takes, so the count stays correct even
 * while two bids sit at the same price.
 */

const URL =
  process.env.SUPABASE_TEST_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON =
  process.env.SUPABASE_TEST_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE =
  process.env.SUPABASE_TEST_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

const configured = Boolean(URL && ANON && SERVICE);
const describeIfConfigured = configured ? describe : describe.skip;

const TEST_PASSWORD = "correct-horse-battery-staple";
const BIDDERS = 10;
const CONCURRENT_BIDS = 50;
const ROUNDS = 5;

/** Marks the rows this suite creates so afterAll can retire them. */
const FIXTURE_MARK = "Concurrency fixture for the Phase 4 gate.";

type Bidder = { id: string; client: SupabaseClient };

describeIfConfigured("place_bid under concurrency", () => {
  let admin: SupabaseClient;
  let bidders: Bidder[] = [];
  let listingId: string;
  let sellerId: string;
  let startingPrice: number;

  beforeAll(async () => {
    admin = createClient(URL!, SERVICE!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // A seller who is not one of the bidders: place_bid rejects a seller
    // bidding on their own listing, and that rule must not be what makes 49
    // of the 50 fail.
    const { data: seller } = await admin
      .from("profiles")
      .select("id")
      .limit(1)
      .single();
    sellerId = seller!.id;

    const { data: category } = await admin
      .from("categories")
      .select("id")
      .limit(1)
      .single();

    startingPrice = 1_000_000; // ₹10,000 in paise

    const { data: listing, error: listingError } = await admin
      .from("listings")
      .insert({
        seller_id: sellerId,
        title: "Concurrency gate fixture",
        description: FIXTURE_MARK,
        category_id: category!.id,
        condition: "good",
        starting_price: startingPrice,
        bid_increment: 25_000, // ₹250, the band for ₹5,000–24,999
        duration_seconds: 3600,
        status: "live",
        starts_at: new Date(Date.now() - 60_000).toISOString(),
        ends_at: new Date(Date.now() + 3_600_000).toISOString(),
      })
      .select("id")
      .single();

    if (listingError) throw listingError;
    listingId = listing!.id;

    // Ten verified bidders sharing 50 requests. One user firing all 50 would
    // still exercise the lock, but several users is closer to the real thing
    // and rules out any per-session serialisation masking the result.
    bidders = await Promise.all(
      Array.from({ length: BIDDERS }, async (_, i) => {
        const email = `gate-${Date.now()}-${i}-${Math.random()
          .toString(36)
          .slice(2, 7)}@example.test`;

        const { data: created, error } = await admin.auth.admin.createUser({
          email,
          password: TEST_PASSWORD,
          email_confirm: true,
        });
        if (error) throw error;

        // place_bid requires a completed identity check. Set directly here:
        // this is a test fixture, and no document number is involved anywhere.
        await admin
          .from("profiles")
          .update({ kyc_status: "verified" })
          .eq("id", created.user.id);

        const client = createClient(URL!, ANON!, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        await client.auth.signInWithPassword({ email, password: TEST_PASSWORD });

        return { id: created.user.id, client };
      }),
    );
  }, 120_000);

  afterAll(async () => {
    if (!admin || !listingId) return;

    // Bids and auction_events are append-only and reference the listing
    // ON DELETE RESTRICT, so the fixture cannot be deleted once it has been
    // bid on — that is the audit trail working as designed. Retire it to
    // `cancelled`, which is not a publicly visible status, so repeated runs
    // never accumulate in the demo catalogue.
    await admin
      .from("listings")
      .update({ status: "cancelled" })
      .eq("id", listingId);
  }, 30_000);

  /**
   * Five rounds of fifty. Each round bids the exact current minimum, so every
   * request in a round is individually valid against the pre-round state and
   * exactly one may win.
   *
   * Rounds matter because ONE round proves very little. The transaction inside
   * place_bid takes about a millisecond, and fifty HTTP round-trips do not
   * reliably overlap inside a window that small — a single round passes even
   * with the lock removed, which was verified by removing it. Repeating raises
   * the chance of a genuine interleaving, and the invariants below turn any
   * interleaving that does occur into a failure rather than silent corruption.
   */
  it("accepts exactly one bid per round across five rounds of fifty", async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const { data: before } = await admin
        .from("listings")
        .select("current_price, starting_price, bid_increment")
        .eq("id", listingId)
        .single();

      // The opening bid may EQUAL the starting price; later bids must clear
      // the stored increment. Every request in this round uses exactly this
      // amount, so all fifty are valid against what each one reads.
      const target =
        before!.current_price === null
          ? before!.starting_price
          : before!.current_price + before!.bid_increment;

      const results = await Promise.all(
        Array.from({ length: CONCURRENT_BIDS }, (_, i) =>
          bidders[i % BIDDERS].client
            .rpc("place_bid", { p_listing_id: listingId, p_amount: target })
            .then(({ error }) => ({ ok: !error, message: error?.message ?? "" })),
        ),
      );

      const accepted = results.filter((r) => r.ok);
      const rejected = results.filter((r) => !r.ok);

      expect(accepted, `round ${round + 1}: more than one bid won`).toHaveLength(1);
      expect(rejected).toHaveLength(CONCURRENT_BIDS - 1);

      // Every rejection must be the price rule. A deadlock, a timeout or a
      // constraint violation would mean the count passed while the engine was
      // actually misbehaving.
      for (const r of rejected) {
        expect(
          r.message,
          `round ${round + 1}: unexpected rejection: ${r.message}`,
        ).toContain("BID_TOO_LOW");
      }
    }
  }, 240_000);

  /**
   * THE INVARIANT THAT ACTUALLY CATCHES A LOST UPDATE.
   *
   * Without the row lock, two transactions can both read the same price and
   * both accept the same amount. Note what that does NOT break: `bid_count`
   * stays right, because `set bid_count = bid_count + 1` re-reads under the
   * exclusive lock the UPDATE itself takes. Counting rows would miss it.
   *
   * What it does break is the ordering guarantee. Two bids would sit on the
   * listing at the SAME amount, when every bid after the first is required to
   * exceed its predecessor by at least the stored increment. That is the
   * property an auction actually rests on, and it is checkable after any
   * sequence of bids whatsoever.
   */
  it("holds the bid ladder: every bid strictly clears the one before it", async () => {
    const { data: bids } = await admin
      .from("bids")
      .select("amount, created_at")
      .eq("listing_id", listingId)
      .order("created_at", { ascending: true });

    const { data: listing } = await admin
      .from("listings")
      .select("bid_count, current_price, starting_price, bid_increment")
      .eq("id", listingId)
      .single();

    expect(bids!.length).toBe(ROUNDS);

    const amounts = bids!.map((b) => Number(b.amount));

    // No two bids may share an amount. This is the assertion a lost update
    // trips, and the reason it is here rather than a row count.
    expect(new Set(amounts).size, `duplicate bid amounts: ${amounts}`).toBe(
      amounts.length,
    );

    // The opening bid may equal the starting price.
    expect(amounts[0]).toBeGreaterThanOrEqual(listing!.starting_price);

    // Every later bid clears its predecessor by at least the stored increment.
    for (let i = 1; i < amounts.length; i++) {
      expect(
        amounts[i],
        `bid ${i + 1} did not clear bid ${i} by the increment`,
      ).toBeGreaterThanOrEqual(amounts[i - 1] + listing!.bid_increment);
    }

    // The listing agrees with its own bid history.
    expect(listing!.bid_count).toBe(amounts.length);
    expect(listing!.current_price).toBe(Math.max(...amounts));
  });

  it("points highest_bidder_id at whoever actually placed the top bid", async () => {
    const { data: listing } = await admin
      .from("listings")
      .select("current_price, highest_bidder_id")
      .eq("id", listingId)
      .single();

    const { data: top } = await admin
      .from("bids")
      .select("amount, bidder_id")
      .eq("listing_id", listingId)
      .order("amount", { ascending: false })
      .limit(1)
      .single();

    expect(listing!.current_price).toBe(top!.amount);
    expect(listing!.highest_bidder_id).toBe(top!.bidder_id);
  });

  it("rejects a follow-up bid that does not clear the stored increment", async () => {
    const { data: listing } = await admin
      .from("listings")
      .select("current_price, bid_increment")
      .eq("id", listingId)
      .single();

    const min = listing!.current_price! + listing!.bid_increment;

    // One paisa short must fail, and the error must carry the minimum so the
    // interface can say what would have been accepted.
    const { error } = await bidders[0].client.rpc("place_bid", {
      p_listing_id: listingId,
      p_amount: min - 1,
    });

    expect(error).not.toBeNull();
    expect(error!.message).toContain("BID_TOO_LOW");
    expect(error!.message).toContain(String(min));
  });

  it("accepts a bid that clears the increment exactly", async () => {
    const { data: listing } = await admin
      .from("listings")
      .select("current_price, bid_increment")
      .eq("id", listingId)
      .single();

    const { error } = await bidders[1].client.rpc("place_bid", {
      p_listing_id: listingId,
      p_amount: listing!.current_price! + listing!.bid_increment,
    });

    expect(error).toBeNull();
  });

  it("refuses to let the seller bid on their own listing", async () => {
    // Make one of the verified bidders the seller of a second listing, then
    // have that same account try to bid on it.
    const { data: category } = await admin
      .from("categories")
      .select("id")
      .limit(1)
      .single();

    const { data: own } = await admin
      .from("listings")
      .insert({
        seller_id: bidders[2].id,
        title: "Self-bid fixture",
        description: FIXTURE_MARK,
        category_id: category!.id,
        condition: "good",
        starting_price: 500_000,
        bid_increment: 25_000,
        duration_seconds: 3600,
        status: "live",
        starts_at: new Date(Date.now() - 60_000).toISOString(),
        ends_at: new Date(Date.now() + 3_600_000).toISOString(),
      })
      .select("id")
      .single();

    const { error } = await bidders[2].client.rpc("place_bid", {
      p_listing_id: own!.id,
      p_amount: 500_000,
    });

    expect(error).not.toBeNull();
    expect(error!.message).toContain("SELLER_CANNOT_BID");

    await admin.from("listings").delete().eq("id", own!.id);
  }, 60_000);

  it("refuses a bidder whose identity check is not complete", async () => {
    const email = `unverified-${Date.now()}@example.test`;
    await admin.auth.admin.createUser({
      email,
      password: TEST_PASSWORD,
      email_confirm: true,
    });

    // Deliberately NOT marked verified.
    const client = createClient(URL!, ANON!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await client.auth.signInWithPassword({ email, password: TEST_PASSWORD });

    const { error } = await client.rpc("place_bid", {
      p_listing_id: listingId,
      p_amount: 10_000_000,
    });

    expect(error).not.toBeNull();
    expect(error!.message).toContain("KYC_REQUIRED");
  }, 60_000);

  it("refuses a bid on an auction whose end time has passed", async () => {
    const { data: category } = await admin
      .from("categories")
      .select("id")
      .limit(1)
      .single();

    // The database clock decides. This row's ends_at is in the past, so no
    // matter what a client believes, place_bid must reject.
    const { data: ended } = await admin
      .from("listings")
      .insert({
        seller_id: sellerId,
        title: "Ended fixture",
        description: FIXTURE_MARK,
        category_id: category!.id,
        condition: "good",
        starting_price: 500_000,
        bid_increment: 25_000,
        duration_seconds: 3600,
        status: "live",
        starts_at: new Date(Date.now() - 7_200_000).toISOString(),
        ends_at: new Date(Date.now() - 60_000).toISOString(),
      })
      .select("id")
      .single();

    const { error } = await bidders[3].client.rpc("place_bid", {
      p_listing_id: ended!.id,
      p_amount: 500_000,
    });

    expect(error).not.toBeNull();
    expect(error!.message).toContain("AUCTION_ENDED");

    await admin.from("listings").delete().eq("id", ended!.id);
  }, 60_000);

  it("still refuses a direct insert into bids", async () => {
    // The function is the only writer. If this ever succeeds, every rule above
    // is bypassable and the append-only guarantee is gone.
    const { error } = await bidders[0].client.from("bids").insert({
      listing_id: listingId,
      bidder_id: bidders[0].id,
      amount: 99_000_000,
    });

    expect(error).not.toBeNull();
  });
});
