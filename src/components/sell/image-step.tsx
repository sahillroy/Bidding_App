"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  deleteListingImage,
  uploadListingImage,
  type SellState,
} from "@/app/(app)/sell/actions";
import { Button } from "@/components/ui/button";
import { compressToWebp } from "@/lib/images/compress";
import {
  ACCEPTED_INPUT_TYPES,
  MAX_IMAGE_BYTES,
  MAX_LISTING_IMAGES,
} from "@/lib/listings/images";

type Image = {
  id: string;
  url: string;
  sort_order: number;
};

export function ImageStep({
  listingId,
  images,
}: {
  listingId: string;
  images: Image[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [compressing, setCompressing] = useState(false);
  const [uploadState, uploadAction, uploading] = useActionState<
    SellState,
    FormData
  >(uploadListingImage, {});
  const [deleteState, deleteAction, deleting] = useActionState<
    SellState,
    FormData
  >(deleteListingImage, {});

  useEffect(() => {
    if (uploadState.listingId || deleteState.listingId) {
      router.refresh();
    }
  }, [uploadState.listingId, deleteState.listingId, router]);

  async function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setLocalError(null);

    if (images.length >= MAX_LISTING_IMAGES) {
      setLocalError(`A listing can have at most ${MAX_LISTING_IMAGES} photos.`);
      return;
    }

    if (
      !ACCEPTED_INPUT_TYPES.includes(
        file.type as (typeof ACCEPTED_INPUT_TYPES)[number],
      )
    ) {
      setLocalError("Use a JPEG, PNG, or WebP photo.");
      return;
    }

    setCompressing(true);
    try {
      const blob = await compressToWebp(file);
      if (blob.size > MAX_IMAGE_BYTES) {
        setLocalError("That photo is still over 2 MB after compression.");
        return;
      }
      const compressed = new File([blob], "photo.webp", { type: "image/webp" });
      const data = new FormData();
      data.set("listingId", listingId);
      data.set("file", compressed);
      uploadAction(data);
    } catch (err) {
      setLocalError(
        err instanceof Error ? err.message : "Could not convert that photo.",
      );
    } finally {
      setCompressing(false);
    }
  }

  const busy = compressing || uploading || deleting;
  const error = localError || uploadState.error || deleteState.error;

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm leading-relaxed">
        Up to {MAX_LISTING_IMAGES} photos, converted to WebP in your browser
        before they leave the machine. The first photo is the cover.
      </p>

      {images.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {images.map((image, index) => (
            <li key={image.id} className="group relative overflow-hidden rounded-lg border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image.url}
                alt=""
                className="aspect-[4/3] w-full object-cover"
              />
              {index === 0 && (
                <span className="bg-background/90 absolute top-2 left-2 rounded px-1.5 py-0.5 text-[10px] font-medium tracking-wide uppercase">
                  Cover
                </span>
              )}
              <form action={deleteAction}>
                <input type="hidden" name="listingId" value={listingId} />
                <input type="hidden" name="imageId" value={image.id} />
                <button
                  type="submit"
                  disabled={busy}
                  className="bg-background/90 hover:bg-background absolute right-2 bottom-2 rounded px-2 py-1 text-xs"
                >
                  Remove
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <div>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_INPUT_TYPES.join(",")}
          className="sr-only"
          onChange={onPick}
        />
        <Button
          type="button"
          variant="outline"
          disabled={busy || images.length >= MAX_LISTING_IMAGES}
          onClick={() => inputRef.current?.click()}
        >
          {compressing
            ? "Compressing…"
            : uploading
              ? "Uploading…"
              : images.length === 0
                ? "Add a photo"
                : "Add another photo"}
        </Button>
        <p className="text-muted-foreground mt-2 text-xs">
          {images.length} / {MAX_LISTING_IMAGES} used
        </p>
      </div>

      {error && (
        <p
          role="alert"
          className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border px-3 py-2 text-sm"
        >
          {error}
        </p>
      )}
    </div>
  );
}
