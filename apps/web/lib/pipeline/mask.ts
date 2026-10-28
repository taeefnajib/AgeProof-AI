import type { Box, Mask } from "../schema/region";

/** Row-major 0/1 raster → alternating run lengths, starting with a run of 0s. */
export function rasterToRle(raster: ArrayLike<number>): number[] {
  const runs: number[] = [];
  let current = 0;
  let count = 0;
  for (let i = 0; i < raster.length; i++) {
    const v = raster[i] ? 1 : 0;
    if (v === current) {
      count++;
    } else {
      runs.push(count);
      current = v;
      count = 1;
    }
  }
  runs.push(count);
  return runs;
}

export function rleToRaster(mask: Mask): Uint8Array {
  const out = new Uint8Array(mask.w * mask.h);
  let pos = 0;
  mask.rle.forEach((run, i) => {
    if (i % 2 === 1) out.fill(1, pos, pos + run);
    pos += run;
  });
  return out;
}

/** Number of "on" cells in the raster. */
export function rleOnCount(mask: Mask): number {
  let n = 0;
  for (let i = 1; i < mask.rle.length; i += 2) n += mask.rle[i];
  return n;
}

/** Mask area in image pixels, accounting for the raster being scaled to the box. */
export function maskAreaPx(mask: Mask, box: Box): number {
  const cellArea = ((box.x2 - box.x1) / mask.w) * ((box.y2 - box.y1) / mask.h);
  return rleOnCount(mask) * cellArea;
}

/** SVG transform that places a mask-raster-space path onto the image. */
export function maskTransform(mask: Mask, box: Box): string {
  const sx = (box.x2 - box.x1) / mask.w;
  const sy = (box.y2 - box.y1) / mask.h;
  return `translate(${box.x1} ${box.y1}) scale(${sx} ${sy})`;
}

/** Centre of mass of a mask in image pixels (falls back to the box centre if empty). */
export function maskCentroid(mask: Mask, box: Box): { x: number; y: number } {
  const raster = rleToRaster(mask);
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let y = 0; y < mask.h; y++) {
    for (let x = 0; x < mask.w; x++) {
      if (raster[y * mask.w + x]) {
        sx += x + 0.5;
        sy += y + 0.5;
        n++;
      }
    }
  }
  if (n === 0) return { x: (box.x1 + box.x2) / 2, y: (box.y1 + box.y2) / 2 };
  return {
    x: box.x1 + (sx / n) * ((box.x2 - box.x1) / mask.w),
    y: box.y1 + (sy / n) * ((box.y2 - box.y1) / mask.h),
  };
}
