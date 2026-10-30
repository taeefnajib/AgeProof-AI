"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useStoredResult } from "@/lib/client/useStoredResult";
import { ROOM_NAMES } from "@/lib/labels";
import { conceptColour, PRIORITY_STYLE } from "@/lib/render/palette";
import type { PhotoAnalysis, PhotoCheck } from "@/lib/schema/analysis";
import { isUsable, photoLabel } from "@/lib/schema/screening";
import { Disclaimer } from "./Disclaimer";
import { FindingList } from "./FindingList";
import { FindingsOverlay } from "./FindingsOverlay";
import { PipelineTimeline } from "./PipelineTimeline";
import { RegionOverlay } from "./RegionOverlay";
import { RoomChecklist } from "./RoomChecklist";
import { UnusablePhoto } from "./UnusablePhoto";

/** Results saved before photo_check existed fall back to the inventory's verdict. */
function checkOf(p: PhotoAnalysis): PhotoCheck {
  return (
    p.photo_check ?? {
      quality: p.inventory.is_room_photo ? p.inventory.photo_quality : "not_a_room",
      source: "model",
      detail: p.inventory.notes,
    }
  );
}

export function ResultView() {
  const { id } = useParams<{ id: string }>();
  const screening = useStoredResult(id);
  const [photoIdx, setPhotoIdx] = useState(0);
  const [activeFinding, setActiveFinding] = useState<string | null>(null);
  const [selectedFinding, setSelectedFinding] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [activeRegion, setActiveRegion] = useState<string | null>(null);
  const [hiddenConcepts, setHiddenConcepts] = useState<Set<string>>(new Set());

  const byConcept = useMemo(() => {
    const groups = new Map<string, PhotoAnalysis["regions"]>();
    for (const r of screening?.photos[photoIdx]?.regions ?? []) {
      groups.set(r.concept, [...(groups.get(r.concept) ?? []), r]);
    }
    return [...groups.entries()];
  }, [screening, photoIdx]);

  if (screening === undefined) return <p className="p-10 text-muted">Loading…</p>;
  if (screening === null) {
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

  const photos = screening.photos;
  const multi = photos.length > 1;
  const analysis = photos[Math.min(photoIdx, photos.length - 1)];
  const check = checkOf(analysis);
  if (!multi && check.quality !== "ok") return <UnusablePhoto screening={screening} index={0} check={check} />;
  const usable = check.quality === "ok";
  const showPhoto = (i: number) => {
    setPhotoIdx(i);
    setActiveFinding(null);
    setSelectedFinding(null);
    setActiveRegion(null);
    setHiddenConcepts(new Set());
  };
  const totalCost = photos.reduce((s, p) => s + p.cost_usd, 0);
  const totalFindings = photos.reduce((s, p) => s + (isUsable(p) ? p.findings.length : 0), 0);
  const counts = (["discuss_soon", "worth_checking", "minor"] as const).map((p) => ({
    p,
    n: analysis.findings.filter((f) => f.priority === p).length,
  }));
  const select = (fid: string | null) => {
    setSelectedFinding(fid);
    if (fid) setShowRaw(false);
  };
  const toggleConcept = (concept: string) =>
    setHiddenConcepts((prev) => {
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
          <h1 className="font-display text-3xl tracking-tight sm:text-4xl">
            {ROOM_NAMES[screening.room_type]}
            <span className="ml-3 align-middle text-base font-normal text-muted">
              {screening.room_type_source === "user"
                ? "set by you"
                : multi
                  ? `detected from ${photos.length} photos · ${totalFindings} possible hazards`
                  : `detected · ${analysis.inventory.room_type_confidence} confidence`}
            </span>
          </h1>
        </div>
        <div className="no-print flex flex-wrap gap-2">
          <Link
            href="/"
            className="rounded-full border border-line bg-card px-4 py-2 text-sm hover:border-accent"
          >
            Screen another room
          </Link>
          <Link
            href={`/report/${screening.id}`}
            className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Generate OT report
          </Link>
        </div>
      </div>

      {multi && (
        <div className="no-print mt-5 flex flex-wrap gap-3" role="tablist" aria-label="Photos of this room">
          {photos.map((p, i) => {
            const ok = isUsable(p);
            const selected = i === photoIdx;
            return (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => showPhoto(i)}
                className={`flex items-center gap-3 rounded-xl border bg-card p-1.5 pr-4 text-left text-sm transition ${
                  selected ? "border-accent ring-2 ring-accent/30" : "border-line hover:border-accent/60"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.image_data_url} alt="" className="h-12 w-16 rounded-lg object-cover" />
                <span>
                  <span className="block font-medium">Photo {photoLabel(i)}</span>
                  <span className={`text-xs ${ok ? "text-muted" : "text-orange"}`}>
                    {ok
                      ? `${p.findings.length} possible ${p.findings.length === 1 ? "hazard" : "hazards"}`
                      : "couldn't be screened"}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-5 rounded-xl border border-line bg-card p-4">
        {multi && <p className="mb-2 text-xs font-medium text-muted">Photo {photoLabel(photoIdx)}</p>}
        <PipelineTimeline
          timings={analysis.timings}
          running={false}
          costUsd={screening.demo ? undefined : analysis.cost_usd}
        />
        {multi && !screening.demo && (
          <p className="mt-2 text-xs text-muted">
            All {photos.length} photos: ${totalCost.toFixed(3)}, analysed two at a time.
          </p>
        )}
      </div>

      {screening.demo && (
        <p className="mt-5 rounded-xl border border-line bg-accent-soft px-4 py-3 text-sm">
          Demo mode: this is a saved result for a sample room, replayed with its original step timings. No photo
          was sent anywhere.
        </p>
      )}
      {check.source === "user" && (
        <p className="mt-5 rounded-xl border border-amber/50 bg-amber/10 px-4 py-3 text-sm">
          The model wasn&apos;t sure this is a room in a home, so it was screened at your request. Findings may be
          less reliable.
        </p>
      )}

      {!usable && (
        <div className="mt-6 space-y-6">
          <UnusablePhoto screening={screening} index={photoIdx} check={check} variant="inline" />
          <section className="rounded-2xl border border-line bg-card p-5">
            <h2 className="font-display text-xl">Also check in person</h2>
            <p className="mb-3 mt-1 text-sm text-muted">
              A photo can&apos;t show these. They&apos;re good questions for an occupational therapist.
            </p>
            <RoomChecklist roomType={screening.room_type} />
          </section>
        </div>
      )}

      {usable && (
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-3 lg:sticky lg:top-6 lg:self-start">
            {/* Portrait photos: cap the height to the viewport so the list stays in view. */}
            <div className="mx-auto" style={{ maxWidth: `calc(78vh * ${analysis.width / analysis.height})` }}>
              {showRaw ? (
                <RegionOverlay
                  src={analysis.image_data_url}
                  width={analysis.width}
                  height={analysis.height}
                  regions={analysis.regions.filter((r) => !hiddenConcepts.has(r.concept))}
                  activeId={activeRegion}
                  onHover={setActiveRegion}
                />
              ) : (
                <FindingsOverlay
                  src={analysis.image_data_url}
                  width={analysis.width}
                  height={analysis.height}
                  findings={analysis.findings}
                  regions={analysis.regions}
                  activeId={activeFinding ?? selectedFinding}
                  onActive={setActiveFinding}
                  onSelect={select}
                />
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <button
                type="button"
                role="switch"
                aria-checked={showRaw}
                onClick={() => setShowRaw((v) => !v)}
                className="no-print flex items-center gap-2 text-left"
              >
                <span
                  className={`relative inline-block h-5 w-9 shrink-0 rounded-full transition-colors ${
                    showRaw ? "bg-accent" : "bg-line"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
                      showRaw ? "left-[18px]" : "left-0.5"
                    }`}
                  />
                </span>
                <span>
                  Show all detected objects{" "}
                  <span className="text-muted">({analysis.regions.length} regions from SAM 3.1)</span>
                </span>
              </button>
              {!showRaw && (
                <span className="flex flex-wrap gap-3 text-xs text-muted">
                  {counts
                    .filter((c) => c.n > 0)
                    .map((c) => (
                      <span key={c.p} className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: PRIORITY_STYLE[c.p].colour }} />
                        {c.n} {PRIORITY_STYLE[c.p].label.toLowerCase()}
                      </span>
                    ))}
                </span>
              )}
            </div>

            {showRaw && (
              <ul className="flex flex-wrap gap-2 text-sm">
                {byConcept.map(([concept, regs]) => (
                  <li key={concept}>
                    <button
                      type="button"
                      onClick={() => toggleConcept(concept)}
                      onMouseEnter={() => setActiveRegion(regs[0].id)}
                      onMouseLeave={() => setActiveRegion(null)}
                      className={`flex items-center gap-2 rounded-full border border-line bg-card px-3 py-1 ${
                        hiddenConcepts.has(concept) ? "opacity-40" : ""
                      }`}
                      title={regs.map((r) => `${r.id} score ${r.score} · ${r.area_pct}%`).join("\n")}
                    >
                      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: conceptColour(concept) }} />
                      {concept}
                      <span className="text-xs text-muted">{regs.map((r) => r.id).join(" ")}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <aside className="space-y-5">
            <section className="rounded-2xl border border-line bg-card p-5">
              <h2 className="font-display text-xl">
                Possible hazards{multi ? ` in photo ${photoLabel(photoIdx)}` : ""}
              </h2>
              <p className="mb-2 mt-1 text-sm text-muted">
                Seen in this photo. Hover or tap a number to find it on the photo.
                {multi ? " Something visible in two photos may be listed in both." : ""}
              </p>
              <FindingList
                findings={analysis.findings}
                activeId={activeFinding}
                selectedId={selectedFinding}
                onActive={setActiveFinding}
                onSelect={select}
              />
            </section>

            <section className="rounded-2xl border border-line bg-card p-5">
              <h2 className="font-display text-xl">Also check in person</h2>
              <p className="mb-3 mt-1 text-sm text-muted">
                A photo can&apos;t show these. They&apos;re good questions for an occupational therapist.
              </p>
              <RoomChecklist roomType={screening.room_type} />
            </section>

            <details className="rounded-2xl border border-line bg-card p-5 text-sm">
              <summary className="cursor-pointer font-medium">Under the hood</summary>
              <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-muted">
                <dt>Models</dt>
                <dd>{Object.values(analysis.models).join(", ")}</dd>
                <dt>Concepts</dt>
                <dd>{analysis.concept_runs.map((r) => `${r.concept} (${r.kept}/${r.instances})`).join(", ")}</dd>
                <dt>Rules</dt>
                <dd>
                  {analysis.candidates.map((c) => `${c.rule_id}: ${c.measurement}`).join("; ") || "none fired"}
                </dd>
                <dt>Grounding</dt>
                <dd>
                  {analysis.validation
                    ? `${analysis.validation.proposed} proposed by Muse Spark · ${analysis.validation.dropped_ungrounded} dropped for citing unknown regions · ${analysis.validation.restored} restored`
                    : "explain step unavailable; showing rule wording"}
                </dd>
                {analysis.validation?.rejected.map((r) => (
                  <div key={`${r.rule_id}-${r.region_ids.join()}`} className="contents">
                    <dt>Rejected</dt>
                    <dd>
                      {r.rule_id} ({r.region_ids.join(", ")}): {r.reason}
                    </dd>
                  </div>
                ))}
                {analysis.people_blurred > 0 && (
                  <>
                    <dt>Privacy</dt>
                    <dd>{analysis.people_blurred} person region(s) blurred</dd>
                  </>
                )}
                <dt>Brightness</dt>
                <dd>
                  mean {analysis.luminance.mean}/255 · {analysis.luminance.dark_pct}% dark pixels
                </dd>
                <dt>Cost</dt>
                <dd>${analysis.cost_usd.toFixed(4)}</dd>
                <dt>Prompts</dt>
                <dd>{Object.values(analysis.prompt_versions).join(", ")}</dd>
              </dl>
            </details>
          </aside>
        </div>
      )}

      <Disclaimer className="mt-8" />
    </div>
  );
}
