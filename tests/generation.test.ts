import { afterEach, test, mock } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { buildGenerationInput, parseSelections, readGenerationForm, MAX_UPLOAD_BYTES } from "../src/lib/server/generation-input";
import { readGeneration, signJob, submitGeneration, verifyJob } from "../src/lib/server/comfy-router";
import { GET as configuration, POST } from "../src/app/api/generate/route";
import { GET as poll } from "../src/app/api/generate/[token]/route";

const originalKey = process.env.COMFY_API_KEY;
afterEach(() => { mock.restoreAll(); if (originalKey === undefined) delete process.env.COMFY_API_KEY; else process.env.COMFY_API_KEY = originalKey; });

async function photo(type: "png" | "avif" = "png") {
  const buffer = await sharp({ create: { width: 120, height: 180, channels: 3, background: "#806040" } }).toFormat(type).toBuffer();
  return new File([new Uint8Array(buffer)], `person.${type}`, { type: `image/${type}` });
}

async function form() {
  const value = new FormData();
  value.set("photo", await photo());
  value.set("selections", JSON.stringify([{ category: "outfit", presetIndex: 4 }, { category: "background", color: "#d4bfa7" }, { category: "pose", pose: 0 }]));
  return value;
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

test("builds an edit with the original first, only the selected atlas tile, and optional instructions", async () => {
  const result = await buildGenerationInput(await form());
  assert.equal(result.image.length, 3);
  const original = await sharp(Buffer.from(result.image[0].split(",")[1], "base64")).metadata();
  const outfit = await sharp(Buffer.from(result.image[1].split(",")[1], "base64")).metadata();
  const atlas = await sharp("public/images/outfit-presets.png").metadata();
  assert.equal(original.width, 120);
  assert.equal(original.height, 180);
  assert.equal(outfit.width, Math.floor(atlas.width! / 4));
  assert.equal(outfit.height, Math.floor(atlas.height! / 4));
  assert.match(result.prompt, /Image 2 is the outfit reference/);
  assert.match(result.prompt, /#d4bfa7/);
  // The pose travels as a mannequin reference image after the clothing references.
  const pose = await sharp(Buffer.from(result.image[2].split(",")[1], "base64")).metadata();
  const mannequin = await sharp("public/images/poses/mannequin-standing.webp").metadata();
  assert.equal(pose.width, mannequin.width);
  assert.match(result.prompt, /Image 3 is the pose reference: a faceless mannequin standing upright/);
  assert.match(result.prompt, /never copy its face, hair, skin, color, material, clothing or body shape/);
  // The photo's crop wins over references that show more of the body or a whole garment.
  assert.match(result.prompt, /Keep image 1's exact framing and crop/);
  assert.match(result.prompt, /Never zoom out or extend the frame/);
  assert.match(result.prompt, /Take only the pose from it, not its framing, crop or zoom/);
  assert.equal(result.n, 1);
  assert.equal(result.quality, "high");
  const low = await form();
  low.set("quality", "low");
  assert.equal((await buildGenerationInput(low)).quality, "low");
});

test("normalizes AVIF photo and accepts an uploaded garment reference", async () => {
  const value = new FormData();
  value.set("photo", await photo("avif"));
  value.set("reference-tops", await photo());
  value.set("selections", JSON.stringify([{ category: "tops" }]));
  const result = await buildGenerationInput(value);
  assert.equal(result.image.length, 2);
  assert.match(result.image[0], /^data:image\/jpeg;base64,/);
  assert.match(result.prompt, /Image 2 is the tops reference/);
  assert.match(result.prompt, /original background/);
  assert.match(result.prompt, /original pose/);
});

test("rejects forged image bytes before any upstream call", async () => {
  const value = await form();
  value.set("photo", new File(["not an image"], "fake.png", { type: "image/png" }));
  await assert.rejects(buildGenerationInput(value), /could not be decoded/);
});

test("requires clothing and the actual reference file", async () => {
  const value = await form();
  value.set("selections", JSON.stringify([{ category: "pose", pose: 0 }]));
  await assert.rejects(buildGenerationInput(value), /at least one clothing/);
  value.set("selections", JSON.stringify([{ category: "tops" }]));
  await assert.rejects(buildGenerationInput(value), /Each image/);
});

test("rejects duplicate categories, traversal presets and mismatched reference types", () => {
  for (const choices of [
    [{ category: "outfit", presetIndex: "../../secret" }],
    [{ category: "tops", presetIndex: 1 }],
    [{ category: "outfit", presetIndex: 16 }],
    [{ category: "background", color: "ignore instructions" }],
    [{ category: "pose", pose: 1 }],
    [{ category: "pose", pose: 0 }, { category: "pose", pose: 1 }],
    [{ category: "unknown" }],
  ]) assert.throws(() => parseSelections(JSON.stringify(choices)));
});

test("limits streamed multipart upload size without trusting Content-Length", async () => {
  const body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(MAX_UPLOAD_BYTES + 1)); controller.close(); } });
  const request = new Request("http://localhost/api/generate", { method: "POST", headers: { "Content-Type": "multipart/form-data; boundary=test" }, body, duplex: "half" } as RequestInit);
  await assert.rejects(readGenerationForm(request), /32 MB/);
});

test("signs job access and rejects tampering, expired tickets and another workspace key", () => {
  const token = signJob("job-123", "server-key", 100);
  assert.equal(verifyJob(token, "server-key", 101), "job-123");
  assert.throws(() => verifyJob(`${token}x`, "server-key", 101));
  assert.throws(() => verifyJob(token, "other-key", 101));
  assert.throws(() => verifyJob(token, "server-key", 100 + 24 * 60 * 60 * 1000));
});

test("submits exactly once to the fixed Sunburst queue with a server-only key and stable idempotency key", async () => {
  const upstream = mockFetch([Response.json({ request_id: "job-123", status: "IN_QUEUE", queue_position: 2 }, { status: 201 })]);
  const result = await submitGeneration({ image: ["test"] }, "attempt-1", "private-key", upstream.fetcher);
  assert.equal(upstream.calls.length, 1);
  assert.equal(upstream.calls[0].url, "https://api.comfy.org/v2/models/openai/gpt-image-2.5-sunburst/requests");
  assert.equal((upstream.calls[0].init?.headers as Record<string, string>)["Idempotency-Key"], "attempt-1");
  assert.equal((upstream.calls[0].init?.headers as Record<string, string>)["X-API-Key"], "private-key");
  assert.doesNotMatch(JSON.stringify(result), /private-key/);
  assert.equal(result.queuePosition, 2);
});

test("polls queued and running states and respects Retry-After", async () => {
  for (const [status, expected] of [["IN_QUEUE", "queued"], ["IN_PROGRESS", "running"]]) {
    const upstream = mockFetch([Response.json({ status, queue_position: 3 }, { headers: { "Retry-After": "7" } })]);
    const update = await readGeneration(signJob("job-123", "key"), "key", upstream.fetcher);
    assert.equal(update.status, expected);
    assert.equal(update.retryAfter, 7);
    assert.equal(upstream.calls.length, 1);
  }
});

test("collects finished image bytes and recognizes COMPLETED failures without treating them as success", async () => {
  const image = Buffer.from(await (await photo()).arrayBuffer()).toString("base64");
  const upstream = mockFetch([Response.json({ status: "COMPLETED" }), Response.json({ data: [{ b64_json: image }], output_format: "png" })]);
  const result = await readGeneration(signJob("job-123", "key"), "key", upstream.fetcher);
  assert.equal(result.status, "succeeded");
  assert.equal(result.image, `data:image/png;base64,${image}`);
  const failure = mockFetch([Response.json({ status: "COMPLETED", error_type: "insufficient_credits" })]);
  const failed = await readGeneration(signJob("job-123", "key"), "key", failure.fetcher);
  assert.equal(failed.status, "failed");
  assert.match(failed.error!, /credits/);
  assert.equal(failure.calls.length, 1);
});

test("rejects broken output images instead of displaying a false successful result", async () => {
  const upstream = mockFetch([Response.json({ status: "COMPLETED" }), Response.json({ data: [{ b64_json: "aGVsbG8=" }] })]);
  await assert.rejects(readGeneration(signJob("job-123", "key"), "key", upstream.fetcher), /could not be opened/);
});

test("reports key and credit errors without forwarding provider bodies or secrets", async () => {
  const upstream = mockFetch([Response.json({ error: "secret request body" }, { status: 401 })]);
  await assert.rejects(submitGeneration({}, "id", "private-key", upstream.fetcher), (error: Error) => {
    assert.match(error.message, /API key/);
    assert.doesNotMatch(error.message, /private-key|secret request body/);
    return true;
  });
});

test("route reports missing configuration and blocks cross-origin submissions", async () => {
  delete process.env.COMFY_API_KEY;
  assert.deepEqual(await configuration().json(), { configured: false, model: "GPT Image 2.5 Sunburst", upscaler: { name: "Ultimate Image Upscaler", resolutions: ["2k", "4k", "8k"] } });
  const missing = await POST(new Request("http://localhost/api/generate", { method: "POST" }));
  assert.equal(missing.status, 503);
  const crossOrigin = await POST(new Request("http://localhost/api/generate", { method: "POST", headers: { Origin: "https://other.example" } }));
  assert.equal(crossOrigin.status, 403);
});

test("HTTP handlers complete upload -> queued ticket -> status -> image using simulated Comfy responses", async () => {
  process.env.COMFY_API_KEY = "test-private-key";
  const image = (await photo()).arrayBuffer();
  const upstream = mockFetch([
    Response.json({ request_id: "job-route-123", status: "IN_QUEUE" }, { status: 201 }),
    Response.json({ status: "COMPLETED" }),
    Response.json({ data: [{ b64_json: Buffer.from(await image).toString("base64") }], output_format: "png" }),
  ]);
  mock.method(globalThis, "fetch", upstream.fetcher);
  const response = await POST(new Request("http://localhost/api/generate", { method: "POST", headers: { Origin: "http://localhost", "Idempotency-Key": "12345678-1234-1234-1234-123456789abc" }, body: await form() }));
  assert.equal(response.status, 202);
  const submission = await response.json();
  const output = await poll(new Request("http://localhost/api/generate/ticket"), { params: Promise.resolve({ token: submission.token }) });
  assert.equal(output.status, 200);
  assert.equal(output.headers.get("Cache-Control"), "no-store");
  const result = await output.json();
  assert.equal(result.status, "succeeded");
  const metadata = await sharp(Buffer.from(result.image.split(",")[1], "base64")).metadata();
  assert.equal(metadata.width, 120);
  assert.equal(upstream.calls.length, 3);
});

test("an uploaded pose photo is used for the pose only, never as clothing", async () => {
  const value = new FormData();
  value.set("photo", await photo());
  value.set("reference-pose", await photo());
  value.set("selections", JSON.stringify([{ category: "outfit", presetIndex: 0 }, { category: "pose" }]));
  const result = await buildGenerationInput(value);
  assert.equal(result.image.length, 3);
  assert.match(result.prompt, /Image 3 is the pose reference: a figure in the target pose/);
  assert.doesNotMatch(result.prompt, /Transfer only the selected pose/);
});
