"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState, useSyncExternalStore } from "react";
import { loadResult } from "@/lib/client/resultStore";
import { conceptColour } from "@/lib/render/palette";
import type { PhotoAnalysis } from "@/lib/schema/analysis";
import { Disclaimer } from "./Disclaimer";
import { PipelineTimeline } from "./PipelineTimeline";
import { RegionOverlay } from "./RegionOverlay";

const QUALITY_MESSAGES: Record<string, string> = {
  too_dark: "This photo looks too dark to screen. Please turn on the lights or open the curtains and try again.",
  too_blurry: "This photo looks blurry. Please hold the camera steady and try again.",
  not_a_room: "This doesn't look like a photo of a room. Please upload a photo of a bathroom, bedroom or living room.",
};

const noopSubscribe = () => () => {};

export function ResultView() {
  const { id } = useParams<{ id: string }>();
  // sessionStorage is client-only; read it without a hydration mismatch.
  const analysis = useSyncExternalStore(
    noopSubscribe,
    () => loadResultCached(id),
    () => undefined,
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const byConcept = useMemo(() => {
    const groups = new Map<string, PhotoAnalysis["regions"]>();
    for (const r of analysis?.regions ?? []) {
      groups.set(r.concept, [...(groups.get(r.concept) ?? []), r]);
    }
    return [...groups.entries()];
  }, [analysis]);

  if (analysis === undefined) return <p className="p-10 text-muted">Loading…</p>;
  if (analysis === null) {
    return (
      <div className="mx-auto max-w-xl px-6 py-20 text-center">
        <h1 className="font-display text-3xl">This result is no longer available</h1>
        <p className="mt-3 text-muted">
          Results are kept only in the browser tab that created them, and are cleared when it closes.
        </p>
        <Link href="/" className="mt-6 inline-block rounded-full bg-accent px-5 py-2.5 text-white">
          Screen a photo
        </Link>
      </div>
    );
  }

  const qualityMessage = QUALITY_MESSAGES[analysis.inventory.photo_quality];
  const visible = analysis.regions.filter((r) => !hidden.has(r.concept));
  const toggle = (concept: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(concept)) next.delete(concept);
      else next.add(concept);
      return next;
    });

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-widest text-accent">Screening result</p>
          <h1 className="font-display text-3xl capitalize tracking-tight">
            {analysis.room_type === "living" ? "Living room" : analysis.room_type}
            <span className="ml-3 align-middle text-base font-normal normal-case text-muted">
              {analysis.room_type_source === "user"
                ? "set by you"
                : `detected · ${analysis.inventory.room_type_confidence} confidence`}
            </span>
          </h1>
        </div>
        <Link href="/" className="no-print rounded-full border border-line bg-card px-4 py-2 text-sm hover:border-accent">
          Screen another photo
        </Link>
      </div>

      <div className="mt-5 rounded-xl border border-line bg-card p-4">
        <PipelineTimeline timings={analysis.timings} running={false} />
      </div>

      {qualityMessage && (
        <p role="alert" className="mt-5 rounded-xl border border-amber/50 bg-amber/10 px-4 py-3">
          {qualityMessage}
        </p>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <RegionOverlay
          src={analysis.image_data_url}
          width={analysis.width}
          height={analysis.height}
          regions={visible}
          activeId={activeId}
          onHover={setActiveId}
        />

        <aside className="space-y-4">
          <div className="rounded-xl border border-line bg-card p-4">
            <h2 className="font-display text-lg">Possible hazards</h2>
            {analysis.findings.length === 0 ? (
              <p className="mt-1 text-sm text-muted">
                No hazards were flagged from what is visible in this photo. Items not visible have not
                been checked.
              </p>
            ) : (
              <ol className="mt-3 space-y-3">
                {analysis.findings.map((f) => (
                  <li
                    key={f.id}
                    onMouseEnter={() => setActiveId(f.region_ids[0] ?? null)}
                    onMouseLeave={() => setActiveId(null)}
                    className="text-sm"
                  >
                    <p className="font-medium">
                      {f.id.slice(1)} · {f.title}
                    </p>
                    <p className="text-muted">{f.explanation}</p>
                    <p className="mt-1 text-xs text-muted">
                      {f.region_ids.join(", ") || "whole photo"} · {f.priority.replace("_", " ")} ·{" "}
                      {f.confidence} confidence
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div className="rounded-xl border border-line bg-card p-4">
            <h2 className="font-display text-lg">Detected objects</h2>
            <p className="mt-1 text-sm text-muted">
              Raw regions from SAM 3.1. Hover to highlight; click a label to hide it. Hazard findings
              are built on top of these.
            </p>
            <ul className="mt-3 space-y-1">
              {byConcept.map(([concept, regs]) => (
                <li key={concept}>
                  <button
                    type="button"
                    onClick={() => toggle(concept)}
                    className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-paper ${
                      hidden.has(concept) ? "opacity-40" : ""
                    }`}
                  >
                    <span className="h-3 w-3 rounded-sm" style={{ background: conceptColour(concept) }} />
                    <span className="flex-1 capitalize">{concept}</span>
                    <span className="flex gap-1">
                      {regs.map((r) => (
                        <span
                          key={r.id}
                          onMouseEnter={() => setActiveId(r.id)}
                          onMouseLeave={() => setActiveId(null)}
                          className={`rounded px-1.5 py-0.5 text-xs tabular-nums ${
                            activeId === r.id ? "bg-ink text-white" : "bg-paper text-muted"
                          }`}
                          title={`score ${r.score} · ${r.area_pct}% of photo`}
                        >
                          {r.id}
                        </span>
                      ))}
                    </span>
                  </button>
                </li>
              ))}
              {byConcept.length === 0 && <li className="text-sm text-muted">No objects detected.</li>}
            </ul>
          </div>

          <details className="rounded-xl border border-line bg-card p-4 text-sm">
            <summary className="cursor-pointer font-medium">Under the hood</summary>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-muted">
              <dt>Models</dt>
              <dd>{Object.values(analysis.models).join(", ")}</dd>
              <dt>Concepts tried</dt>
              <dd>
                {analysis.concept_runs.map((r) => `${r.concept} (${r.kept}/${r.instances})`).join(", ")}
              </dd>
              <dt>Brightness</dt>
              <dd>
                mean {analysis.luminance.mean}/255 · {analysis.luminance.dark_pct}% dark pixels
              </dd>
              <dt>Cost</dt>
              <dd>${analysis.cost_usd.toFixed(4)}</dd>
              <dt>Rules</dt>
              <dd>
                {analysis.candidates.map((c) => `${c.rule_id}: ${c.measurement}`).join("; ") || "none fired"}
              </dd>
              <dt>Grounding</dt>
              <dd>
                {analysis.validation
                  ? `${analysis.validation.proposed} proposed by Muse Spark · ${analysis.validation.dropped_ungrounded} dropped (cited unknown regions) · ${analysis.validation.rejected.length} rule candidates rejected · ${analysis.validation.restored} restored`
                  : "explain step unavailable; showing rule wording"}
              </dd>
              {analysis.people_blurred > 0 && (
                <>
                  <dt>Privacy</dt>
                  <dd>{analysis.people_blurred} person region(s) blurred</dd>
                </>
              )}
              <dt>Prompts</dt>
              <dd>{Object.values(analysis.prompt_versions).join(", ")}</dd>
            </dl>
            {analysis.inventory.notes && <p className="mt-2 italic text-muted">{analysis.inventory.notes}</p>}
          </details>
        </aside>
      </div>

      <Disclaimer className="mt-8" />
    </div>
  );
}

// useSyncExternalStore needs a stable snapshot per id; parse sessionStorage once.
const snapshots = new Map<string, PhotoAnalysis | null>();
function loadResultCached(id: string): PhotoAnalysis | null {
  if (!snapshots.has(id)) snapshots.set(id, loadResult(id));
  return snapshots.get(id) ?? null;
}
