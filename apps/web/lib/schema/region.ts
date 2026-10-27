import { z } from "zod";

/** Pixel box in preprocessed-image coordinates. x2/y2 are exclusive (half-open). */
export const BoxSchema = z.object({
  x1: z.number(),
  y1: z.number(),
  x2: z.number(),
  y2: z.number(),
});
export type Box = z.infer<typeof BoxSchema>;

/**
 * Binary mask for the area inside `box`, as a row-major raster of `w` x `h`
 * cells, run-length encoded: alternating counts of 0s then 1s, starting with 0s.
 * SAM returns masks cropped to the box; the raster may be lower resolution than
 * the box, so scale by box size / raster size to get image pixels.
 */
export const MaskSchema = z.object({
  w: z.number().int().positive(),
  h: z.number().int().positive(),
  rle: z.array(z.number().int().nonnegative()),
});
export type Mask = z.infer<typeof MaskSchema>;

export const RegionSchema = z.object({
  id: z.string(), // R1, R2…
  concept: z.string(),
  score: z.number().min(0).max(1),
  box: BoxSchema,
  /** Mask area as % of the whole image. */
  area_pct: z.number(),
  mask: MaskSchema,
  /** SVG path in mask-raster coordinates; place with box + raster size. */
  svg_path: z.string(),
});
export type Region = z.infer<typeof RegionSchema>;
