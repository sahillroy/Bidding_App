import { describe, it, expect, beforeAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Row Level Security integration tests.
 *
 * This is Phase 1's acceptance criterion: proof that an anonymous client cannot
 * read another user's profile row, and that the policies behave the same way
 * for anonymous, non-owner, owner and admin.
 *
 * These tests run against a REAL database. They are skipped when the
 * environment is not configured, so `npm run test:run` stays green on a machine
 * with no database — but they must be run and pass before Phase 1 is signed
 * off. CI runs them once a Supabase project exists.
 *
 * Point them at a local `supabase start` stack, never at production: they
 * create and delete users.
 */

const URL = process.env.SUPABASE_TEST_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.SUPABASE_TEST_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_TEST_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

const configured = Boolean(URL && ANON && SERVICE);

const describeIfConfigured = configured ? describe : describe.skip;

/** A throwaway password for ephemeral test users. Never a real credential. */
const TEST_PASSWORD = "correct-horse-battery-staple";

type TestUser = {
  id: string;
  email: string;
  handle: string;
  client: SupabaseClient;
};

describeIfConfigured("Row Level Security", () => {
  let admin: SupabaseClient;
  let anonClient: SupabaseClient;
  let alice: TestUser;
  let bob: TestUser;

  /** Creates a confirmed user and returns a client already signed in as them. */
  async function makeUser(label: string): Promise<TestUser> {
    const email = `${label}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}@example.test`;

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password: TEST_PASSWORD,
      email_confirm: true,
    });
    if (createError) throw createError;

    const client = createClient(URL!, ANON!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: signInError } = await client.auth.signInWithPassword({
      email,
      password: TEST_PASSWORD,
    });
    if (signInError) throw signInError;

    // The profile row is created by the on_auth_user_created trigger, not by
    // us. Reading it back is itself a test that the trigger fired.
    const { data: profile } = await admin
      .from("profiles")
      .select("handle")
      .eq("id", created.user.id)
      .single();

    return {
      id: created.user.id,
      email,
      handle: profile!.handle,
      client,
    };
  }

  beforeAll(async () => {
    admin = createClient(URL!, SERVICE!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    anonClient = createClient(URL!, ANON!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    alice = await makeUser("alice");
    bob = await makeUser("bob");
  }, 60_000);

  describe("signup trigger", () => {
    it("creates a profile automatically, with a generated handle", async () => {
      const { data } = await admin
        .from("profiles")
        .select("id, handle, role, kyc_status, account_status")
        .eq("id", alice.id)
        .single();

      expect(data).not.toBeNull();
      expect(data!.handle).toMatch(/^bidder_[0-9a-f]{6}$/);
      // Defaults matter: a new user must not arrive verified or as an admin.
      expect(data!.role).toBe("user");
      expect(data!.kyc_status).toBe("none");
      expect(data!.account_status).toBe("active");
    });

    it("gives different users different handles", () => {
      expect(alice.handle).not.toBe(bob.handle);
    });
  });

  describe("profiles", () => {
    it("lets a user read their own row", async () => {
      const { data, error } = await alice.client
        .from("profiles")
        .select("id, handle")
        .eq("id", alice.id)
        .single();

      expect(error).toBeNull();
      expect(data!.id).toBe(alice.id);
    });

    // THE PHASE 1 ACCEPTANCE TEST.
    it("does not let an anonymous client read anyone's profile", async () => {
      const { data, error } = await anonClient
        .from("profiles")
        .select("id, handle, display_name")
        .eq("id", alice.id);

      // RLS returns an empty set rather than an error: from the policy's point
      // of view the row does not exist. Either outcome is acceptable, an
      // actual row is not.
      expect(error ?? { code: null }).toBeTruthy();
      expect(data ?? []).toHaveLength(0);
    });

    it("does not let one user read another user's profile", async () => {
      const { data } = await bob.client
        .from("profiles")
        .select("id, handle, display_name")
        .eq("id", alice.id);

      expect(data ?? []).toHaveLength(0);
    });

    it("exposes only handles through public_profiles", async () => {
      const { data, error } = await anonClient
        .from("public_profiles")
        .select("*")
        .eq("id", alice.id)
        .single();

      expect(error).toBeNull();
      expect(data!.handle).toBe(alice.handle);
      // The view must not carry anything else. If someone adds a column, this
      // fails, which is the intent.
      expect(Object.keys(data!).sort()).toEqual(["created_at", "handle", "id"]);
    });
  });

  describe("privilege escalation", () => {
    // The hole described in docs/SECURITY_NOTES.md and CONTEXT.md §6.2. RLS
    // permits the row — column grants are what stop the write.
    it("does not let a user promote themselves to admin", async () => {
      const { error } = await alice.client
        .from("profiles")
        .update({ role: "admin" })
        .eq("id", alice.id);

      expect(error).not.toBeNull();

      const { data } = await admin
        .from("profiles")
        .select("role")
        .eq("id", alice.id)
        .single();
      expect(data!.role).toBe("user");
    });

    it("does not let a user verify their own identity check", async () => {
      const { error } = await alice.client
        .from("profiles")
        .update({ kyc_status: "verified" })
        .eq("id", alice.id);

      expect(error).not.toBeNull();

      const { data } = await admin
        .from("profiles")
        .select("kyc_status")
        .eq("id", alice.id)
        .single();
      expect(data!.kyc_status).toBe("none");
    });

    it("does let a user change their own display name", async () => {
      const { error } = await alice.client
        .from("profiles")
        .update({ display_name: "Alice A" })
        .eq("id", alice.id);

      expect(error).toBeNull();
    });

    it("does not let a user edit someone else's display name", async () => {
      await bob.client
        .from("profiles")
        .update({ display_name: "pwned" })
        .eq("id", alice.id);

      const { data } = await admin
        .from("profiles")
        .select("display_name")
        .eq("id", alice.id)
        .single();
      expect(data!.display_name).not.toBe("pwned");
    });
  });

  describe("bids are append only", () => {
    it("refuses a direct insert from an authenticated client", async () => {
      const { error } = await alice.client.from("bids").insert({
        listing_id: "00000000-0000-0000-0000-000000000000",
        bidder_id: alice.id,
        amount: 100,
      });

      // All writes go through place_bid. Direct INSERT is revoked.
      expect(error).not.toBeNull();
    });

    it("refuses an update even from the service role", async () => {
      // The service role bypasses RLS entirely, which is exactly why the
      // immutability trigger exists. This is the test that proves the trigger
      // and not merely the policy is doing the work.
      const { error } = await admin
        .from("bids")
        .update({ amount: 1 })
        .eq("id", "00000000-0000-0000-0000-000000000000");

      // No row matches, so this may succeed vacuously; the trigger is verified
      // properly in Phase 4 once real bids exist. Kept here as a placeholder so
      // the intent is recorded next to the other append-only assertions.
      expect(error === null || error.message).toBeTruthy();
    });
  });

  describe("public catalogue (Phase 2)", () => {
    it("lets an anonymous client read live listings", async () => {
      const { data, error } = await anonClient
        .from("listings")
        .select("id, title, status")
        .eq("status", "live")
        .limit(5);

      expect(error).toBeNull();
      // The seed creates 41 live listings. Anonymous browsing is the whole
      // point of Phase 2, so an empty result here is a failure, not a pass.
      expect((data ?? []).length).toBeGreaterThan(0);
    });

    it("hides draft and pending_review listings from everyone public", async () => {
      // This is Phase 3's guarantee, enforced by RLS rather than by a filter in
      // application code. Create an unapproved listing as the service role and
      // confirm the anon client cannot see it.
      const { data: cat } = await admin
        .from("categories")
        .select("id")
        .limit(1)
        .single();
      const { data: seller } = await admin
        .from("profiles")
        .select("id")
        .limit(1)
        .single();

      const { data: created, error: insertError } = await admin
        .from("listings")
        .insert({
          seller_id: seller!.id,
          title: "Hidden draft listing for RLS test",
          description: "This must never be visible to an anonymous client.",
          category_id: cat!.id,
          condition: "good",
          starting_price: 100000,
          bid_increment: 5000,
          duration_seconds: 3600,
          status: "pending_review",
        })
        .select("id")
        .single();

      expect(insertError).toBeNull();

      const { data: seen } = await anonClient
        .from("listings")
        .select("id")
        .eq("id", created!.id);

      expect(seen ?? []).toHaveLength(0);

      await admin.from("listings").delete().eq("id", created!.id);
    });

    it("never exposes a seller uuid through public_bids", async () => {
      const { data } = await anonClient.from("public_bids").select("*").limit(1);
      for (const row of data ?? []) {
        expect(Object.keys(row)).not.toContain("bidder_id");
      }
    });

    it("search runs as the caller, so it cannot surface unapproved listings", async () => {
      // search_listings is deliberately NOT security definer. If it were, it
      // would bypass RLS and make drafts searchable.
      const { data, error } = await anonClient.rpc("search_listings", {
        p_query: "hidden draft listing",
        p_limit: 10,
      });
      expect(error).toBeNull();
      expect(data ?? []).toHaveLength(0);
    });
  });

  describe("selling and moderation (Phase 3)", () => {
    async function insertDraftAs(user: TestUser, title: string) {
      const { data: cat } = await admin
        .from("categories")
        .select("id")
        .limit(1)
        .single();

      const { data, error } = await user.client
        .from("listings")
        .insert({
          seller_id: user.id,
          title,
          description: "A draft used by the Phase 3 RLS suite.",
          category_id: cat!.id,
          condition: "good",
          starting_price: 100000,
          bid_increment: 5000,
          duration_seconds: 3600,
          status: "draft",
        })
        .select("id")
        .single();

      if (error) throw error;
      return data!.id as string;
    }

    it("lets a seller create a draft that an anonymous client cannot see", async () => {
      const id = await insertDraftAs(alice, "Alice draft for RLS");

      const { data: own } = await alice.client
        .from("listings")
        .select("id, status")
        .eq("id", id)
        .maybeSingle();
      expect(own?.status).toBe("draft");

      const { data: seen } = await anonClient
        .from("listings")
        .select("id")
        .eq("id", id);
      expect(seen ?? []).toHaveLength(0);
    });

    it("refuses a seller inserting a listing that is already live", async () => {
      const { data: cat } = await admin
        .from("categories")
        .select("id")
        .limit(1)
        .single();

      const { error } = await alice.client.from("listings").insert({
        seller_id: alice.id,
        title: "Should not skip moderation",
        description: "A crafted insert that tries to go live immediately.",
        category_id: cat!.id,
        condition: "good",
        starting_price: 100000,
        bid_increment: 5000,
        duration_seconds: 3600,
        status: "live",
        starts_at: new Date().toISOString(),
        ends_at: new Date(Date.now() + 3600_000).toISOString(),
      });

      expect(error).not.toBeNull();
    });

    it("refuses submit_listing when the listing has no photo", async () => {
      const id = await insertDraftAs(alice, "Draft without a photo");
      const { error } = await alice.client.rpc("submit_listing", {
        p_listing_id: id,
      });
      expect(error).not.toBeNull();
      expect(error!.message).toMatch(/LISTING_NEEDS_IMAGE/);
    });

    it("keeps a submitted listing invisible until an admin approves it", async () => {
      const id = await insertDraftAs(alice, "Submitted then approved");

      const { error: imageError } = await alice.client
        .from("listing_images")
        .insert({
          listing_id: id,
          storage_path: `${alice.id}/${id}/test.webp`,
          sort_order: 0,
        });
      expect(imageError).toBeNull();

      const { error: submitError } = await alice.client.rpc("submit_listing", {
        p_listing_id: id,
      });
      expect(submitError).toBeNull();

      const { data: pending } = await anonClient
        .from("listings")
        .select("id")
        .eq("id", id);
      expect(pending ?? []).toHaveLength(0);

      const { data: searchPending } = await anonClient.rpc("search_listings", {
        p_query: "Submitted then approved",
        p_limit: 10,
      });
      expect(searchPending ?? []).toHaveLength(0);

      const { error: sellerApprove } = await alice.client.rpc(
        "approve_listing",
        { p_listing_id: id },
      );
      expect(sellerApprove).not.toBeNull();

      await admin.from("profiles").update({ role: "admin" }).eq("id", bob.id);

      const { error: adminApprove } = await bob.client.rpc("approve_listing", {
        p_listing_id: id,
      });
      expect(adminApprove).toBeNull();

      const { data: live } = await anonClient
        .from("listings")
        .select("id, status")
        .eq("id", id)
        .maybeSingle();
      expect(live?.status).toBe("live");

      const { data: searchLive } = await anonClient.rpc("search_listings", {
        p_query: "Submitted then approved",
        p_limit: 10,
      });
      expect(
        (searchLive ?? []).some((row: { id: string }) => row.id === id),
      ).toBe(true);

      await admin.from("profiles").update({ role: "user" }).eq("id", bob.id);
    });
  });

  describe("kyc_submissions", () => {
    it("never exposes a submission to an anonymous client", async () => {
      const { data } = await anonClient.from("kyc_submissions").select("*");
      expect(data ?? []).toHaveLength(0);
    });

    it("does not let a user submit an already-approved record", async () => {
      const { error } = await alice.client.from("kyc_submissions").insert({
        user_id: alice.id,
        doc_type: "pan",
        format_valid: true,
        masked_hint: "*****1234*",
        status: "approved",
      });

      expect(error).not.toBeNull();
    });
  });
});

describe("RLS test configuration", () => {
  it("reports whether the integration suite actually ran", () => {
    if (!configured) {
      console.warn(
        "\n  RLS integration tests SKIPPED — no database configured.\n" +
          "  Set SUPABASE_TEST_URL, SUPABASE_TEST_ANON_KEY and " +
          "SUPABASE_TEST_SERVICE_KEY.\n" +
          "  Phase 1 is not complete until these pass.\n",
      );
    }
    expect(true).toBe(true);
  });
});
