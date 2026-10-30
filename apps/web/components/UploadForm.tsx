"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { analyzeOnServer } from "@/lib/client/analyzeClient";
import { demoModeOn, replayDemo, type DemoName } from "@/lib/client/demoReplay";
import { downscaleImage } from "@/lib/client/resize";
import { saveResult } from "@/lib/client/resultStore";
import { ROOM_NAMES } from "@/lib/labels";
import type { PhotoAnalysis, StepTiming } from "@/lib/schema/analysis";
import { makeScreening, MAX_PHOTOS, photoLabel } from "@/lib/schema/screening";
import { ROOM_TYPES, type RoomType } from "@/lib/schema/vocabulary";
import { PipelineTimeline } from "./PipelineTimeline";

const SAMPLES: { name: string; src: string; demo: DemoName }[] = [
  { name: "Bathroom", src: "/samples/bathroom.jpg", demo: "bathroom" },
  { name: "Bedroom", src: "/samples/bedroom.jpg", demo: "bedroom" },
  { name: "Living room", src: "/samples/living.jpg", demo: "living" },
];

const ROOM_LABELS: Record<RoomType, string> = { ...ROOM_NAMES, other: "Other" };

/** Photos analysed at once: keeps us clear of Meta API rate limits. */
const CONCURRENCY = 2;

type Item = {
  key: string;
  blob: Blob;
  preview: string;
  timings: StepTiming[];
  status: "ready" | "running" | "done" | "failed";
  error?: string;
  result?: PhotoAnalysis;
};

const noopSubscribe = () => () => {};

export function UploadForm() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [roomType, setRoomType] = useState<RoomType | "auto">("auto");
  const [items, setItems] = useState<Item[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const demoMode = useSyncExternalStore(noopSubscribe, demoModeOn, () => false);

  const update = (key: string, patch: Partial<Item> | ((it: Item) => Partial<Item>)) =>
    setItems((prev) =>
      prev.map((it) => (it.key === key ? { ...it, ...(typeof patch === "function" ? patch(it) : patch) } : it)),
    );

  // Next keeps this page's state alive (hidden) while the result page is shown, so
  // coming back would still show the last photos mid-analysis. Reset when it's hidden.
  useEffect(() => {
    const input = inputRef.current;
    return () => {
      setItems((prev) => {
        for (const it of prev) URL.revokeObjectURL(it.preview);
        return [];
      });
      setRunning(false);
      setError(null);
      setNotice(null);
      setDragging(false);
      if (input) input.value = "";
    };
  }, []);

  const finish = useCallback(
    (photos: PhotoAnalysis[]) => {
      const screening = makeScreening(photos, { userRoomType: roomType === "auto" ? undefined : roomType });
      saveResult(screening);
      router.push(`/result/${screening.id}`);
    },
    [roomType, router],
  );

  /** Add photos to the list (downscaled in the browser, which also drops EXIF). */
  const addFiles = async (files: FileList | File[] | null) => {
    if (!files) return;
    setError(null);
    const list = [...files];
    const room = MAX_PHOTOS - items.length;
    if (list.length > room) {
      setNotice(`Up to ${MAX_PHOTOS} photos of one room. Only the first ${Math.max(0, room)} were added.`);
    }
    for (const file of list.slice(0, Math.max(0, room))) {
      // Some browsers give HEIC files an empty type; let downscaleImage try them.
      if (file.type && !file.type.startsWith("image/")) {
        setError("Please choose photos (JPEG, PNG or HEIC exported as JPEG).");
        continue;
      }
      try {
        const small = await downscaleImage(file);
        const item: Item = {
          key: crypto.randomUUID(),
          blob: small,
          preview: URL.createObjectURL(small),
          timings: [],
          status: "ready",
        };
        setItems((prev) => (prev.length < MAX_PHOTOS ? [...prev, item] : prev));
      } catch (e) {
        setError((e as Error).message);
      }
    }
    if (inputRef.current) inputRef.current.value = "";
  };

  const remove = (key: string) =>
    setItems((prev) => {
      const it = prev.find((x) => x.key === key);
      if (it) URL.revokeObjectURL(it.preview);
      return prev.filter((x) => x.key !== key);
    });

  /** Analyse every photo (two at a time); go to the result when all have succeeded. */
  const screenAll = async () => {
    const queue = items.filter((it) => it.status !== "done");
    if (queue.length === 0) return;
    setRunning(true);
    setError(null);
    setNotice(null);
    const results = new Map<string, PhotoAnalysis>();
    for (const it of items) if (it.result) results.set(it.key, it.result);
    let next = 0;
    const worker = async () => {
      while (next < queue.length) {
        const it = queue[next++];
        update(it.key, { status: "running", timings: [], error: undefined });
        try {
          const result = await analyzeOnServer(it.blob, roomType, (t) =>
            update(it.key, (cur) => ({ timings: [...cur.timings, t] })),
          );
          results.set(it.key, result);
          update(it.key, { status: "done", result });
        } catch (e) {
          update(it.key, { status: "failed", error: (e as Error).message });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
    const ordered = items.map((it) => results.get(it.key)).filter((r): r is PhotoAnalysis => !!r);
    if (ordered.length === items.length) {
      try {
        finish(ordered);
      } catch (e) {
        setError((e as Error).message);
        setRunning(false);
      }
    } else {
      setRunning(false);
    }
  };

  /** Sample rooms: one photo, live (or replayed in demo mode, or if the live call fails). */
  const runSample = async (sample: (typeof SAMPLES)[number]) => {
    setError(null);
    setNotice(null);
    setRunning(true);
    const blob = await (await fetch(sample.src)).blob();
    const item: Item = {
      key: crypto.randomUUID(),
      blob,
      preview: URL.createObjectURL(blob),
      timings: [],
      status: "running",
    };
    setItems([item]);
    const onStep = (t: StepTiming) => update(item.key, (cur) => ({ timings: [...cur.timings, t] }));
    try {
      let result: PhotoAnalysis;
      if (demoModeOn()) {
        result = await replayDemo(sample.demo, onStep);
      } else {
        try {
          result = await analyzeOnServer(blob, roomType, onStep);
        } catch {
          // Safety net for sample rooms: replay the saved result if the live API fails.
          setNotice("The live analysis isn't available right now, so this is a saved result for the sample room.");
          update(item.key, { timings: [] });
          result = await replayDemo(sample.demo, onStep);
        }
      }
      finish([result]);
    } catch (e) {
      setError((e as Error).message);
      update(item.key, { status: "failed" });
      setRunning(false);
    }
  };

  const failed = items.filter((it) => it.status === "failed");
  const done = items.filter((it) => it.status === "done");
  const canAdd = !running && items.length < MAX_PHOTOS;

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
          if (canAdd) void addFiles(e.dataTransfer.files);
        }}
        className={`relative overflow-hidden rounded-2xl border-2 border-dashed transition ${
          dragging ? "border-accent bg-accent-soft" : "border-line bg-card"
        }`}
      >
        {items.length === 0 ? (
          <button
            type="button"
            disabled={running}
            onClick={() => inputRef.current?.click()}
            className="flex w-full flex-col items-center gap-3 px-6 py-16 text-center"
          >
            <span className="grid h-14 w-14 place-items-center rounded-full bg-accent-soft text-2xl text-accent">
              ↑
            </span>
            <span className="font-display text-2xl">Add photos of one room</span>
            <span className="max-w-md text-muted">
              Drop up to {MAX_PHOTOS} photos here or click to choose. A wide shot from the doorway works best; add
              more to cover the other walls.
            </span>
          </button>
        ) : (
          <div className="space-y-3 p-4">
            <ul className="space-y-3">
              {items.map((it, i) => (
                <li key={it.key} className="flex items-start gap-3">
                  <div className="relative shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={it.preview}
                      alt={`Photo ${photoLabel(i)}`}
                      className={`h-20 w-28 rounded-lg border border-line object-cover ${
                        it.status === "running" ? "opacity-80" : ""
                      }`}
                    />
                    <span className="absolute left-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-ink/80 text-xs font-bold text-white">
                      {photoLabel(i)}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1 pt-1">
                    {it.status === "ready" ? (
                      <p className="text-sm text-muted">Ready to screen</p>
                    ) : (
                      <PipelineTimeline timings={it.timings} running={it.status === "running"} />
                    )}
                    {it.error && <p className="mt-1 text-sm text-orange">{it.error}</p>}
                  </div>
                  {!running && it.status !== "done" && (
                    <button
                      type="button"
                      onClick={() => remove(it.key)}
                      aria-label={`Remove photo ${photoLabel(i)}`}
                      className="shrink-0 rounded-full px-2 text-lg leading-none text-muted hover:text-ink"
                    >
                      ×
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
              {failed.length > 0 && done.length > 0 && !running ? (
                <>
                  <button
                    type="button"
                    onClick={() => finish(items.flatMap((it) => (it.result ? [it.result] : [])))}
                    className="rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-white hover:opacity-90"
                  >
                    Continue with {done.length} {done.length === 1 ? "photo" : "photos"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void screenAll()}
                    className="rounded-full border border-line bg-card px-4 py-2.5 text-sm hover:border-accent"
                  >
                    Try the failed {failed.length === 1 ? "photo" : "photos"} again
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  disabled={running}
                  onClick={() => void screenAll()}
                  className="rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
                >
                  {running
                    ? "Screening…"
                    : `Screen ${items.length === 1 ? "this photo" : `these ${items.length} photos`}`}
                </button>
              )}
              {canAdd && (
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="rounded-full border border-line bg-card px-4 py-2.5 text-sm hover:border-accent"
                >
                  Add another photo ({items.length}/{MAX_PHOTOS})
                </button>
              )}
            </div>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => void addFiles(e.target.files)}
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
          <span className="text-muted">
            {demoMode ? (
              <span className="mr-1 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">
                Demo mode
              </span>
            ) : null}
            Or try a sample room:
          </span>
          {SAMPLES.map((s) => (
            <button
              key={s.src}
              type="button"
              disabled={running}
              onClick={() => void runSample(s)}
              className="rounded-full border border-line bg-card px-3 py-1.5 hover:border-accent hover:text-accent disabled:opacity-50"
            >
              {s.name}
            </button>
          ))}
        </div>
      </div>

      {notice && (
        <p role="status" className="rounded-xl border border-amber/50 bg-amber/10 px-4 py-3 text-sm">
          {notice}
        </p>
      )}

      {error && (
        <p role="alert" className="rounded-xl border border-orange/40 bg-orange/10 px-4 py-3 text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
