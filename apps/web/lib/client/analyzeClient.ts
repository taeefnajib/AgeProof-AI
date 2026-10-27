import type { PhotoAnalysis, StepTiming } from "../schema/analysis";
import type { RoomType } from "../schema/vocabulary";

type StreamEvent =
  | ({ type: "step" } & StepTiming)
  | { type: "result"; analysis: PhotoAnalysis }
  | { type: "error"; message: string };

/** POST the photo and read the NDJSON progress stream from /api/analyze. */
export async function analyzeOnServer(
  photo: Blob,
  roomType: RoomType | "auto",
  onStep: (timing: StepTiming) => void,
): Promise<PhotoAnalysis> {
  const form = new FormData();
  form.append("photo", photo, "photo.jpg");
  form.append("roomType", roomType);
  const res = await fetch("/api/analyze", { method: "POST", body: form });
  if (!res.ok || !res.body) {
    const err = await res.json().catch(() => ({ error: `Request failed (${res.status})` }));
    throw new Error(err.error ?? `Request failed (${res.status})`);
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (value) buffer += value;
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      const event = JSON.parse(line) as StreamEvent;
      if (event.type === "step") onStep(event);
      else if (event.type === "result") return event.analysis;
      else if (event.type === "error") throw new Error(event.message);
    }
    if (done) break;
  }
  throw new Error("The analysis ended without a result.");
}
