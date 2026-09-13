/**
 * Browser-only WebP conversion. Imported only from Client Components.
 *
 * Re-encoding through canvas strips EXIF (including GPS) and keeps us under
 * the Storage free-tier file cap. The Server Action still checks the WebP
 * magic bytes — this function is a convenience, not a trust boundary.
 *
 * Production would re-encode on the server (sharp, or Supabase Image
 * Transformation on a paid plan) so a client that skips this step cannot
 * upload a 20 MB JPEG. Noted in SECURITY_NOTES.md.
 */

const MAX_EDGE = 1600;
const QUALITY = 0.82;

export async function compressToWebp(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("Could not draw that image.");
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/webp", QUALITY);
  });

  if (!blob) {
    throw new Error(
      "This browser could not encode WebP. Try Chrome, Firefox, or Edge.",
    );
  }

  return blob;
}
