"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parseRupeesToPaise } from "@/lib/money";
import {
  incrementFromStartingPaise,
  listingDetailsSchema,
  listingDurationSchema,
  listingIdSchema,
  listingPricingSchema,
} from "@/lib/validation/listing";
import {
  LISTING_IMAGES_BUCKET,
  MAX_IMAGE_BYTES,
  MAX_LISTING_IMAGES,
  isWebpBuffer,
  listingImageObjectPath,
} from "@/lib/listings/images";
import { isEditableStatus } from "@/lib/listings/seller-view";
import { messageForRpcError } from "@/lib/rpc-errors";

export type SellState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  listingId?: string;
};

async function requireActiveUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { supabase, user: null as null, error: "Sign in to sell." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("account_status")
    .eq("id", user.id)
    .single();

  if (profile?.account_status !== "active") {
    return {
      supabase,
      user: null,
      error: "This account cannot create or edit listings.",
    };
  }

  return { supabase, user, error: null };
}

async function loadOwnEditable(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  listingId: string,
) {
  const { data } = await supabase
    .from("listings")
    .select("id, seller_id, status")
    .eq("id", listingId)
    .eq("seller_id", userId)
    .maybeSingle();

  if (!data) return { error: "That listing does not exist." };
  if (!isEditableStatus(data.status)) {
    return { error: "That listing is no longer editable." };
  }
  return { listing: data, error: null };
}

export async function saveDetails(
  _prev: SellState,
  formData: FormData,
): Promise<SellState> {
  const parsed = listingDetailsSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    categoryId: formData.get("categoryId"),
    condition: formData.get("condition"),
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const existingId = formData.get("listingId")?.toString() || "";
  const { supabase, user, error } = await requireActiveUser();
  if (!user) return { error: error ?? "Sign in to sell." };

  if (existingId) {
    const idCheck = listingIdSchema.safeParse(existingId);
    if (!idCheck.success) return { error: "That listing id is not valid." };

    const owned = await loadOwnEditable(supabase, user.id, existingId);
    if (owned.error) return { error: owned.error };

    const { error: updateError } = await supabase
      .from("listings")
      .update({
        title: parsed.data.title,
        description: parsed.data.description,
        category_id: parsed.data.categoryId,
        condition: parsed.data.condition,
      })
      .eq("id", existingId);

    if (updateError) {
      return { error: "Could not save those details. Please try again." };
    }

    revalidatePath("/sell");
    revalidatePath(`/sell/${existingId}`);
    return { listingId: existingId };
  }

  // A new listing always starts as a draft. The INSERT policy refuses any
  // other status, so even a crafted POST cannot skip moderation.
  const { data, error: insertError } = await supabase
    .from("listings")
    .insert({
      seller_id: user.id,
      title: parsed.data.title,
      description: parsed.data.description,
      category_id: parsed.data.categoryId,
      condition: parsed.data.condition,
      starting_price: 10000,
      bid_increment: Number(incrementFromStartingPaise(10000n)),
      duration_seconds: 86400,
      status: "draft",
    })
    .select("id")
    .single();

  if (insertError || !data) {
    return { error: "Could not create that listing. Please try again." };
  }

  revalidatePath("/sell");
  redirect(`/sell/${data.id}?step=2`);
}

export async function savePricing(
  _prev: SellState,
  formData: FormData,
): Promise<SellState> {
  const listingId = formData.get("listingId")?.toString() ?? "";
  const idCheck = listingIdSchema.safeParse(listingId);
  if (!idCheck.success) return { error: "That listing id is not valid." };

  const parsed = listingPricingSchema.safeParse({
    startingPrice: formData.get("startingPrice"),
    reservePrice: formData.get("reservePrice") ?? "",
  });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const starting = parseRupeesToPaise(parsed.data.startingPrice);
  if (starting === null) {
    return { fieldErrors: { startingPrice: ["Starting price is not valid."] } };
  }

  const reserveRaw = parsed.data.reservePrice?.trim() ?? "";
  const reserve = reserveRaw === "" ? null : parseRupeesToPaise(reserveRaw);
  if (reserveRaw !== "" && reserve === null) {
    return { fieldErrors: { reservePrice: ["Reserve is not valid."] } };
  }

  const { supabase, user, error } = await requireActiveUser();
  if (!user) return { error: error ?? "Sign in to sell." };

  const owned = await loadOwnEditable(supabase, user.id, listingId);
  if (owned.error) return { error: owned.error };

  const increment = incrementFromStartingPaise(starting);

  const { error: updateError } = await supabase
    .from("listings")
    .update({
      starting_price: Number(starting),
      reserve_price: reserve === null ? null : Number(reserve),
      bid_increment: Number(increment),
    })
    .eq("id", listingId);

  if (updateError) {
    return { error: "Could not save pricing. Please try again." };
  }

  revalidatePath("/sell");
  revalidatePath(`/sell/${listingId}`);
  return { listingId };
}

export async function saveDuration(
  _prev: SellState,
  formData: FormData,
): Promise<SellState> {
  const listingId = formData.get("listingId")?.toString() ?? "";
  const idCheck = listingIdSchema.safeParse(listingId);
  if (!idCheck.success) return { error: "That listing id is not valid." };

  const parsed = listingDurationSchema.safeParse({
    durationSeconds: formData.get("durationSeconds"),
  });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const { supabase, user, error } = await requireActiveUser();
  if (!user) return { error: error ?? "Sign in to sell." };

  const owned = await loadOwnEditable(supabase, user.id, listingId);
  if (owned.error) return { error: owned.error };

  const { error: updateError } = await supabase
    .from("listings")
    .update({ duration_seconds: parsed.data.durationSeconds })
    .eq("id", listingId);

  if (updateError) {
    return { error: "Could not save the duration. Please try again." };
  }

  revalidatePath("/sell");
  revalidatePath(`/sell/${listingId}`);
  return { listingId };
}

export async function uploadListingImage(
  _prev: SellState,
  formData: FormData,
): Promise<SellState> {
  const listingId = formData.get("listingId")?.toString() ?? "";
  const idCheck = listingIdSchema.safeParse(listingId);
  if (!idCheck.success) return { error: "That listing id is not valid." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a photo to upload." };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { error: "Each photo must be 2 MB or smaller after compression." };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!isWebpBuffer(bytes)) {
    return { error: "Photos must be WebP. The wizard converts them before upload." };
  }

  const { supabase, user, error } = await requireActiveUser();
  if (!user) return { error: error ?? "Sign in to sell." };

  const owned = await loadOwnEditable(supabase, user.id, listingId);
  if (owned.error) return { error: owned.error };

  const { data: existing } = await supabase
    .from("listing_images")
    .select("sort_order")
    .eq("listing_id", listingId);

  const used = new Set((existing ?? []).map((row) => row.sort_order));
  if (used.size >= MAX_LISTING_IMAGES) {
    return { error: `A listing can have at most ${MAX_LISTING_IMAGES} photos.` };
  }

  let sortOrder = 0;
  while (used.has(sortOrder) && sortOrder < MAX_LISTING_IMAGES) {
    sortOrder += 1;
  }

  const imageId = crypto.randomUUID();
  const path = listingImageObjectPath(user.id, listingId, imageId);

  const { error: storageError } = await supabase.storage
    .from(LISTING_IMAGES_BUCKET)
    .upload(path, bytes, {
      contentType: "image/webp",
      upsert: false,
    });

  if (storageError) {
    return { error: "Could not store that photo. Please try again." };
  }

  const { error: rowError } = await supabase.from("listing_images").insert({
    listing_id: listingId,
    storage_path: path,
    sort_order: sortOrder,
  });

  if (rowError) {
    await supabase.storage.from(LISTING_IMAGES_BUCKET).remove([path]);
    return { error: "Could not attach that photo. Please try again." };
  }

  revalidatePath(`/sell/${listingId}`);
  return { listingId };
}

export async function deleteListingImage(
  _prev: SellState,
  formData: FormData,
): Promise<SellState> {
  const listingId = formData.get("listingId")?.toString() ?? "";
  const imageId = formData.get("imageId")?.toString() ?? "";

  if (!listingIdSchema.safeParse(listingId).success) {
    return { error: "That listing id is not valid." };
  }
  if (!listingIdSchema.safeParse(imageId).success) {
    return { error: "That image id is not valid." };
  }

  const { supabase, user, error } = await requireActiveUser();
  if (!user) return { error: error ?? "Sign in to sell." };

  const owned = await loadOwnEditable(supabase, user.id, listingId);
  if (owned.error) return { error: owned.error };

  const { data: image } = await supabase
    .from("listing_images")
    .select("id, storage_path, sort_order")
    .eq("id", imageId)
    .eq("listing_id", listingId)
    .maybeSingle();

  if (!image) return { error: "That photo is not on this listing." };

  await supabase.from("listing_images").delete().eq("id", image.id);
  await supabase.storage.from(LISTING_IMAGES_BUCKET).remove([image.storage_path]);

  // sort_order is allowed to have gaps. Cover is the lowest remaining
  // sort_order. Compacting through a temporary value would violate the
  // CHECK (sort_order between 0 and 7).

  revalidatePath(`/sell/${listingId}`);
  return { listingId };
}

export async function submitListing(
  _prev: SellState,
  formData: FormData,
): Promise<SellState> {
  const listingId = formData.get("listingId")?.toString() ?? "";
  if (!listingIdSchema.safeParse(listingId).success) {
    return { error: "That listing id is not valid." };
  }

  const { supabase, user, error } = await requireActiveUser();
  if (!user) return { error: error ?? "Sign in to sell." };

  const owned = await loadOwnEditable(supabase, user.id, listingId);
  if (owned.error) return { error: owned.error };

  const { error: rpcError } = await supabase.rpc("submit_listing", {
    p_listing_id: listingId,
  });

  if (rpcError) {
    return { error: messageForRpcError(rpcError) };
  }

  revalidatePath("/");
  revalidatePath("/sell");
  revalidatePath(`/sell/${listingId}`);
  redirect(`/sell/${listingId}`);
}

export async function deleteDraft(formData: FormData): Promise<void> {
  const listingId = formData.get("listingId")?.toString() ?? "";
  if (!listingIdSchema.safeParse(listingId).success) return;

  const { supabase, user } = await requireActiveUser();
  if (!user) return;

  const { data } = await supabase
    .from("listings")
    .select("id, status")
    .eq("id", listingId)
    .eq("seller_id", user.id)
    .maybeSingle();

  if (!data || data.status !== "draft") return;

  const { data: images } = await supabase
    .from("listing_images")
    .select("storage_path")
    .eq("listing_id", listingId);

  await supabase.from("listing_images").delete().eq("listing_id", listingId);
  if (images && images.length > 0) {
    await supabase.storage
      .from(LISTING_IMAGES_BUCKET)
      .remove(images.map((row) => row.storage_path));
  }

  await supabase.from("listings").delete().eq("id", listingId);

  revalidatePath("/sell");
  redirect("/sell");
}
