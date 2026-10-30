import type { jsPDF as JsPDF } from "jspdf";
import { DISCLAIMER } from "@/components/Disclaimer";
import { checklistFor } from "../checklist";
import { findingsOverlaySvg } from "../render/overlay";
import { PRIORITY_STYLE } from "../render/palette";
import { findingGroups, priorityCounts, questionsFor, reportPhotos } from "../pipeline/report";
import type { PhotoAnalysis } from "../schema/analysis";
import type { Screening } from "../schema/screening";
import { ROOM_NAMES, CATEGORY_LABEL } from "../labels";

/**
 * Builds the OT report as a real PDF file in the browser (jsPDF), so it can be
 * downloaded or attached to an email. Nothing leaves the device.
 */

const A4 = { w: 210, h: 297 };
const M = 16; // page margin, mm
const INK: [number, number, number] = [29, 42, 44];
const MUTED: [number, number, number] = [93, 107, 109];
const ACCENT: [number, number, number] = [47, 111, 104];

/** The built-in PDF fonts only cover Latin-1-ish text; swap the few characters we use that they don't. */
function clean(s: string): string {
  return s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/→/g, "->")
    .replace(/×/g, "x")
    .replace(/[^\x09\x0a\x0d\x20-\x7e -ÿ]/g, "");
}

function hex(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not draw the annotated photo."));
    img.src = src;
  });
}

/** The (already blurred) photo with the findings layer drawn on top, as a JPEG data URL. */
export async function annotatedPhotoJpeg(a: PhotoAnalysis): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = a.width;
  canvas.height = a.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(await loadImage(a.image_data_url), 0, 0, a.width, a.height);
  const svg = findingsOverlaySvg(a.findings, a.regions, a.width, a.height);
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    ctx.drawImage(await loadImage(url), 0, 0, a.width, a.height);
  } finally {
    URL.revokeObjectURL(url);
  }
  return canvas.toDataURL("image/jpeg", 0.85);
}

export function reportFileName(s: Screening): string {
  const date = s.created_at.slice(0, 10);
  return `ageproof-${s.room_type}-screening-${date}.pdf`;
}

export function reportDate(s: Screening): string {
  return new Date(s.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
}

const UNUSABLE_TEXT: Record<string, string> = {
  too_dark: "This photo was too dark to screen",
  too_blurry: "This photo was too blurry to screen",
  not_a_room: "This photo didn't look like a room in a home",
};

/**
 * `annotate`: draws a photo with its findings layer as a JPEG data URL
 * (defaults to the browser canvas; scripts pass a sharp-based one).
 */
export async function buildReportPdf(
  s: Screening,
  annotate: (a: PhotoAnalysis) => Promise<string> = annotatedPhotoJpeg,
): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc: JsPDF = new jsPDF({ unit: "mm", format: "a4" });
  const width = A4.w - 2 * M;
  let y = M;

  const ensure = (needed: number) => {
    if (y + needed > A4.h - M - 8) {
      doc.addPage();
      y = M;
    }
  };
  const text = (
    s: string,
    opts: { size?: number; style?: "normal" | "bold" | "italic"; colour?: [number, number, number]; x?: number; w?: number; gap?: number } = {},
  ) => {
    const size = opts.size ?? 10;
    const x = opts.x ?? M;
    doc.setFont("helvetica", opts.style ?? "normal");
    doc.setFontSize(size);
    doc.setTextColor(...(opts.colour ?? INK));
    const lines = doc.splitTextToSize(clean(s), opts.w ?? width - (x - M)) as string[];
    const lh = size * 0.42;
    for (const line of lines) {
      ensure(lh);
      doc.text(line, x, y + lh * 0.8);
      y += lh;
    }
    y += opts.gap ?? 0;
  };

  const photos = reportPhotos(s);
  const groups = findingGroups(s);
  const all = groups.flat();
  const multi = photos.length > 1;

  // Header
  text("AgeProof AI", { size: 9, style: "bold", colour: ACCENT, gap: 1 });
  text("Home-safety screening for an occupational therapist", { size: 17, style: "bold", gap: 1.5 });
  text(
    `${ROOM_NAMES[s.room_type]} · ${photos.length} ${photos.length === 1 ? "photo" : "photos"} screened ${reportDate(s)} · ${all.length} possible ${
      all.length === 1 ? "hazard" : "hazards"
    } marked`,
    { size: 9.5, colour: MUTED, gap: 2 },
  );
  // Priority summary chips
  const counts = priorityCounts(all);
  let cx = M;
  doc.setFont("helvetica", "normal").setFontSize(8.5);
  for (const p of ["discuss_soon", "worth_checking", "minor"] as const) {
    if (!counts[p]) continue;
    const label = `${counts[p]} ${PRIORITY_STYLE[p].label.toLowerCase()}`;
    const w = doc.getTextWidth(label) + 8;
    doc.setDrawColor(230, 225, 216).roundedRect(cx, y, w, 5.5, 2.75, 2.75, "S");
    doc.setFillColor(...hex(PRIORITY_STYLE[p].colour)).circle(cx + 2.8, y + 2.75, 1.2, "F");
    doc.setTextColor(...INK).text(label, cx + 5, y + 3.8);
    cx += w + 2;
  }
  if (cx > M) y += 8;
  // Filled in by hand: nothing personal is collected by the app.
  doc.setFontSize(9).setTextColor(...MUTED);
  doc.text("Prepared for", M, y + 3);
  doc.text("Visit date", M + width / 2 + 4, y + 3);
  doc.setLineDashPattern([0.8, 0.8], 0).setDrawColor(...MUTED);
  doc.line(M + 21, y + 3.5, M + width / 2 - 2, y + 3.5);
  doc.line(M + width / 2 + 21, y + 3.5, M + width, y + 3.5);
  doc.setLineDashPattern([], 0);
  y += 8;
  doc.setDrawColor(230, 225, 216);
  doc.setFillColor(250, 248, 244);
  const discLines = doc.setFontSize(8.5).splitTextToSize(clean(DISCLAIMER), width - 8) as string[];
  const discH = discLines.length * 3.6 + 5;
  doc.roundedRect(M, y, width, discH, 2, 2, "FD");
  y += 2.5;
  text(DISCLAIMER, { size: 8.5, style: "italic", colour: MUTED, x: M + 4, w: width - 8, gap: 5 });

  // Each photo: annotated image, then its findings
  for (const { letter, photo: a, usable } of photos) {
    if (multi) {
      ensure(20);
      text(`Photo ${letter}`, { size: 14, style: "bold", gap: 2 });
    }
    if (!usable) {
      text(`${UNUSABLE_TEXT[a.photo_check?.quality ?? ""] ?? "This photo couldn't be screened"}, so nothing in it has been checked.`, {
        size: 10,
        colour: MUTED,
        gap: 6,
      });
      continue;
    }
    const maxH = multi ? 90 : 115;
    let pw = width;
    let ph = (a.height / a.width) * pw;
    if (ph > maxH) {
      ph = maxH;
      pw = (a.width / a.height) * ph;
    }
    ensure(ph + 4);
    doc.addImage(await annotate(a), "JPEG", M + (width - pw) / 2, y, pw, ph);
    y += ph + 6;

    text("Possible hazards seen in this photo", { size: multi ? 11.5 : 13, style: "bold", gap: 2 });
    if (a.findings.length === 0) {
      text(
        "No possible hazards were flagged from what is visible in this photo. That doesn't mean there are none: items not visible have not been checked.",
        { size: 10, colour: MUTED, gap: 4 },
      );
    }
    a.findings.forEach((f, i) => {
      ensure(22);
      const style = PRIORITY_STYLE[f.priority];
      const r = letter ? 3.8 : 3.2;
      doc.setFillColor(...hex(style.colour));
      doc.circle(M + r, y + 3, r, "F");
      doc.setFont("helvetica", "bold").setFontSize(letter ? 8 : 9).setTextColor(255, 255, 255);
      doc.text(`${letter}${i + 1}`, M + r, y + 3, { align: "center", baseline: "middle" });
      const x = M + 10;
      text(f.title, { size: 11, style: "bold", x, gap: 0.6 });
      text(
        `${style.label} · ${CATEGORY_LABEL[f.category]} · ${f.confidence} confidence · ${
          f.region_ids.length ? "marked on photo" : "whole photo"
        }`,
        { size: 8.5, colour: hex(style.colour), x, gap: 1.2 },
      );
      text(f.explanation, { size: 9.5, x, gap: 1 });
      text(`To discuss: ${f.suggestion}`, { size: 9.5, colour: ACCENT, x, gap: 4 });
    });
    y += 2;
  }
  if (multi && all.length > 0) {
    text("Each photo was screened on its own, so something visible in two photos may be listed twice.", {
      size: 8.5,
      colour: MUTED,
      gap: 2,
    });
  }

  // Questions for the OT, one per finding
  const otQuestions = questionsFor(groups);
  if (otQuestions.length) {
    ensure(20);
    y += 2;
    text("Questions to ask your OT", { size: 13, style: "bold", gap: 2 });
    for (const q of otQuestions) {
      ensure(8);
      text(`${q.label}.`, { size: 9.5, style: "bold", colour: MUTED, gap: 0 });
      y -= 9.5 * 0.42;
      text(`${q.question} (${q.title})`, { size: 9.5, x: M + 8, gap: 1.4 });
    }
  }

  // Questions a photo can't answer
  ensure(20);
  y += 2;
  text("Also check in person", { size: 13, style: "bold", gap: 1 });
  text("A photo can't show these. They are good questions for an occupational therapist.", {
    size: 9.5,
    colour: MUTED,
    gap: 2,
  });
  for (const q of checklistFor(s.room_type)) {
    ensure(6);
    doc.setDrawColor(...MUTED);
    doc.rect(M + 0.5, y + 0.8, 3, 3);
    text(q, { size: 9.5, x: M + 6, gap: 1.2 });
  }

  // Space for handwritten notes
  ensure(36);
  y += 3;
  text("Notes from the visit", { size: 13, style: "bold", gap: 3 });
  doc.setLineDashPattern([0.8, 0.8], 0).setDrawColor(...MUTED);
  for (let i = 0; i < 4; i++) {
    y += 7;
    doc.line(M, y, M + width, y);
  }
  doc.setLineDashPattern([], 0);
  y += 6;

  // How it was made, then footers
  text(
    "How this was made: SAM 3.1 outlined objects in each photo, measured rules checked them, and Muse Spark wrote the explanations. Every marked finding points at an outlined region. People in the photos were blurred, and the photos were not stored.",
    { size: 8, colour: MUTED },
  );
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(...MUTED);
    doc.text("AgeProof AI · a screening aid, not an assessment", M, A4.h - 8);
    doc.text(`Page ${p} of ${pages}`, A4.w - M, A4.h - 8, { align: "right" });
  }
  return doc.output("blob");
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Plain-text summary for an email body (mailto bodies must stay short). */
export function emailBody(s: Screening): string {
  const photos = reportPhotos(s);
  const items = photos.flatMap(({ letter, photo, usable }) =>
    usable
      ? photo.findings.map(
          (f, i) => `${letter}${i + 1}. ${f.title} (${PRIORITY_STYLE[f.priority].label.toLowerCase()})`,
        )
      : [],
  );
  const what = photos.length === 1 ? "a photo" : `${photos.length} photos`;
  const lines = [
    `Hello,`,
    ``,
    `I used AgeProof AI to screen ${what} of my ${ROOM_NAMES[s.room_type].toLowerCase()} (${reportDate(s)}) before a home visit. The full report is attached as a PDF.`,
    ``,
    `Possible hazards marked in the ${photos.length === 1 ? "photo" : "photos"}:`,
    ...(items.length ? items : ["None flagged from what is visible."]),
    ``,
    DISCLAIMER,
  ];
  const body = lines.join("\n");
  return body.length > 1800 ? `${body.slice(0, 1790)}...` : body;
}
