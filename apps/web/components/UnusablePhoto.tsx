"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { analyzeOnServer } from "@/lib/client/analyzeClient";
import { saveResult } from "@/lib/client/resultStore";
import type { PhotoAnalysis, PhotoCheck, StepTiming } from "@/lib/schema/analysis";
import { Disclaimer } from "./Disclaimer";
import { PipelineTimeline } from "./PipelineTimeline";

const COPY: Record<Exclude<PhotoCheck["quality"], "ok">, { title: string; body: string; tips: string[] }> = {
  too_dark: {
    title: "This photo is too dark to screen",
    body: "Hazards on the floor and around fixtures can't be seen clearly enough, so nothing was marked.",
    tips: [
      "Turn on the main light and any lamps, or open the curtains.",
      "Avoid pointing the camera at a bright window.",
      "Turn off the flash if it leaves the far side of the room dark.",
    ],
  },
  too_blurry: {
    title: "This photo is too blurry to screen",
    body: "Edges and small items like cords can't be made out, so nothing was marked.",
    tips: [
      "Hold the phone with both hands, or rest it on a door frame.",
      "Tap the screen to focus before taking the photo.",
      "Wipe the camera lens.",
    ],
  },
  not_a_room: {
    title: "This doesn't look like a room in a home",
    body: "AgeProof AI screens bathrooms, bedrooms, living rooms, kitchens, hallways and balconies.",
    tips: [
      "Stand in the doorway and take a wide shot of the whole room.",
      "Include the floor and the main fixtures (bed, toilet, shower, sofa).",
      "Avoid close-ups of a single object or person.",
    ],
  },
};

/**
 * Shown instead of findings when the photo can't be screened. CLAUDE.md §7:
 * say so and ask for a better photo rather than guessing.
 */
export function UnusablePhoto({ analysis, check }: { analysis: PhotoAnalysis; check: PhotoCheck }) {
  const router = useRouter();
  const copy = COPY[check.quality as keyof typeof COPY];
  const [timings, setTimings] = useState<StepTiming[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The user knows their home better than the model: let them overrule "not a room" (never dark/blurry).
  const screenAnyway = async () => {
    setRunning(true);
    setError(null);
    setTimings([]);
    try {
      const blob = await (await fetch(analysis.image_data_url)).blob();
      const next = await analyzeOnServer(blob, "auto", (t) => setTimings((prev) => [...prev, t]), {
        forceRoom: true,
      });
      saveResult(next);
      router.push(`/result/${next.id}`);
    } catch (e) {
      setError((e as Error).message);
      setRunning(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <p className="text-sm font-medium uppercase tracking-widest text-accent">Screening result</p>
      <h1 className="mt-1 font-display text-3xl tracking-tight sm:text-4xl">{copy.title}</h1>
      <p className="mt-3 max-w-2xl text-lg leading-relaxed text-muted">{copy.body}</p>

      <div className="mt-8 grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={analysis.image_data_url}
          alt="The photo that couldn't be screened"
          className="max-h-[420px] w-full rounded-2xl border border-line bg-card object-contain"
        />
        <div>
          <h2 className="font-display text-xl">For a better photo</h2>
          <ul className="mt-3 space-y-2.5">
            {copy.tips.map((t) => (
              <li key={t} className="flex gap-3 leading-snug">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" />
                {t}
              </li>
            ))}
          </ul>
          {check.source === "model" && check.detail && (
            <p className="mt-4 text-sm text-muted">What the model noticed: {check.detail}</p>
          )}
          {check.source === "measured" && (
            <p className="mt-4 text-sm text-muted">Measured on the photo: {check.detail}.</p>
          )}
          <div className="mt-6 flex flex-wrap gap-2">
            <Link href="/" className="rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-white hover:opacity-90">
              Try another photo
            </Link>
            {check.quality === "not_a_room" && (
              <button
                type="button"
                disabled={running}
                onClick={() => void screenAnyway()}
                className="rounded-full border border-line bg-card px-5 py-2.5 text-sm hover:border-accent disabled:opacity-60"
              >
                {running ? "Screening…" : "It's part of my home, screen it anyway"}
              </button>
            )}
          </div>
          {(running || timings.length > 0) && (
            <div className="mt-4 rounded-xl border border-line bg-card p-3">
              <PipelineTimeline timings={timings} running={running} />
            </div>
          )}
          {error && (
            <p role="alert" className="mt-4 rounded-xl border border-orange/40 bg-orange/10 px-4 py-3 text-sm">
              {error}
            </p>
          )}
        </div>
      </div>

      <Disclaimer className="mt-10" />
    </div>
  );
}
