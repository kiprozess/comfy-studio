import { afterEach, test, mock } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { consumeSubmissionBudget } from "../src/lib/server/request-access";
import { POST as generate, GET as configuration } from "../src/app/api/generate/route";
import { POST as flatlay } from "../src/app/api/flatlay/route";
import { POST as pose } from "../src/app/api/pose/route";
import { POST as upscale } from "../src/app/api/upscale/route";
import { GET as poll } from "../src/app/api/generate/[token]/route";

const keys = ["NODE_ENV", "APP_RATE_LIMIT_DIR", "APP_REQUESTS_PER_MINUTE", "APP_REQUESTS_PER_DAY", "COMFY_API_KEY"];
const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
const directories: string[] = [];
const posts = [generate, flatlay, pose, upscale];

afterEach(async () => {
  mock.restoreAll();
  for (const key of keys) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function production() {
  const directory = await mkdtemp(path.join(tmpdir(), "comfy-access-"));
  directories.push(directory);
  Object.assign(process.env, { NODE_ENV: "production", APP_RATE_LIMIT_DIR: directory, COMFY_API_KEY: "test-key", APP_REQUESTS_PER_MINUTE: "6", APP_REQUESTS_PER_DAY: "50" });
  return directory;
}

function request() {
  return new Request("http://localhost/api/generate", { method: "POST" });
}

test("production fails closed for every paid route before provider access when limit storage is missing", async () => {
  await production();
  delete process.env.APP_RATE_LIMIT_DIR;
  const calls: string[] = [];
  mock.method(globalThis, "fetch", async () => { calls.push("provider"); throw new Error("Unexpected upstream request"); });
  for (const handler of posts) assert.equal((await handler(request())).status, 503);
  assert.deepEqual(calls, []);
});

test("all modes share a persistent budget without login; spoofed IP and idempotency keys cannot reset it, and polling remains available", async () => {
  const dir = await production();
  process.env.APP_REQUESTS_PER_MINUTE = "4";
  for (const handler of posts) {
    const req = request();
    req.headers.set("Idempotency-Key", "12345678-1234-1234-1234-123456789abc");
    assert.equal((await handler(req)).status, 400); // Passed budget check, rejected missing payload.
  }
  assert.equal(JSON.parse(await readFile(path.join(dir, "submission.json"), "utf8")).minute.count, 4);
  const changed = request();
  changed.headers.set("X-Forwarded-For", "203.0.113.1");
  changed.headers.set("Idempotency-Key", "87654321-1234-1234-1234-123456789abc");
  const response = await generate(changed);
  assert.equal(response.status, 429);
  assert.ok(Number(response.headers.get("Retry-After")) > 0);
  assert.equal(configuration().status, 200);
  assert.equal((await poll(request(), { params: Promise.resolve({ token: "invalid" }) })).status, 404);
});

test("the minute window resets without resetting the daily budget", async () => {
  await production();
  process.env.APP_REQUESTS_PER_MINUTE = "1";
  process.env.APP_REQUESTS_PER_DAY = "2";
  assert.equal(await consumeSubmissionBudget(1000), null);
  assert.equal((await consumeSubmissionBudget(1001))?.status, 429);
  assert.equal(await consumeSubmissionBudget(61_000), null);
  const daily = await consumeSubmissionBudget(121_000);
  assert.equal(daily?.status, 429);
  assert.ok(Number(daily?.headers.get("Retry-After")) > 60);
  assert.equal(await consumeSubmissionBudget(86_401_000), null);
});

test("concurrent requests cannot overspend, and corrupt state, invalid settings and stale locks fail closed", async () => {
  const dir = await production();
  process.env.APP_REQUESTS_PER_MINUTE = "1";
  const attempts = await Promise.all(Array.from({ length: 12 }, () => consumeSubmissionBudget(1000)));
  assert.equal(attempts.filter((value) => value === null).length, 1);
  assert.equal(await consumeSubmissionBudget(1001).then((value) => value?.status), 429);
  await writeFile(path.join(dir, "submission.json"), "invalid");
  assert.equal((await consumeSubmissionBudget(1002))?.status, 503);
  await mkdir(path.join(dir, "submission.lock"));
  assert.equal((await consumeSubmissionBudget(1003))?.status, 503);
  process.env.APP_REQUESTS_PER_MINUTE = "0";
  assert.equal((await consumeSubmissionBudget(1004))?.status, 503);
  delete process.env.APP_RATE_LIMIT_DIR;
  assert.equal((await consumeSubmissionBudget(1005))?.status, 503);
  process.env.APP_RATE_LIMIT_DIR = path.join(process.cwd(), "public", "limits");
  assert.equal((await consumeSubmissionBudget(1006))?.status, 503);
});

test("local development needs no extra configuration", async () => {
  Object.assign(process.env, { NODE_ENV: "development" });
  delete process.env.APP_RATE_LIMIT_DIR;
  assert.equal(await consumeSubmissionBudget(), null);
});
