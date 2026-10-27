import { analyzePhoto } from "@/lib/pipeline/analyze";
import { RoomTypeSchema } from "@/lib/schema/vocabulary";

export const maxDuration = 120;

const MAX_BYTES = 8 * 1024 * 1024;

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
        send({ type: "error", message: "The analysis failed. Please try again in a moment." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(body, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
