import sharp from "sharp";
import { maskSvg, regionOverlaySvg } from "../render/overlay";
import type { Region } from "../schema/region";

/**
 * Blur every `person` mask (padded) before the photo is displayed or sent to
 * the VLM (CLAUDE.md §7). Returns the input unchanged if nobody was detected.
 */
export async function blurPeople(
  jpeg: Buffer,
  regions: Region[],
  width: number,
  height: number,
): Promise<{ jpeg: Buffer; blurred: number }> {
  const people = regions.filter((r) => r.concept === "person");
  if (people.length === 0) return { jpeg, blurred: 0 };
  const pad = Math.round(Math.max(width, height) * 0.01);
  const mask = await sharp(Buffer.from(maskSvg(people, width, height, pad)))
    .resize(width, height)
    .png()
    .toBuffer();
  // Blurred copy, kept only where the mask is opaque, laid over the original.
  const blurredPeople = await sharp(jpeg)
    .blur(Math.max(12, Math.round(Math.max(width, height) / 60)))
    .ensureAlpha()
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();
  const out = await sharp(jpeg)
    .composite([{ input: blurredPeople }])
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer();
  return { jpeg: out, blurred: people.length };
}

/** Photo with numbered region outlines, for the explain step. */
export async function renderRegionOverlay(
  jpeg: Buffer,
  regions: Region[],
  width: number,
  height: number,
): Promise<Buffer> {
  return sharp(jpeg)
    .composite([{ input: Buffer.from(regionOverlaySvg(regions, width, height)) }])
    .jpeg({ quality: 80 })
    .toBuffer();
}

export const toDataUrl = (jpeg: Buffer) => `data:image/jpeg;base64,${jpeg.toString("base64")}`;
