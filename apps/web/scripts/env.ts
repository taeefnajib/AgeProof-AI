import { existsSync } from "node:fs";
import path from "node:path";

/** Load apps/web/.env.local for CLI scripts (Next.js does this itself for the app). */
const envFile = path.resolve(import.meta.dirname, "..", ".env.local");
if (existsSync(envFile)) process.loadEnvFile(envFile);

export const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..", "..");
