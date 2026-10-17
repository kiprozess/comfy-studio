import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { DEMO_OUTFITS } from "../src/lib/demo-outfits";
import { buildGenerationInput, parseSelections } from "../src/lib/server/generation-input";

async function form(id: string) {
  const photo = await sharp({ create: { width: 120, height: 180, channels: 3, background: "#806040" } }).png().toBuffer();
  const value = new FormData();
  value.set("photo", new File([new Uint8Array(photo)], "person.png", { type: "image/png" }));
  value.set("selections", JSON.stringify([{ category: "outfit", demoOutfit: id }]));
  return value;
}

test("the approved lookbook offers 16 unique outfits split across two collections", () => {
  assert.equal(DEMO_OUTFITS.length, 16);
  assert.equal(new Set(DEMO_OUTFITS.map(({ id }) => id)).size, 16);
  assert.deepEqual(DEMO_OUTFITS.map(({ tile }) => tile), Array.from({ length: 16 }, (_, i) => i));
  assert.equal(DEMO_OUTFITS.filter(({ gender }) => gender === "male").length, 8);
  assert.equal(DEMO_OUTFITS.filter(({ gender }) => gender === "female").length, 8);
  for (const outfit of DEMO_OUTFITS) {
    assert.equal(parseSelections(JSON.stringify([{ category: "outfit", demoOutfit: outfit.id }]))[0].demoOutfit, outfit.id);
  }
});

test("only the selected first/last lookbook cell is sent with the original person, never the whole grid", async () => {
  const first = await buildGenerationInput(await form("olive-denim"));
  const last = await buildGenerationInput(await form("cream-pleats"));
  const metadata = await sharp("public/images/demo-outfits.png").metadata();
  assert.notEqual(first.image[1], last.image[1]);
  for (const [input, tile] of [[first, 0], [last, 15]] as const) {
    assert.equal(input.image.length, 2);
    const bytes = Buffer.from(input.image[1].split(",")[1], "base64");
    const crop = await sharp(bytes).metadata();
    assert.ok(crop.width! < metadata.width! / 2);
    assert.ok(crop.height! < metadata.height! / 2);
    // Independently compare a central patch against its actual source cell.
    const cellX = tile === 0 ? 0 : Math.round(metadata.width! * 3 / 4);
    const cellY = tile === 0 ? 0 : Math.round(metadata.height! * 3 / 4);
    const patch = { left: Math.floor(crop.width! / 2) - 20, top: Math.floor(crop.height! / 3) - 20, width: 40, height: 40 };
    const expected = await sharp("public/images/demo-outfits.png").extract({ ...patch, left: cellX + patch.left, top: cellY + patch.top }).removeAlpha().raw().toBuffer();
    const actual = await sharp(bytes).extract(patch).removeAlpha().raw().toBuffer();
    const meanError = actual.reduce((sum, value, index) => sum + Math.abs(value - expected[index]), 0) / actual.length;
    assert.ok(meanError < 5, `Wrong cell or altered crop: error ${meanError}`);
    assert.match(input.prompt, /Image 2 is the outfit reference/);
  }
});

test("unknown, misplaced and conflicting demo references are rejected", async () => {
  for (const selections of [
    [{ category: "outfit", demoOutfit: "../../secret" }],
    [{ category: "outfit", demoOutfit: 0 }],
    [{ category: "tops", demoOutfit: "olive-denim" }],
    [{ category: "outfit", demoOutfit: "olive-denim", color: "#ffffff" }],
  ]) assert.throws(() => parseSelections(JSON.stringify(selections)));
  const value = await form("olive-denim");
  value.set("reference-outfit", value.get("photo")!);
  await assert.rejects(buildGenerationInput(value), /either a demo outfit or an uploaded outfit/);
});
