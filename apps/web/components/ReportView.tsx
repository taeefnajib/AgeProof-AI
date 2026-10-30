"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useRef, useState } from "react";
import {
  buildReportPdf,
  downloadBlob,
  emailBody,
  reportDate,
  reportFileName,
} from "@/lib/client/reportPdf";
import { useStoredResult } from "@/lib/client/useStoredResult";
import { checklistFor } from "@/lib/checklist";
import { CATEGORY_LABEL, ROOM_NAMES } from "@/lib/labels";
import { priorityCounts, questionsFor } from "@/lib/pipeline/report";
import { PRIORITY_STYLE } from "@/lib/render/palette";
import type { PhotoAnalysis } from "@/lib/schema/analysis";
import { Disclaimer } from "./Disclaimer";
import { FindingsOverlay } from "./FindingsOverlay";

const noop = () => {};

/** The OT report: a one-page summary to download as a PDF or email to an occupational therapist. */
export function ReportView() {
  const { id } = useParams<{ id: string }>();
  const analysis = useStoredResult(id);

  if (analysis === undefined) return <p className="p-10 text-muted">Loading…</p>;
  if (analysis === null) {
    return (
      <div className="mx-auto max-w-xl px-6 py-20 text-center">
        <h1 className="font-display text-3xl">This report is no longer available</h1>
        <p className="mt-3 text-muted">
          Results are kept only in the browser tab that created them, and are cleared when it closes.
        </p>
        <Link href="/" className="mt-6 inline-block rounded-full bg-accent px-5 py-2.5 text-white">
          Screen a photo
        </Link>
      </div>
    );
  }
  return <Report analysis={analysis} />;
}

function Report({ analysis: a }: { analysis: PhotoAnalysis }) {
  const [busy, setBusy] = useState<"pdf" | "email" | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const pdf = useRef<Blob | null>(null);
  const name = reportFileName(a);

  const getPdf = async () => (pdf.current ??= await buildReportPdf(a));

  const download = async () => {
    setBusy("pdf");
    setNote(null);
    try {
      downloadBlob(await getPdf(), name);
    } catch (e) {
      setNote(`Couldn't create the PDF: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const email = async () => {
    setBusy("email");
    setNote(null);
    try {
      const blob = await getPdf();
      const subject = `Home-safety screening: ${ROOM_NAMES[a.room_type].toLowerCase()} (${reportDate(a)})`;
      const file = new File([blob], name, { type: "application/pdf" });
      // Where the device can share files (phones, Windows, macOS), the PDF goes straight into the mail app.
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: subject, text: emailBody(a) });
          return;
        } catch (e) {
          if ((e as Error).name === "AbortError") return;
        }
      }
      // Otherwise: save the PDF and open a pre-filled email to attach it to.
      downloadBlob(blob, name);
      window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(emailBody(a))}`;
      setNote(`The report was saved as ${name}. Attach it to the email that just opened.`);
    } catch (e) {
      setNote(`Couldn't prepare the email: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const questions = checklistFor(a.room_type);
  const otQuestions = questionsFor(a.findings);
  const counts = priorityCounts(a.findings);

  return (
    <div className="mx-auto max-w-4xl px-6 py-8 print:max-w-none print:px-0 print:py-0">
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link href={`/result/${a.id}`} className="text-sm text-muted hover:text-accent">
          ← Back to result
        </Link>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void download()}
            disabled={busy !== null}
            className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
          >
            {busy === "pdf" ? "Preparing PDF…" : "Download as PDF"}
          </button>
          <button
            type="button"
            onClick={() => void email()}
            disabled={busy !== null}
            className="rounded-full border border-line bg-card px-4 py-2 text-sm hover:border-accent disabled:opacity-60"
          >
            {busy === "email" ? "Preparing email…" : "Send as email"}
          </button>
        </div>
      </div>
      {note && (
        <p role="status" className="no-print mb-6 rounded-xl border border-line bg-accent-soft px-4 py-3 text-sm">
          {note}
        </p>
      )}

      <article className="rounded-2xl border border-line bg-card p-8 print:rounded-none print:border-0 print:p-0">
        <header className="border-b border-line pb-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-accent">AgeProof AI</p>
          <h1 className="mt-1 font-display text-3xl tracking-tight">
            Home-safety screening for an occupational therapist
          </h1>
          <p className="mt-2 text-sm text-muted">
            {ROOM_NAMES[a.room_type]} · photo screened {reportDate(a)} · {a.findings.length} possible{" "}
            {a.findings.length === 1 ? "hazard" : "hazards"} marked
          </p>
          {a.findings.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2 text-xs">
              {(["discuss_soon", "worth_checking", "minor"] as const)
                .filter((p) => counts[p] > 0)
                .map((p) => (
                  <li
                    key={p}
                    className="flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1"
                  >
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: PRIORITY_STYLE[p].colour }} />
                    {counts[p]} {PRIORITY_STYLE[p].label.toLowerCase()}
                  </li>
                ))}
            </ul>
          )}
          {/* Filled in by hand: nothing personal is collected by the app. */}
          <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm text-muted sm:grid-cols-2">
            {["Prepared for", "Visit date"].map((label) => (
              <div key={label} className="flex items-end gap-2">
                <dt className="shrink-0">{label}</dt>
                <dd className="h-5 flex-1 border-b border-dashed border-line" />
              </div>
            ))}
          </dl>
        </header>

        <Disclaimer className="mt-5" />

        {/* Cap the photo at ~560px tall so portrait shots don't fill the page. */}
        <div className="mx-auto mt-6 break-inside-avoid" style={{ maxWidth: (560 * a.width) / a.height }}>
          <FindingsOverlay
            src={a.image_data_url}
            width={a.width}
            height={a.height}
            findings={a.findings}
            regions={a.regions}
            activeId={null}
            onActive={noop}
            onSelect={noop}
          />
        </div>

        <h2 className="mt-8 font-display text-xl">Possible hazards seen in this photo</h2>
        {a.findings.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            No possible hazards were flagged from what is visible in this photo. That doesn&apos;t mean there are
            none: items not visible have not been checked.
          </p>
        ) : (
          <ol className="mt-3 divide-y divide-line">
            {a.findings.map((f, i) => {
              const style = PRIORITY_STYLE[f.priority];
              return (
                <li key={f.id} className="flex gap-3 py-3 break-inside-avoid">
                  <span
                    className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-bold text-white"
                    style={{ background: style.colour }}
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0 text-sm leading-relaxed">
                    <p className="font-medium text-ink">{f.title}</p>
                    <p className="text-xs" style={{ color: style.colour }}>
                      {style.label} · {CATEGORY_LABEL[f.category]} · {f.confidence} confidence ·{" "}
                      {f.region_ids.length ? "marked on photo" : "whole photo"}
                    </p>
                    <p className="mt-1">{f.explanation}</p>
                    <p className="mt-1 text-accent">
                      <span className="font-medium">To discuss: </span>
                      {f.suggestion}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        {otQuestions.length > 0 && (
          <section className="mt-8 break-inside-avoid">
            <h2 className="font-display text-xl">Questions to ask your OT</h2>
            <ol className="mt-3 space-y-2 text-sm">
              {otQuestions.map((q) => (
                <li key={q.number} className="flex gap-3">
                  <span className="w-6 shrink-0 text-right font-semibold text-muted">{q.number}.</span>
                  <span>
                    {q.question} <span className="text-muted">({q.title})</span>
                  </span>
                </li>
              ))}
            </ol>
          </section>
        )}

        <h2 className="mt-8 font-display text-xl">Also check in person</h2>
        <p className="mt-1 text-sm text-muted">
          A photo can&apos;t show these. They&apos;re good questions for an occupational therapist.
        </p>
        <ul className="mt-3 space-y-1.5 text-sm">
          {questions.map((q) => (
            <li key={q} className="flex items-start gap-2.5">
              <span className="mt-1 h-3.5 w-3.5 shrink-0 rounded-sm border border-muted" />
              {q}
            </li>
          ))}
        </ul>

        <section className="mt-8 break-inside-avoid">
          <h2 className="font-display text-xl">Notes from the visit</h2>
          <div className="mt-3 space-y-6" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="border-b border-dashed border-line" />
            ))}
          </div>
        </section>

        <p className="mt-8 text-xs leading-relaxed text-muted">
          How this was made: SAM 3.1 outlined objects in the photo, measured rules checked them, and Muse Spark
          wrote the explanations. Every marked finding points at an outlined region. People in the photo were
          blurred, and the photo was not stored.
        </p>
      </article>
    </div>
  );
}
