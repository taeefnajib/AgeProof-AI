import type { PhotoAnalysis } from "../schema/analysis";

/**
 * Results live only in this browser tab's sessionStorage: nothing about the
 * photo is persisted server-side, and it's gone when the tab closes.
 */
const KEY = (id: string) => `ageproof:result:${id}`;

export function saveResult(a: PhotoAnalysis): void {
  try {
    sessionStorage.setItem(KEY(a.id), JSON.stringify(a));
  } catch {
    // Quota exceeded: drop older results and retry once.
    for (const k of Object.keys(sessionStorage)) {
      if (k.startsWith("ageproof:result:")) sessionStorage.removeItem(k);
    }
    sessionStorage.setItem(KEY(a.id), JSON.stringify(a));
  }
}

export function loadResult(id: string): PhotoAnalysis | null {
  try {
    const raw = sessionStorage.getItem(KEY(id));
    return raw ? (JSON.parse(raw) as PhotoAnalysis) : null;
  } catch {
    return null;
  }
}
