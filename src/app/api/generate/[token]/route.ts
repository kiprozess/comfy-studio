import { getComfyKey, readGeneration, readTicket } from "@/lib/server/comfy-router";
import { readWorkflowJob } from "@/lib/server/comfy-cloud";
import { GenerationError } from "@/lib/server/generation-input";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const key = getComfyKey();
    const update = readTicket(token, key).model === "workflow" ? await readWorkflowJob(token, key) : await readGeneration(token, key);
    return Response.json(update, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof GenerationError ? error.message : "The generation status could not be loaded." }, { status: error instanceof GenerationError ? error.status : 500, headers: { "Cache-Control": "no-store" } });
  }
}
