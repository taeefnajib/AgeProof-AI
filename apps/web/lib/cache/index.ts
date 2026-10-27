import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Content-hash cache for model calls. Filesystem in dev (and in scripts);
 * disabled in production unless CACHE_DIR is set, so uploads aren't persisted.
 */
function cacheDir(): string | null {
  if (process.env.CACHE_DIR) return process.env.CACHE_DIR;
  if (process.env.NODE_ENV === "production") return null;
  return path.resolve(process.cwd(), ".cache");
}

export function hashKey(...parts: unknown[]): string {
  const h = createHash("sha256");
  for (const p of parts) h.update(typeof p === "string" ? p : JSON.stringify(p)).update("\0");
  return h.digest("hex");
}

export async function cacheGet<T>(namespace: string, key: string): Promise<T | null> {
  const dir = cacheDir();
  if (!dir) return null;
  try {
    return JSON.parse(await readFile(path.join(/*turbopackIgnore: true*/ dir, namespace, `${key}.json`), "utf8")) as T;
  } catch {
    return null;
  }
}

export async function cacheSet(namespace: string, key: string, value: unknown): Promise<void> {
  const dir = cacheDir();
  if (!dir) return;
  await mkdir(path.join(/*turbopackIgnore: true*/ dir, namespace), { recursive: true });
  await writeFile(path.join(/*turbopackIgnore: true*/ dir, namespace, `${key}.json`), JSON.stringify(value));
}

/** Return the cached value, or compute, store and return it. */
export async function cached<T>(
  namespace: string,
  key: string,
  compute: () => Promise<T>,
): Promise<{ value: T; hit: boolean }> {
  const hit = await cacheGet<T>(namespace, key);
  if (hit !== null) return { value: hit, hit: true };
  const value = await compute();
  await cacheSet(namespace, key, value);
  return { value, hit: false };
}
