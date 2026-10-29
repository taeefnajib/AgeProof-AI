import { PRIORITY_ORDER } from "../pipeline/findings";
import { maskTransform } from "../pipeline/mask";
import type { Finding } from "../schema/finding";
import type { Region } from "../schema/region";
import { conceptColour, PRIORITY_STYLE } from "./palette";
import { layoutPins, pinRadius, primaryRegion } from "./pins";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

/**
 * SVG (image-pixel coordinates) with every region outlined and labelled by ID.
 * Sent to Muse Spark alongside the photo so it can refer to regions by ID, and
 * used by the CLI to eyeball grounding. Floor is a dashed outline only.
 */
export function regionOverlaySvg(regions: Region[], width: number, height: number): string {
  const font = Math.round(Math.max(width, height) / 70);
  const floor = regions
    .filter((r) => r.concept === "floor")
    .map(
      (r) =>
        `<path d="${r.svg_path}" transform="${maskTransform(r.mask, r.box)}" fill="none" stroke="#ffd400" stroke-width="2" vector-effect="non-scaling-stroke" stroke-dasharray="6 4"/>`,
    );
  const shapes = regions
    .filter((r) => r.concept !== "floor")
    .map((r) => {
      const c = conceptColour(r.concept);
      return `<path d="${r.svg_path}" transform="${maskTransform(r.mask, r.box)}" fill="${c}" fill-opacity="0.3" stroke="${c}" stroke-width="3" vector-effect="non-scaling-stroke"/>`;
    });
  const labels = regions.map((r) => {
    const x = Math.round(r.box.x1 + 4);
    const y = Math.round(Math.max(font + 2, r.concept === "floor" ? r.box.y2 - 8 : r.box.y1 + font + 2));
    return `<text x="${x}" y="${y}" font-family="Arial, sans-serif" font-weight="bold" font-size="${font}" fill="#fff" stroke="#000" stroke-width="${Math.max(2, font / 6)}" paint-order="stroke">${esc(`${r.id} ${r.concept}`)}</text>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${floor.join("")}${shapes.join("")}${labels.join("")}</svg>`;
}

/** Filled white masks on transparent, for compositing (e.g. person blur). */
export function maskSvg(regions: Region[], width: number, height: number, padPx = 0): string {
  const paths = regions.map(
    (r) =>
      `<path d="${r.svg_path}" transform="${maskTransform(r.mask, r.box)}" fill="#fff" stroke="#fff" stroke-width="${padPx * 2}" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>`,
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${paths.join("")}</svg>`;
}

/**
 * The findings layer as a standalone SVG (no photo): each finding's main region
 * filled in its priority colour plus numbered pins, as on the result page with
 * nothing hovered. Used to rasterise the annotated photo for the PDF report.
 */
export function findingsOverlaySvg(findings: Finding[], regions: Region[], width: number, height: number): string {
  const byId = new Map(regions.map((r) => [r.id, r]));
  const r = pinRadius(width, height);
  const shapes = [...findings]
    .filter((f) => f.region_ids.length > 0)
    .sort((a, b) => PRIORITY_ORDER[b.priority] - PRIORITY_ORDER[a.priority])
    .map((f) => {
      const main = primaryRegion(f, byId);
      if (!main) return "";
      const c = PRIORITY_STYLE[f.priority].colour;
      const fill = main.concept === "floor" ? "none" : c;
      return `<path d="${main.svg_path}" transform="${maskTransform(main.mask, main.box)}" fill="${fill}" fill-opacity="0.32" stroke="${c}" stroke-width="${Math.max(2, r / 6)}" vector-effect="non-scaling-stroke"/>`;
    });
  const pins = layoutPins(findings, regions, width, height).map((p) => {
    const f = findings.find((x) => x.id === p.findingId)!;
    return `<circle cx="${p.x}" cy="${p.y}" r="${r * 1.18}" fill="#fff" fill-opacity="0.95"/><circle cx="${p.x}" cy="${p.y}" r="${r}" fill="${PRIORITY_STYLE[f.priority].colour}"/><text x="${p.x}" y="${p.y}" text-anchor="middle" dominant-baseline="central" fill="#fff" font-size="${r * 1.1}" font-weight="700" font-family="Arial, sans-serif">${p.number}</text>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${shapes.join("")}${pins.join("")}</svg>`;
}
