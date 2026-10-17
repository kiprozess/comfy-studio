import { afterEach, test, mock } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { isAppRequest } from "../src/lib/server/request-origin";
import { POST as generate } from "../src/app/api/generate/route";
import { POST as flatlay } from "../src/app/api/flatlay/route";
import { POST as pose } from "../src/app/api/pose/route";
import { POST as upscale } from "../src/app/api/upscale/route";

const keys = ["APP_ORIGIN", "RAILWAY_PUBLIC_DOMAIN", "APP_RATE_LIMIT_DIR", "COMFY_API_KEY", "NODE_ENV"];
const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
let directory: string | undefined;
afterEach(async () => {
  mock.restoreAll();
  for (const key of keys) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
  if (directory) await rm(directory, { recursive: true, force: true });
  directory = undefined;
});

function request(origin?: string, extra: Record<string, string> = {}) {
  return new Request("http://0.0.0.0:8080/api/generate", { method: "POST", headers: { ...(origin === undefined ? {} : { Origin: origin }), ...extra } });
}

test("Railway's public HTTPS origin works behind an internal HTTP container URL", () => {
  delete process.env.APP_ORIGIN;
  process.env.RAILWAY_PUBLIC_DOMAIN = "comfy-studio-production.up.railway.app";
  assert.equal(isAppRequest(request("https://comfy-studio-production.up.railway.app", { "Sec-Fetch-Site": "same-origin" })), true);
  assert.equal(isAppRequest(request("http://comfy-studio-production.up.railway.app")), false);
  assert.equal(isAppRequest(request("https://other.up.railway.app")), false);
});

test("configured custom origin takes precedence and forged proxy headers do not authorize an origin", () => {
  process.env.APP_ORIGIN = "https://studio.example.com";
  process.env.RAILWAY_PUBLIC_DOMAIN = "generated.up.railway.app";
  assert.equal(isAppRequest(request("https://studio.example.com")), true);
  for (const origin of ["https://generated.up.railway.app", "https://evil.example", "https://studio.example.com.evil.example", "https://user@studio.example.com", "https://studio.example.com/path", "null"]) {
    assert.equal(isAppRequest(request(origin, { "X-Forwarded-Host": "evil.example", "X-Forwarded-Proto": "https", Forwarded: "host=evil.example;proto=https" })), false, origin);
  }
  assert.equal(isAppRequest(request("https://studio.example.com", { "Sec-Fetch-Site": "cross-site" })), false);
  process.env.APP_ORIGIN = "https://studio.example.com/path";
  assert.equal(isAppRequest(request("https://studio.example.com")), false);
});

test("local same-origin requests and non-browser API clients remain supported", () => {
  delete process.env.APP_ORIGIN;
  delete process.env.RAILWAY_PUBLIC_DOMAIN;
  assert.equal(isAppRequest(new Request("http://localhost:3001/api/generate", { headers: { Origin: "http://localhost:3001" } })), true);
  assert.equal(isAppRequest(new Request("http://localhost:3001/api/generate", { headers: { Origin: "http://localhost:3000" } })), false);
  assert.equal(isAppRequest(request()), true);
  assert.equal(isAppRequest(request(undefined, { "Sec-Fetch-Site": "cross-site" })), false);
});

test("all four handlers allow the public origin and reject foreign origins before consuming paid-request quotas", async () => {
  directory = await mkdtemp(path.join(tmpdir(), "comfy-origin-"));
  Object.assign(process.env, { NODE_ENV: "production", RAILWAY_PUBLIC_DOMAIN: "studio.up.railway.app", APP_RATE_LIMIT_DIR: directory, COMFY_API_KEY: "test-key" });
  delete process.env.APP_ORIGIN;
  let providerCalls = 0;
  mock.method(globalThis, "fetch", async () => { providerCalls++; throw new Error("Unexpected provider call"); });
  for (const handler of [generate, flatlay, pose, upscale]) {
    assert.equal((await handler(request("https://evil.example"))).status, 403);
  }
  assert.deepEqual(await readdir(directory), []);
  for (const handler of [generate, flatlay, pose, upscale]) {
    const response = await handler(request("https://studio.up.railway.app", { "Sec-Fetch-Site": "same-origin" }));
    assert.equal(response.status, 400); // Reaches ordinary request-ID validation.
    assert.match((await response.json()).error, /request ID/);
  }
  assert.equal(providerCalls, 0);
});
