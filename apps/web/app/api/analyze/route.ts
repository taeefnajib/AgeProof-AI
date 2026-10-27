import { APIError } from "openai";
import { analyzePhoto } from "@/lib/pipeline/analyze";
import { RoomTypeSchema } from "@/lib/schema/vocabulary";

export const maxDuration = 120;

const MAX_BYTES = 8 * 1024 * 1024;

/** User-safe error message with enough of a category to diagnose deploy issues. */
function describeError(e: unknown): string {
  const retry = "Please try again in a moment.";
  if (e instanceof APIError) {
    if (e.status === 401 || e.status === 403) return "The server's Meta API key was rejected (setup issue).";
    if (e.status === 404) return "A required Meta model isn't available to this API key (setup issue).";
    if (e.status === 429) return `The analysis service is busy. ${retry}`;
    return `The analysis service returned an error (${e.status ?? "network"}). ${retry}`;
  }
  const msg = e instanceof Error ? e.message : "";
  if (msg.includes("MODEL_API_KEY")) return "The server has no Meta API key configured (setup issue).";
  if (/timed? ?out/i.test(msg)) return `The analysis took too long. ${retry}`;
  return `The analysis failed. ${retry}`;
}

/**
 * POST multipart { photo: File, roomType?: RoomType | "auto" }.
 * Streams NDJSON: {type:"step",...} per finished pipeline step, then
 * {type:"result", analysis} or {type:"error", message}.
 * Nothing is persisted server-side; the browser keeps the result for the session.
 */
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const photo = form?.get("photo");
  if (!(photo instanceof File)) {
    return Response.json({ error: "Attach a photo in the 'photo' field." }, { status: 400 });
  }
  if (photo.size > MAX_BYTES) {
    return Response.json({ error: "Photo is larger than 8 MB." }, { status: 413 });
  }
  const roomTypeRaw = form?.get("roomType");
  const roomType = RoomTypeSchema.safeParse(roomTypeRaw);
  const input = Buffer.from(await photo.arrayBuffer());

  const encoder = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      try {
        const analysis = await analyzePhoto(input, {
          roomType: roomType.success ? roomType.data : undefined,
          onStep: (timing) => send({ type: "step", ...timing }),
        });
        send({ type: "result", analysis });
      } catch (e) {
        console.error("[analyze]", e);
        send({ type: "error", message: describeError(e) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(body, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
