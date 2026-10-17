import { isAppRequest } from "@/lib/server/request-origin";
import { consumeSubmissionBudget } from "@/lib/server/request-access";
import { GenerationError } from "@/lib/server/generation-input";
import { parseUpscaleRequest, upscaleOptions } from "@/lib/server/upscale-input";
import { getComfyKey, submitGeneration } from "@/lib/server/comfy-router";
import { submitWorkflowUpscale, type Seedvr2Resolution } from "@/lib/server/comfy-cloud";

export const runtime = "nodejs";
export const maxDuration = 60;
const headers = { "Cache-Control": "no-store" };

// Status and result are read through /api/generate/[token]; the ticket names the model that runs the job.
export async function POST(request: Request) {
  try {
    if (!isAppRequest(request)) {
      throw new GenerationError("Please start upscaling from this app.", 403);
    }
    const blocked = await consumeSubmissionBudget();
    if (blocked) return blocked;
    const key = getComfyKey();
    const idempotencyKey = request.headers.get("idempotency-key");
    if (!idempotencyKey || !/^[0-9a-f-]{36}$/i.test(idempotencyKey)) throw new GenerationError("Missing upscale request ID.");
    const options = upscaleOptions();
    const input = await parseUpscaleRequest(request, options.resolutions);
    const submission = options.provider === "seedvr2"
      ? await submitWorkflowUpscale(input.bytes, input.contentType, input.resolution as Seedvr2Resolution, idempotencyKey, key)
      : await submitGeneration({ image: input.image, target_resolution: input.resolution, output_format: "jpeg", enable_base64_output: true }, idempotencyKey, key, fetch, "upscale");
    return Response.json(submission, { status: 202, headers });
  } catch (error) {
    return Response.json({ error: error instanceof GenerationError ? error.message : "The upscale could not be started." }, { status: error instanceof GenerationError ? error.status : 500, headers });
  }
}
