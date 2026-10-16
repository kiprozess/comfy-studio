import { afterEach, test, mock } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { buildPoseInput } from "../src/lib/server/pose-input";
import { POST as pose } from "../src/app/api/pose/route";

const originalKey = process.env.COMFY_API_KEY;
afterEach(() => { mock.restoreAll(); if (originalKey === undefined) delete process.env.COMFY_API_KEY; else process.env.COMFY_API_KEY = originalKey; });

async function form() {
  const value = new FormData();
  const buffer = await sharp({ create: { width: 160, height: 120, channels: 3, background: "#806040" } }).png().toBuffer();
  value.set("photo", new File([new Uint8Array(buffer)], "person.png", { type: "image/png" }));
  return value;
}

test("poses keep the photo's aspect ratio, like try-on", async () => {
  const value = await form();
  assert.equal((await buildPoseInput(value)).size, "auto");
  value.set("size", "2k");
  assert.equal((await buildPoseInput(value)).size, "2048x1536");
});

test("sends the photo first and the library mannequin as style reference", async () => {
  const value = await form();
  value.set("size", "2k");
  value.set("quality", "max");
  const input = await buildPoseInput(value);
  assert.equal(input.image.length, 2);
  const style = await sharp(Buffer.from(input.image[1].split(",")[1], "base64")).metadata();
  const mannequin = await sharp("public/images/poses/mannequin-standing.webp").metadata();
  assert.equal(style.width, mannequin.width);
  assert.match(input.prompt, /Keep image 1's exact framing and crop/);
  assert.match(input.prompt, /if the photo ends at the thighs, the mannequin ends at the thighs/);
  assert.match(input.prompt, /From image 2 take only the look of the mannequin, not its framing or pose/);
  assert.equal(input.size, "2048x1536");
  assert.equal(input.quality, "max");
});

test("pose route validates the photo before submitting to the Sunburst queue", async () => {
  process.env.COMFY_API_KEY = "test-private-key";
  const calls: string[] = [];
  mock.method(globalThis, "fetch", (async (url: string) => { calls.push(String(url)); return Response.json({ request_id: "pose-1", status: "IN_QUEUE" }, { status: 201 }); }) as typeof fetch);
  const headers = { Origin: "http://localhost", "Idempotency-Key": "12345678-1234-1234-1234-123456789abc" };
  const empty = new FormData();
  empty.set("quality", "high");
  assert.equal((await pose(new Request("http://localhost/api/pose", { method: "POST", headers, body: empty }))).status, 400);
  assert.equal(calls.length, 0);
  const response = await pose(new Request("http://localhost/api/pose", { method: "POST", headers, body: await form() }));
  assert.equal(response.status, 202);
  assert.equal(calls[0], "https://api.comfy.org/v2/models/openai/gpt-image-2.5-sunburst/requests");
});
