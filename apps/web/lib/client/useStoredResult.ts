"use client";

import { useSyncExternalStore } from "react";
import type { PhotoAnalysis } from "../schema/analysis";
import { loadResult } from "./resultStore";

const noopSubscribe = () => () => {};

// useSyncExternalStore needs a stable snapshot per id; parse sessionStorage once.
const snapshots = new Map<string, PhotoAnalysis | null>();
function loadResultCached(id: string): PhotoAnalysis | null {
  if (!snapshots.has(id)) snapshots.set(id, loadResult(id));
  return snapshots.get(id) ?? null;
}

/**
 * The stored analysis for `id`: undefined while rendering on the server,
 * null if this tab doesn't have it. sessionStorage is client-only, so this
 * reads it without a hydration mismatch.
 */
export function useStoredResult(id: string): PhotoAnalysis | null | undefined {
  return useSyncExternalStore(
    noopSubscribe,
    () => loadResultCached(id),
    () => undefined,
  );
}
