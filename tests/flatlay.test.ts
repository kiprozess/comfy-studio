import { afterEach, test, mock } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { buildFlatlayInput, parseFlatlaySelection } from "../src/lib/server/flatlay-input";
import { flatlayCategory } from "../src/lib/flatlay";
import { POST as flatlay } from "../src/app/api/flatlay/route";
import { GET as poll } from "../src/app/api/generate/[token]/route";

const originalKey = process.env.COMFY_API_KEY;
afterEach(() => { mock.restoreAll(); if (originalKey === undefined) delete process.env.COMFY_API_KEY; else process.env.COMFY_API_KEY = originalKey; });

async function photo() {
  const buffer = await sharp({ create: { width: 120, height: 180, channels: 3, background: "#806040" } }).png().toBuffer();
  return new File([new Uint8Array(buffer)], "model.png", { type: "image/png" });
}

async function form(parts: unknown) {
  const value = new FormData();
  value.set("photo", await photo());
  value.set("parts", JSON.stringify(parts));
  return value;
}

test("accepts the complete outfit or distinct known parts only", () => {
  assert.equal(parseFlatlaySelection(JSON.stringify("complete")), "complete");
  assert.deepEqual(parseFlatlaySelection(JSON.stringify(["tops", "shoes"])), ["tops", "shoes"]);
  for (const bad of [[], ["tops", "tops"], ["hats"], "everything", { tops: true }]) {
    assert.throws(() => parseFlatlaySelection(JSON.stringify(bad)), /complete outfit|selection is invalid/);
  }
  assert.throws(() => parseFlatlaySelection(null));
});

test("builds a white-background flat lay prompt for only the chosen parts", async () => {
  const single = await buildFlatlayInput(await form(["tops"]));
  assert.equal(single.image.length, 1);
  assert.match(single.image[0], /^data:image\/jpeg;base64,/);
  assert.match(single.prompt, /only: the top/);
  assert.doesNotMatch(single.prompt, /the shoes/);
  assert.match(single.prompt, /Leave out every item that was not requested/);
  assert.match(single.prompt, /pure white \(#FFFFFF\) background/);
  assert.equal(single.size, "1024x1536");
  const large = await form(["tops"]);
  large.set("size", "4k");
  assert.equal((await buildFlatlayInput(large)).size, "2336x3520");
  assert.equal(single.background, "opaque");

  const complete = await buildFlatlayInput(await form("complete"));
  assert.match(complete.prompt, /every garment, the shoes and every accessory/);
  assert.doesNotMatch(complete.prompt, /not requested/);
});

test("HTTP handlers complete photo + parts -> queued ticket -> status -> flat lay", async () => {
  process.env.COMFY_API_KEY = "test-private-key";
  const output = (await sharp({ create: { width: 100, height: 150, channels: 3, background: "#ffffff" } }).png().toBuffer()).toString("base64");
  const calls: { url: string; init?: RequestInit }[] = [];
  const responses = [
    Response.json({ request_id: "flat-1", status: "IN_QUEUE" }, { status: 201 }),
    Response.json({ status: "COMPLETED" }),
    Response.json({ data: [{ b64_json: output }], output_format: "png" }),
  ];
  mock.method(globalThis, "fetch", (async (url: string, init?: RequestInit) => { calls.push({ url: String(url), init }); return responses.shift()!; }) as typeof fetch);

  const headers = { Origin: "http://localhost", "Idempotency-Key": "12345678-1234-1234-1234-123456789abc" };
  const rejected = await flatlay(new Request("http://localhost/api/flatlay", { method: "POST", headers, body: await form([]) }));
  assert.equal(rejected.status, 400);
  assert.equal(calls.length, 0);

  const response = await flatlay(new Request("http://localhost/api/flatlay", { method: "POST", headers, body: await form(["tops", "bottoms"]) }));
  assert.equal(response.status, 202);
  assert.equal(calls[0].url, "https://api.comfy.org/v2/models/openai/gpt-image-2.5-sunburst/requests");
  assert.match(JSON.parse(String(calls[0].init?.body)).prompt, /the top .*; the bottoms/);
  const { token } = await response.json();
  const result = await (await poll(new Request("http://localhost/api/generate/ticket"), { params: Promise.resolve({ token }) })).json();
  assert.equal(result.status, "succeeded");
  assert.equal(result.image, `data:image/png;base64,${output}`);
});

test("saves a single extracted part to its own category and everything else as an outfit", () => {
  assert.equal(flatlayCategory(["tops"]), "tops");
  assert.equal(flatlayCategory(["shoes"]), "shoes");
  assert.equal(flatlayCategory(["tops", "bottoms"]), "outfit");
  assert.equal(flatlayCategory("complete"), "outfit");
});

test("passes the chosen quality tier and rejects unknown ones", async () => {
  const value = await form(["tops"]);
  assert.equal((await buildFlatlayInput(value)).quality, "high");
  value.set("quality", "max");
  assert.equal((await buildFlatlayInput(value)).quality, "max");
  value.set("quality", "hd");
  await assert.rejects(buildFlatlayInput(value), /Unknown image quality/);
});
