import { isAppRequest } from "@/lib/server/request-origin";
import { consumeSubmissionBudget } from "@/lib/server/request-access";
import { GenerationError, readGenerationForm } from "@/lib/server/generation-input";
import { buildPoseInput } from "@/lib/server/pose-input";
import { getComfyKey, submitGeneration } from "@/lib/server/comfy-router";

export const runtime = "nodejs";
export const maxDuration = 60;
const headers = { "Cache-Control": "no-store" };

// Same model and queue as /api/generate, so status and result come from /api/generate/[token].
export async function POST(request: Request) {
  try {
    if (!isAppRequest(request)) {
      throw new GenerationError("Please start the pose from this app.", 403);
    }
    const blocked = await consumeSubmissionBudget();
    if (blocked) return blocked;
    const key = getComfyKey();
    const idempotencyKey = request.headers.get("idempotency-key");
    if (!idempotencyKey || !/^[0-9a-f-]{36}$/i.test(idempotencyKey)) throw new GenerationError("Missing pose request ID.");
    const input = await buildPoseInput(await readGenerationForm(request));
    return Response.json(await submitGeneration(input, idempotencyKey, key), { status: 202, headers });
  } catch (error) {
    return Response.json({ error: error instanceof GenerationError ? error.message : "The pose could not be started." }, { status: error instanceof GenerationError ? error.status : 500, headers });
  }
}
