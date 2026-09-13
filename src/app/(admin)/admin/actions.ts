"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isCompleteChecklist } from "@/lib/compliance/prohibited-goods";
import { listingIdSchema } from "@/lib/validation/listing";
import { messageForRpcError } from "@/lib/rpc-errors";

export type AdminState = {
  error?: string;
};

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, error: "Sign in as an administrator." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    return { supabase, error: "Only an administrator can do that." };
  }

  return { supabase, error: null };
}

export async function approveListing(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  const listingId = formData.get("listingId")?.toString() ?? "";
  if (!listingIdSchema.safeParse(listingId).success) {
    return { error: "That listing id is not valid." };
  }

  const checked = formData.getAll("checklist").map(String);
  if (!isCompleteChecklist(checked)) {
    return {
      error:
        "Confirm every item on the prohibited-goods checklist before approving.",
    };
  }

  const { supabase, error } = await requireAdmin();
  if (error) return { error };

  const { error: rpcError } = await supabase.rpc("approve_listing", {
    p_listing_id: listingId,
  });

  if (rpcError) {
    return { error: messageForRpcError(rpcError) };
  }

  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/admin/listings");
  revalidatePath(`/admin/listings/${listingId}`);
  revalidatePath(`/listings/${listingId}`);
  redirect("/admin/listings");
}

export async function rejectListing(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  const listingId = formData.get("listingId")?.toString() ?? "";
  if (!listingIdSchema.safeParse(listingId).success) {
    return { error: "That listing id is not valid." };
  }

  const note = (formData.get("reviewNote")?.toString() ?? "").trim();
  if (note.length < 8) {
    return { error: "Explain the rejection in at least 8 characters." };
  }

  const { supabase, error } = await requireAdmin();
  if (error) return { error };

  const { error: rpcError } = await supabase.rpc("reject_listing", {
    p_listing_id: listingId,
    p_note: note,
  });

  if (rpcError) {
    return { error: messageForRpcError(rpcError) };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/listings");
  revalidatePath(`/sell/${listingId}`);
  redirect("/admin/listings");
}
