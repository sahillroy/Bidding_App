/**
 * Listing image rules and the public URL helper.
 *
 * Storage free tier: 1 GB, 50 MB max file. The plan (implementationplan.md
 * §3.3) compresses to WebP on upload and caps at 8 images. The 8-image cap is
 * also a CHECK on listing_images.sort_order (0–7).
 *
 * The number itself is never stored anywhere except as a storage path and a
 * sort order. No EXIF is persisted — the client re-encodes to WebP, which
 * strips it.
 */

export const LISTING_IMAGES_BUCKET = "listing-images";
export const MAX_LISTING_IMAGES = 8;
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2 MiB after compression
export const ACCEPTED_INPUT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

/** WebP file header: RIFF....WEBP */
export function isWebpBuffer(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  return (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  );
}

export function publicListingImageUrl(storagePath: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return "";
  const trimmed = storagePath.replace(/^\/+/, "");
  return `${base.replace(/\/$/, "")}/storage/v1/object/public/${LISTING_IMAGES_BUCKET}/${trimmed}`;
}

export function listingImageObjectPath(
  sellerId: string,
  listingId: string,
  imageId: string,
): string {
  return `${sellerId}/${listingId}/${imageId}.webp`;
}

export type ListingImageRow = {
  id: string;
  listing_id: string;
  storage_path: string;
  sort_order: number;
};
