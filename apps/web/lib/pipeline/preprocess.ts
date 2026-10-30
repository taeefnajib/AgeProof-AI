import { createHash } from "node:crypto";
import sharp from "sharp";
import type { Luminance } from "../schema/analysis";

export const MAX_SIDE = 1600;
/** Luma below this (0–255) counts as a "dark" pixel for the lighting check. */
export const DARK_LUMA = 50;

/**
 * Variance of the Laplacian on a 512px greyscale copy: a standard focus measure.
 * Calibrated on demo/: sharp photos score 170–2700, a heavy blur (σ=8) scores under 12.
 */
export async function sharpness(jpeg: Buffer): Promise<number> {
  const { data, info } = await sharp(jpeg)
    .resize(512, 512, { fit: "inside" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  let s = 0;
  let s2 = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const v = data[i - w] + data[i + w] + data[i - 1] + data[i + 1] - 4 * data[i];
      s += v;
      s2 += v * v;
      n++;
    }
  }
  return Math.round(s2 / n - (s / n) ** 2);
}

export type Preprocessed = {
  jpeg: Buffer;
  dataUrl: string;
  sha256: string;
  width: number;
  height: number;
  luminance: Luminance;
  sharpness: number;
};

/**
 * Step 0: apply EXIF orientation, downscale the longest side to 1600px and
 * re-encode. sharp drops all metadata (EXIF, GPS) unless asked to keep it.
 */
export async function preprocess(input: Buffer): Promise<Preprocessed> {
  const jpeg = await sharp(input)
    .rotate()
    .resize(MAX_SIDE, MAX_SIDE, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer();

  const meta = await sharp(jpeg).metadata();
  const { data } = await sharp(jpeg).greyscale().raw().toBuffer({ resolveWithObject: true });
  let sum = 0;
  let dark = 0;
  for (let i = 0; i < data.length; i++) {
    sum += data[i];
    if (data[i] < DARK_LUMA) dark++;
  }

  return {
    jpeg,
    dataUrl: `data:image/jpeg;base64,${jpeg.toString("base64")}`,
    sha256: createHash("sha256").update(jpeg).digest("hex"),
    width: meta.width,
    height: meta.height,
    luminance: {
      mean: Math.round((sum / data.length) * 10) / 10,
      dark_pct: Math.round((dark / data.length) * 1000) / 10,
    },
    sharpness: await sharpness(jpeg),
  };
}
