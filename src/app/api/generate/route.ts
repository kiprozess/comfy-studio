import { buildGenerationInput, GenerationError, readGenerationForm } from "@/lib/server/generation-input";
import { getComfyKey, submitGeneration } from "@/lib/server/comfy-router";
import { upscaleOptions } from "@/lib/server/upscale-input";

export const runtime = "nodejs";
export const maxDuration = 60;
const headers = { "Cache-Control": "no-store" };

export function GET() {
  const { name, resolutions } = upscaleOptions();
  return Response.json({ configured: Boolean(process.env.COMFY_API_KEY?.trim()), model: "GPT Image 2.5 Sunburst", upscaler: { name, resolutions } }, { headers });
}

export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    if ((origin && origin !== new URL(request.url).origin) || request.headers.get("sec-fetch-site") === "cross-site") {
      throw new GenerationError("Please start generation from this app.", 403);
    }
    const key = getComfyKey();
    const idempotencyKey = request.headers.get("idempotency-key");
    if (!idempotencyKey || !/^[0-9a-f-]{36}$/i.test(idempotencyKey)) throw new GenerationError("Missing generation request ID.");
    const input = await buildGenerationInput(await readGenerationForm(request));
    return Response.json(await submitGeneration(input, idempotencyKey, key), { status: 202, headers });
  } catch (error) {
    return Response.json({ error: error instanceof GenerationError ? error.message : "The generation could not be started." }, { status: error instanceof GenerationError ? error.status : 500, headers });
  }
}
