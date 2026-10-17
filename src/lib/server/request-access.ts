import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

function error(message: string, status: number, headers: Record<string, string> = {}) {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

type Window = { start: number; count: number };
type Budget = { minute: Window; day: Window };
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

function limit(value: string | undefined, fallback: number) {
  if (value === undefined) return fallback;
  if (!/^[1-9]\d{0,5}$/.test(value)) throw new Error("Invalid rate limit");
  return Number(value);
}

function validWindow(value: unknown): value is Window {
  if (!value || typeof value !== "object") return false;
  const w = value as Window;
  return Number.isSafeInteger(w.start) && w.start >= 0 && Number.isSafeInteger(w.count) && w.count >= 0;
}

// One persistent, deployment-wide budget, never keyed by spoofable IP headers.
// Atomic mkdir serializes all route handlers/processes sharing this filesystem.
// Failure to read/write/lock the state denies work rather than granting free jobs.
export async function consumeSubmissionBudget(now = Date.now()): Promise<Response | null> {
  if (process.env.NODE_ENV !== "production" && !process.env.APP_RATE_LIMIT_DIR) return null;
  const directory = process.env.APP_RATE_LIMIT_DIR;
  if (!directory || !path.isAbsolute(directory) || directory === path.parse(directory).root) {
    return error("Configure a persistent APP_RATE_LIMIT_DIR before using this deployment.", 503);
  }
  const publicDir = path.join(process.cwd(), "public");
  const relative = path.relative(publicDir, path.resolve(directory));
  if (relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))) {
    return error("The rate limit directory must be outside public/.", 503);
  }
  const lock = path.join(directory, "submission.lock");
  let locked = false;
  try {
    const perMinute = limit(process.env.APP_REQUESTS_PER_MINUTE, 6);
    const perDay = limit(process.env.APP_REQUESTS_PER_DAY, 50);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await mkdir(lock, { mode: 0o700 });
    locked = true;
    const filename = path.join(directory, "submission.json");
    let budget: Budget;
    try {
      const stored = JSON.parse(await readFile(filename, "utf8"));
      if (!validWindow(stored.minute) || !validWindow(stored.day)) throw new Error("Invalid budget state");
      budget = stored;
    } catch (reason) {
      if ((reason as NodeJS.ErrnoException).code !== "ENOENT") throw reason;
      budget = { minute: { start: now, count: 0 }, day: { start: now, count: 0 } };
    }
    let retryAfter = 0;
    for (const [name, duration, maximum] of [["minute", MINUTE, perMinute], ["day", DAY, perDay]] as const) {
      if (now >= budget[name].start + duration) budget[name] = { start: now, count: 0 };
      if (budget[name].count >= maximum) retryAfter = Math.max(retryAfter, Math.ceil((budget[name].start + duration - now) / 1000));
    }
    if (retryAfter > 0) return error("This studio's generation limit has been reached. Try again later.", 429, { "Retry-After": String(retryAfter) });
    budget.minute.count++;
    budget.day.count++;
    const temporary = path.join(directory, "submission.tmp");
    await writeFile(temporary, JSON.stringify(budget), { mode: 0o600 });
    await rename(temporary, filename);
    return null;
  } catch {
    return error("The generation limit could not be checked. Please try again shortly.", 503, { "Retry-After": "1" });
  } finally {
    if (locked) await rm(lock, { recursive: true }).catch(() => { /* A stale lock keeps future requests closed. */ });
  }
}
