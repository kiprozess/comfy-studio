import { afterEach, test, mock } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { readGeneration, readTicket, signJob, submitGeneration } from "../src/lib/server/comfy-router";
import { POST as upscale } from "../src/app/api/upscale/route";
import { GET as poll } from "../src/app/api/generate/[token]/route";

const originalKey = process.env.COMFY_API_KEY;
const originalUpscaler = process.env.COMFY_UPSCALER;
afterEach(() => {
  mock.restoreAll();
  if (originalKey === undefined) delete process.env.COMFY_API_KEY; else process.env.COMFY_API_KEY = originalKey;
  if (originalUpscaler === undefined) delete process.env.COMFY_UPSCALER; else process.env.COMFY_UPSCALER = originalUpscaler;
});

async function png(width = 120, height = 160) {
  return (await sharp({ create: { width, height, channels: 3, background: "#806040" } }).png().toBuffer()).toString("base64");
}

function mockFetch(responses: Response[]) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const response = responses.shift();
    assert.ok(response, "Unexpected upstream call");
    return response;
  }) as typeof fetch;
  return { fetcher, calls };
}

function upscaleRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/upscale", {
    method: "POST",
    headers: { Origin: "http://localhost", "Content-Type": "application/json", "Idempotency-Key": "12345678-1234-1234-1234-123456789abc", ...headers },
    body: JSON.stringify(body),
  });
}

test("upscale tickets name their model while generation tickets keep the original shape", () => {
  assert.deepEqual(readTicket(signJob("job-1", "key", 100), "key", 101), { id: "job-1", model: "generate" });
  assert.deepEqual(readTicket(signJob("job-2", "key", 100, "upscale"), "key", 101), { id: "job-2", model: "upscale" });
  const generation = JSON.parse(Buffer.from(signJob("job-1", "key", 100).split(".")[0], "base64url").toString());
  assert.equal("model" in generation, false);
});

test("submits upscales to the Ultimate Image Upscaler queue", async () => {
  const upstream = mockFetch([Response.json({ request_id: "up-1", status: "IN_QUEUE" }, { status: 201 })]);
  const result = await submitGeneration({ image: "data:image/png;base64,AA==" }, "attempt-1", "private-key", upstream.fetcher, "upscale");
  assert.equal(upstream.calls[0].url, "https://api.comfy.org/v2/models/wavespeed/ultimate-image-upscaler/requests");
  assert.equal(readTicket(result.token, "private-key").model, "upscale");
});

test("collects base64 and linked upscaler output and reports provider failures", async () => {
  const image = await png(240, 320);
  const inline = mockFetch([Response.json({ status: "COMPLETED" }), Response.json({ code: 200, data: { outputs: [image], status: "completed", error: "" } })]);
  const inlineResult = await readGeneration(signJob("up-1", "key", Date.now(), "upscale"), "key", inline.fetcher);
  assert.equal(inlineResult.status, "succeeded");
  assert.equal(inlineResult.image, `data:image/png;base64,${image}`);
  assert.equal(inline.calls[0].url, "https://api.comfy.org/v2/models/wavespeed/ultimate-image-upscaler/requests/up-1/status");

  const linked = mockFetch([
    Response.json({ status: "COMPLETED" }),
    Response.json({ code: 200, data: { outputs: ["https://cdn.example/upscaled.png"], status: "completed" } }),
    new Response(new Uint8Array(Buffer.from(image, "base64")), { headers: { "Content-Type": "image/png" } }),
  ]);
  const linkedResult = await readGeneration(signJob("up-2", "key", Date.now(), "upscale"), "key", linked.fetcher);
  assert.equal(linkedResult.image, `data:image/png;base64,${image}`);
  assert.equal(linked.calls[2].url, "https://cdn.example/upscaled.png");

  const failed = mockFetch([Response.json({ status: "COMPLETED" }), Response.json({ code: 500, data: { outputs: [], status: "failed", error: "boom" } })]);
  assert.equal((await readGeneration(signJob("up-3", "key", Date.now(), "upscale"), "key", failed.fetcher)).status, "failed");
});

test("upscale route validates the resolution and image before any upstream call", async () => {
  process.env.COMFY_API_KEY = "test-private-key";
  process.env.COMFY_UPSCALER = "router";
  const upstream = mockFetch([]);
  mock.method(globalThis, "fetch", upstream.fetcher);
  const image = `data:image/png;base64,${await png()}`;
  assert.equal((await upscale(upscaleRequest({ image, resolution: "16k" }))).status, 400);
  assert.equal((await upscale(upscaleRequest({ image: "https://example.com/a.png", resolution: "4k" }))).status, 400);
  assert.equal((await upscale(upscaleRequest({ image: "data:image/png;base64,aGVsbG8=", resolution: "4k" }))).status, 400);
  assert.equal((await upscale(upscaleRequest({ image, resolution: "4k" }, { Origin: "https://other.example" }))).status, 403);
  assert.equal(upstream.calls.length, 0);
});

test("HTTP handlers complete a router upscale by default -> queued ticket -> status -> image", async () => {
  process.env.COMFY_API_KEY = "test-private-key";
  delete process.env.COMFY_UPSCALER;
  const source = `data:image/png;base64,${await png()}`;
  const upscaled = await png(480, 640);
  const upstream = mockFetch([
    Response.json({ request_id: "up-route-1", status: "IN_QUEUE" }, { status: 201 }),
    Response.json({ status: "COMPLETED" }),
    Response.json({ code: 200, data: { outputs: [upscaled], status: "completed", error: "" } }),
  ]);
  mock.method(globalThis, "fetch", upstream.fetcher);
  const response = await upscale(upscaleRequest({ image: source, resolution: "4k" }));
  assert.equal(response.status, 202);
  const body = JSON.parse(String(upstream.calls[0].init?.body));
  assert.deepEqual({ ...body, image: undefined }, { image: undefined, target_resolution: "4k", output_format: "jpeg", enable_base64_output: true });
  assert.equal(body.image, source);
  const { token } = await response.json();
  const result = await (await poll(new Request("http://localhost/api/generate/ticket"), { params: Promise.resolve({ token }) })).json();
  assert.equal(result.status, "succeeded");
  assert.equal((await sharp(Buffer.from(result.image.split(",")[1], "base64")).metadata()).width, 480);
});

test("fills the SeedVR2 workflow with the uploaded asset and the chosen resolution without changing the template", async () => {
  const { buildSeedvr2Workflow } = await import("../src/lib/server/comfy-cloud");
  const template = (await import("../src/lib/server/workflows/seedvr2-upscale.json")).default as Record<string, { inputs: Record<string, unknown> }>;
  const workflow = buildSeedvr2Workflow("asset-1", "4k", 7);
  assert.deepEqual(workflow["9"].inputs.image, { __type: "core/ASSET", info: { id: "asset-1" } });
  assert.equal(workflow["2"].inputs.resolution, 4096);
  assert.equal(workflow["2"].inputs.max_resolution, 4096);
  assert.equal(workflow["2"].inputs.seed, 7);
  assert.equal(buildSeedvr2Workflow("asset-2", "2k")["2"].inputs.resolution, 2048);
  assert.equal(template["9"].inputs.image, "");
  assert.equal(template["2"].inputs.resolution, 2048);
});

test("HTTP handlers run the SeedVR2 workflow on Comfy Cloud with progress and the key sent only to Cloud", async () => {
  process.env.COMFY_API_KEY = "test-private-key";
  process.env.COMFY_UPSCALER = "seedvr2";
  const source = `data:image/png;base64,${await png()}`;
  const upscaled = Buffer.from(await png(480, 640), "base64");
  const upstream = mockFetch([
    Response.json({ id: "asset-1", hash: null, size_bytes: 1, content_type: "image/png" }, { status: 201 }),
    Response.json({ id: "job-1", status: "queued", queue_position: 1 }, { status: 201 }),
    Response.json({ id: "job-1", status: "running", progress: { value: 0.4, nodes_done: 2, nodes_total: 5 }, outputs: [] }),
    Response.json({ id: "job-1", status: "succeeded", outputs: [{ node_id: "5", type: "image", url: "https://cloud.comfy.org/api/v2/assets/out-1/content" }] }),
    new Response(new Uint8Array(upscaled), { headers: { "Content-Type": "image/png" } }),
  ]);
  mock.method(globalThis, "fetch", upstream.fetcher);
  assert.equal((await upscale(upscaleRequest({ image: source, resolution: "8k" }))).status, 400);

  const response = await upscale(upscaleRequest({ image: source, resolution: "4k" }));
  assert.equal(response.status, 202);
  assert.equal(upstream.calls[0].url, "https://cloud.comfy.org/api/v2/assets");
  assert.equal(upstream.calls[1].url, "https://cloud.comfy.org/api/v2/jobs");
  const upload = upstream.calls[0].init?.body as FormData;
  assert.deepEqual([...upload.keys()], ["content_type", "file_path", "tags", "expires_in", "file"]);
  assert.deepEqual(JSON.parse(String(upload.get("tags"))), ["input"]);
  for (const call of upstream.calls) assert.equal((call.init?.headers as Record<string, string>).Authorization, "Bearer test-private-key");
  const submitted = JSON.parse(String(upstream.calls[1].init?.body));
  assert.deepEqual(submitted.workflow["9"].inputs.image, { __type: "core/ASSET", info: { id: "asset-1" } });
  assert.equal(submitted.workflow["2"].inputs.resolution, 4096);
  const { token } = await response.json();
  assert.equal(readTicket(token, "test-private-key").model, "workflow");

  const read = async () => (await poll(new Request("http://localhost/api/generate/ticket"), { params: Promise.resolve({ token }) })).json();
  const running = await read();
  assert.equal(running.status, "running");
  assert.equal(running.progress, 0.4);
  const done = await read();
  assert.equal(done.status, "succeeded");
  assert.equal((await sharp(Buffer.from(done.image.split(",")[1], "base64")).metadata()).width, 480);
  assert.equal(upstream.calls[4].url, "https://cloud.comfy.org/api/v2/assets/out-1/content");
});

test("never sends the key to another host and reports failed workflow jobs", async () => {
  const { readWorkflowJob } = await import("../src/lib/server/comfy-cloud");
  const image = Buffer.from(await png(), "base64");
  const foreign = mockFetch([
    Response.json({ id: "job-2", status: "succeeded", outputs: [{ node_id: "5", type: "image", url: "https://storage.example/out.png" }] }),
    new Response(new Uint8Array(image)),
  ]);
  const result = await readWorkflowJob(signJob("job-2", "key", Date.now(), "workflow"), "key", foreign.fetcher);
  assert.equal(result.status, "succeeded");
  assert.equal((foreign.calls[1].init?.headers as Record<string, string> | undefined)?.Authorization, undefined);

  const failed = mockFetch([Response.json({ id: "job-3", status: "failed", outputs: [], error: { code: "node_execution_error", message: "CUDA out of memory", class_type: "SeedVR2VideoUpscaler" } })]);
  const failure = await readWorkflowJob(signJob("job-3", "key", Date.now(), "workflow"), "key", failed.fetcher);
  assert.equal(failure.status, "failed");
  assert.match(failure.error!, /SeedVR2VideoUpscaler/);
  assert.doesNotMatch(failure.error!, /CUDA/);
});
