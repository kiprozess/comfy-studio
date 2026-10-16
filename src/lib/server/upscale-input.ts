import sharp from "sharp";
import { GenerationError } from "./generation-input";

export type UpscaleResolution = "2k" | "4k" | "8k";
const MAX_BODY_BYTES = 40 * 1024 * 1024;

// The Ultimate Image Upscaler runs on Router credits. COMFY_UPSCALER=seedvr2 runs our own SeedVR2
// workflow on Comfy Cloud instead, which needs a paid Comfy Cloud plan.
export function upscaleOptions() {
  return process.env.COMFY_UPSCALER?.trim() === "seedvr2"
    ? { provider: "seedvr2" as const, name: "SeedVR2 on Comfy Cloud", resolutions: ["2k", "4k"] as UpscaleResolution[] }
    : { provider: "router" as const, name: "Ultimate Image Upscaler", resolutions: ["2k", "4k", "8k"] as UpscaleResolution[] };
}

async function readBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new GenerationError("No image received.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new GenerationError("The image to upscale must be smaller than 30 MB.", 413);
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks).toString("utf8");
}

// Validates the generated image the browser sends back before it is forwarded to an upscaler.
export async function parseUpscaleRequest(request: Request, allowed: UpscaleResolution[]) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new GenerationError("Please send the image to upscale as JSON.");
  let body: { image?: unknown; resolution?: unknown };
  try { body = JSON.parse(await readBody(request)); } catch (error) {
    if (error instanceof GenerationError) throw error;
    throw new GenerationError("The upscale request could not be read.");
  }
  const resolution = body.resolution;
  if (typeof resolution !== "string" || !allowed.includes(resolution as UpscaleResolution)) {
    throw new GenerationError(`Choose ${allowed.map((value) => value.toUpperCase()).join(" or ")}.`);
  }
  const match = typeof body.image === "string" ? /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(body.image) : null;
  if (!match) throw new GenerationError("Only a generated PNG, JPEG or WebP image can be upscaled.");
  const bytes = Buffer.from(match[2], "base64");
  try {
    const metadata = await sharp(bytes, { limitInputPixels: 40_000_000, animated: true }).metadata();
    if (!metadata.width || !metadata.height || (metadata.pages ?? 1) !== 1 || metadata.format !== match[1]) throw new Error();
  } catch { throw new GenerationError("The image to upscale could not be opened."); }
  return { image: body.image as string, bytes, contentType: `image/${match[1]}`, resolution: resolution as UpscaleResolution };
}
