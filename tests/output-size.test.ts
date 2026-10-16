import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { resolveOutputSize } from "../src/lib/output-size";
import { buildGenerationInput } from "../src/lib/server/generation-input";

test("keeps the photo's aspect ratio, snaps to multiples of 16 and caps 4K at 3840x2160 pixels", () => {
  assert.equal(resolveOutputSize("auto", 900, 1200), "auto");
  assert.equal(resolveOutputSize("2k", 900, 1200), "1536x2048");
  assert.equal(resolveOutputSize("2k", 1600, 900), "2048x1152");
  assert.equal(resolveOutputSize("4k", 1920, 1080), "3840x2160");
  assert.equal(resolveOutputSize("4k", 900, 1200), "2480x3312");
  for (const [w, h] of [[900, 1200], [1080, 1920], [1000, 1000], [3000, 1000]]) {
    const [x, y] = resolveOutputSize("4k", w, h).split("x").map(Number);
    assert.equal(x % 16, 0);
    assert.equal(y % 16, 0);
    assert.ok(x * y <= 3840 * 2160);
    assert.ok(Math.max(x, y) <= 3840);
  }
});

test("sends the resolved size for try-on and rejects unknown sizes", async () => {
  const form = new FormData();
  const photo = await sharp({ create: { width: 300, height: 400, channels: 3, background: "#806040" } }).png().toBuffer();
  form.set("photo", new File([new Uint8Array(photo)], "p.png", { type: "image/png" }));
  form.set("selections", JSON.stringify([{ category: "outfit", presetIndex: 0 }]));
  assert.equal((await buildGenerationInput(form)).size, "auto");
  form.set("size", "2k");
  assert.equal((await buildGenerationInput(form)).size, "1536x2048");
  form.set("size", "8k");
  await assert.rejects(buildGenerationInput(form), /Unknown output size/);
});

test("flat lays keep a 2:3 portrait at every output size", async () => {
  const { resolveFlatlaySize } = await import("../src/lib/output-size");
  assert.equal(resolveFlatlaySize("auto"), "1024x1536");
  assert.equal(resolveFlatlaySize("2k"), "1360x2048");
  assert.equal(resolveFlatlaySize("4k"), "2336x3520");
});
