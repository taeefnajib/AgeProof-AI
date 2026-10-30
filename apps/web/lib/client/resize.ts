/**
 * Downscale in the browser before upload: keeps requests under Vercel's body
 * limit, and re-encoding through a canvas drops EXIF (GPS) before it leaves
 * the device. The server strips metadata again regardless.
 */
/** Below this many pixels on the longest side, small hazards like cords can't be seen. */
export const MIN_SIDE = 480;
/** Larger originals are almost certainly not a phone photo of a room. */
export const MAX_INPUT_BYTES = 40 * 1024 * 1024;

export async function downscaleImage(file: Blob, maxSide = 1600): Promise<Blob> {
  if (file.size > MAX_INPUT_BYTES) throw new Error("This file is very large. Please choose a photo under 40 MB.");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error(
      "This photo couldn't be opened in your browser. HEIC photos from iPhones often can't: please choose a JPEG or PNG, or set the camera to Most Compatible (Settings › Camera › Formats).",
    );
  }
  if (Math.max(bitmap.width, bitmap.height) < MIN_SIDE) {
    bitmap.close();
    throw new Error(
      `This photo is very small (${bitmap.width}×${bitmap.height}). Please use the original photo from your camera, at least ${MIN_SIDE} pixels wide.`,
    );
  }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available in this browser.");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return canvas.convertToBlob({ type: "image/jpeg", quality: 0.9 });
}
