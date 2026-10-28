import type { Box, Region } from "../schema/region";
import { rleToRaster } from "./mask";

/**
 * Masks resampled onto one coarse image-wide grid so regions can be compared
 * (overlap, adjacency). One cell = STEP×STEP image pixels.
 */
export const STEP = 4;

export type Grid = { gw: number; gh: number; step: number };

export function makeGrid(width: number, height: number, step = STEP): Grid {
  return { gw: Math.ceil(width / step), gh: Math.ceil(height / step), step };
}

/** Rasterise one region's mask onto the grid by sampling each cell centre. */
export function regionCells(region: Region, grid: Grid): Uint8Array {
  const cells = new Uint8Array(grid.gw * grid.gh);
  const { box, mask } = region;
  const raster = rleToRaster(mask);
  const bw = box.x2 - box.x1;
  const bh = box.y2 - box.y1;
  if (bw <= 0 || bh <= 0) return cells;
  const gx1 = Math.max(0, Math.floor(box.x1 / grid.step));
  const gy1 = Math.max(0, Math.floor(box.y1 / grid.step));
  const gx2 = Math.min(grid.gw, Math.ceil(box.x2 / grid.step));
  const gy2 = Math.min(grid.gh, Math.ceil(box.y2 / grid.step));
  for (let gy = gy1; gy < gy2; gy++) {
    const cy = (gy + 0.5) * grid.step;
    if (cy < box.y1 || cy >= box.y2) continue;
    const my = Math.min(mask.h - 1, Math.floor(((cy - box.y1) * mask.h) / bh));
    for (let gx = gx1; gx < gx2; gx++) {
      const cx = (gx + 0.5) * grid.step;
      if (cx < box.x1 || cx >= box.x2) continue;
      const mx = Math.min(mask.w - 1, Math.floor(((cx - box.x1) * mask.w) / bw));
      if (raster[my * mask.w + mx]) cells[gy * grid.gw + gx] = 1;
    }
  }
  return cells;
}

export function union(grid: Grid, layers: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(grid.gw * grid.gh);
  for (const l of layers) for (let i = 0; i < out.length; i++) if (l[i]) out[i] = 1;
  return out;
}

export function count(cells: Uint8Array): number {
  let n = 0;
  for (let i = 0; i < cells.length; i++) n += cells[i];
  return n;
}

export function intersectCount(a: Uint8Array, b: Uint8Array): number {
  let n = 0;
  for (let i = 0; i < a.length; i++) if (a[i] && b[i]) n++;
  return n;
}

/** Square dilation by `r` cells (separable max filter). */
export function dilate(grid: Grid, cells: Uint8Array, r: number): Uint8Array {
  if (r <= 0) return cells.slice();
  const { gw, gh } = grid;
  const tmp = new Uint8Array(cells.length);
  for (let y = 0; y < gh; y++) {
    let run = -Infinity; // index of last "on" cell seen
    for (let x = 0; x < gw; x++) {
      if (cells[y * gw + x]) run = x;
      if (x - run <= r) tmp[y * gw + x] = 1;
    }
    run = Infinity;
    for (let x = gw - 1; x >= 0; x--) {
      if (cells[y * gw + x]) run = x;
      if (run - x <= r) tmp[y * gw + x] = 1;
    }
  }
  const out = new Uint8Array(cells.length);
  for (let x = 0; x < gw; x++) {
    let run = -Infinity;
    for (let y = 0; y < gh; y++) {
      if (tmp[y * gw + x]) run = y;
      if (y - run <= r) out[y * gw + x] = 1;
    }
    run = Infinity;
    for (let y = gh - 1; y >= 0; y--) {
      if (tmp[y * gw + x]) run = y;
      if (run - y <= r) out[y * gw + x] = 1;
    }
  }
  return out;
}

/** Gap in pixels between two boxes (0 when they touch or overlap). */
export function boxGap(a: Box, b: Box): number {
  const dx = Math.max(0, b.x1 - a.x2, a.x1 - b.x2);
  const dy = Math.max(0, b.y1 - a.y2, a.y1 - b.y2);
  return Math.hypot(dx, dy);
}

export function boxWidth(b: Box) {
  return b.x2 - b.x1;
}
export function boxHeight(b: Box) {
  return b.y2 - b.y1;
}
