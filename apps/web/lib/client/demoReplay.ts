import type { PhotoAnalysis, StepTiming } from "../schema/analysis";

export type DemoName = "bathroom" | "bedroom" | "living";

/** Replays never take longer than this, however slow the original run was. */
const MAX_REPLAY_MS = 18_000;

/** True when the page was opened with ?demo=1 (CLAUDE.md §9). */
export function demoModeOn(): boolean {
  return typeof window !== "undefined" && new URLSearchParams(window.location.search).get("demo") === "1";
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Demo mode: replay a saved pipeline result (public/demo/<name>.json, built by
 * npm run demo:build) step by step with its recorded timings. No model calls.
 */
export async function replayDemo(name: DemoName, onStep: (t: StepTiming) => void): Promise<PhotoAnalysis> {
  const res = await fetch(`/demo/${name}.json`);
  if (!res.ok) throw new Error("The saved demo result is missing. Run npm run demo:build.");
  const saved = (await res.json()) as PhotoAnalysis;
  const total = saved.timings.reduce((s, t) => s + t.ms, 0);
  const scale = Math.min(1, MAX_REPLAY_MS / Math.max(1, total));
  for (const t of saved.timings) {
    await sleep(t.ms * scale);
    onStep(t);
  }
  return { ...saved, id: crypto.randomUUID(), demo: true, created_at: new Date().toISOString() };
}
