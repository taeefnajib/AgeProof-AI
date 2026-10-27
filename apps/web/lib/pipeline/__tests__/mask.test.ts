import { describe, expect, it } from "vitest";
import { maskAreaPx, maskTransform, rasterToRle, rleOnCount, rleToRaster } from "../mask";

describe("mask RLE", () => {
  it("round-trips a raster", () => {
    const raster = Uint8Array.from([0, 0, 1, 1, 1, 0, 1, 0, 0, 1, 1, 1]);
    const rle = rasterToRle(raster);
    expect(rle).toEqual([2, 3, 1, 1, 2, 3]);
    expect(Array.from(rleToRaster({ w: 4, h: 3, rle }))).toEqual(Array.from(raster));
  });

  it("starts with a zero-length run when the first cell is on", () => {
    expect(rasterToRle([1, 1, 0])).toEqual([0, 2, 1]);
  });

  it("counts on cells and scales area to the box", () => {
    const mask = { w: 2, h: 2, rle: [1, 3] }; // 3 of 4 cells on
    expect(rleOnCount(mask)).toBe(3);
    // Box is 20x10 px, so each cell covers 10x5 = 50 px.
    expect(maskAreaPx(mask, { x1: 0, y1: 0, x2: 20, y2: 10 })).toBe(150);
    expect(maskTransform(mask, { x1: 5, y1: 7, x2: 25, y2: 17 })).toBe("translate(5 7) scale(10 5)");
  });
});
