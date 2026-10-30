"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { analyzeOnServer } from "@/lib/client/analyzeClient";
import { downscaleImage } from "@/lib/client/resize";
import { saveResult } from "@/lib/client/resultStore";
import type { StepTiming } from "@/lib/schema/analysis";
import { ROOM_TYPES, type RoomType } from "@/lib/schema/vocabulary";
import { PipelineTimeline } from "./PipelineTimeline";

const SAMPLES = [
  { name: "Bathroom", src: "/samples/bathroom.jpg" },
  { name: "Bedroom", src: "/samples/bedroom.jpg" },
  { name: "Living room", src: "/samples/living.jpg" },
];

const ROOM_LABELS: Record<RoomType, string> = {
  bathroom: "Bathroom",
  bedroom: "Bedroom",
  living: "Living room",
  kitchen: "Kitchen",
  hallway: "Hallway",
  outdoor: "Balcony or patio",
  other: "Other",
};

export function UploadForm() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [roomType, setRoomType] = useState<RoomType | "auto">("auto");
  const [preview, setPreview] = useState<string | null>(null);
  const [timings, setTimings] = useState<StepTiming[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  // Next keeps this page's state alive (hidden) while the result page is shown, so
  // coming back would still show the last photo mid-analysis. Reset when it's hidden.
  useEffect(() => {
    const input = inputRef.current;
    return () => {
      setPreview((url) => {
        if (url) URL.revokeObjectURL(url);
        return null;
      });
      setTimings([]);
      setRunning(false);
      setError(null);
      setDragging(false);
      if (input) input.value = "";
    };
  }, []);

  const run = useCallback(
    async (blob: Blob) => {
      setError(null);
      setTimings([]);
      setRunning(true);
      try {
        const small = await downscaleImage(blob);
        setPreview(URL.createObjectURL(small));
        const analysis = await analyzeOnServer(small, roomType, (t) =>
          setTimings((prev) => [...prev, t]),
        );
        saveResult(analysis);
        router.push(`/result/${analysis.id}`);
      } catch (e) {
        setError((e as Error).message);
        setRunning(false);
      }
    },
    [roomType, router],
  );

  const onFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    // Some browsers give HEIC files an empty type; let downscaleImage try them.
    if (file.type && !file.type.startsWith("image/")) {
      setError("Please choose a photo (JPEG, PNG or HEIC exported as JPEG).");
      return;
    }
    void run(file);
  };

  const runSample = async (src: string) => {
    const blob = await (await fetch(src)).blob();
    void run(blob);
  };

  return (
    <div className="space-y-6">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!running) onFiles(e.dataTransfer.files);
        }}
        className={`relative overflow-hidden rounded-2xl border-2 border-dashed transition ${
          dragging ? "border-accent bg-accent-soft" : "border-line bg-card"
        }`}
      >
        {preview && running ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Photo being analysed" className="max-h-96 w-full object-contain opacity-80" />
        ) : (
          <button
            type="button"
            disabled={running}
            onClick={() => inputRef.current?.click()}
            className="flex w-full flex-col items-center gap-3 px-6 py-16 text-center"
          >
            <span className="grid h-14 w-14 place-items-center rounded-full bg-accent-soft text-2xl text-accent">
              ↑
            </span>
            <span className="font-display text-2xl">Add a photo of the room</span>
            <span className="max-w-md text-muted">
              Drop a photo here or click to choose one. A wide shot from the doorway works best.
            </span>
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => onFiles(e.target.files)}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <label className="flex items-center gap-3 text-sm">
          <span className="text-muted">Room type</span>
          <select
            value={roomType}
            disabled={running}
            onChange={(e) => setRoomType(e.target.value as RoomType | "auto")}
            className="rounded-lg border border-line bg-card px-3 py-2"
          >
            <option value="auto">Detect automatically</option>
            {ROOM_TYPES.map((t) => (
              <option key={t} value={t}>
                {ROOM_LABELS[t]}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">Or try a sample room:</span>
          {SAMPLES.map((s) => (
            <button
              key={s.src}
              type="button"
              disabled={running}
              onClick={() => void runSample(s.src)}
              className="rounded-full border border-line bg-card px-3 py-1.5 hover:border-accent hover:text-accent disabled:opacity-50"
            >
              {s.name}
            </button>
          ))}
        </div>
      </div>

      {(running || timings.length > 0) && (
        <div className="rounded-xl border border-line bg-card p-4">
          <PipelineTimeline timings={timings} running={running} />
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-xl border border-orange/40 bg-orange/10 px-4 py-3 text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
