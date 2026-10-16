import { randomInt } from "node:crypto";
import { decodeImage, readTicket, signJob } from "./comfy-router";
import { GenerationError } from "./generation-input";
import type { GenerationUpdate } from "../generation-types";
import seedvr2Workflow from "./workflows/seedvr2-upscale.json";

// Comfy API v2 on Comfy Cloud runs our own SeedVR2 workflow (src/lib/server/workflows).
const cloudBase = "https://cloud.comfy.org/api/v2";
const INPUT_NODE = "9";
const UPSCALER_NODE = "2";
const OUTPUT_NODE = "5";
type Fetcher = typeof fetch;

// SeedVR2 `resolution` is the shortest edge, `max_resolution` caps the longest one.
export const SEEDVR2_RESOLUTIONS = { "2k": { resolution: 2048, max_resolution: 4096 }, "4k": { resolution: 4096, max_resolution: 4096 } } as const;
export type Seedvr2Resolution = keyof typeof SEEDVR2_RESOLUTIONS;

type CloudJob = {
  id?: string;
  status?: "queued" | "running" | "succeeded" | "canceling" | "canceled" | "failed" | "expired";
  queue_position?: number | null;
  progress?: { value?: number } | null;
  outputs?: { node_id?: string; type?: string; url?: string }[];
  error?: { code?: string; message?: string; class_type?: string | null } | null;
};

function cloudError(status: number, code?: string): GenerationError {
  if (status === 401 || status === 403) return new GenerationError("Comfy Cloud rejected the API key. Workflow access needs a paid Comfy Cloud plan.", 502);
  if (status === 402 || code === "insufficient_credits") return new GenerationError("The Comfy Cloud workspace has run out of credits.", 502);
  if (status === 429) return new GenerationError("Comfy Cloud is busy. Please wait before trying again.", 429);
  if (code === "idempotency_key_reuse") return new GenerationError("This upscale was already submitted. Check the history before starting another one.", 409);
  if (code === "invalid_workflow" || code === "missing_asset") return new GenerationError("Comfy Cloud could not run the upscale workflow.", 502);
  return new GenerationError(`Comfy Cloud could not complete the upscale${code ? ` (${code})` : ""}. Please try again later.`, 502);
}

async function cloudFetch(path: string, key: string, init: RequestInit = {}, fetcher: Fetcher = fetch) {
  let response: Response;
  try {
    response = await fetcher(`${cloudBase}${path}`, { ...init, headers: { Authorization: `Bearer ${key}`, ...init.headers }, cache: "no-store", signal: AbortSignal.timeout(55_000) });
  } catch { throw new GenerationError("The connection to Comfy Cloud was interrupted. Check the history before starting another upscale.", 504); }
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: { code?: string; message?: string } } | null;
    // Server log only: Comfy's code and message explain a failure without exposing the key.
    console.error(`Comfy Cloud ${init.method ?? "GET"} ${path} failed: ${response.status} ${body?.error?.code ?? ""} ${body?.error?.message ?? ""}`.trim());
    throw cloudError(response.status, body?.error?.code);
  }
  return response;
}

export function buildSeedvr2Workflow(assetId: string, resolution: Seedvr2Resolution, seed = randomInt(0, 2 ** 32)) {
  const workflow = structuredClone(seedvr2Workflow) as Record<string, { inputs: Record<string, unknown> }>;
  workflow[INPUT_NODE].inputs.image = { __type: "core/ASSET", info: { id: assetId } };
  Object.assign(workflow[UPSCALER_NODE].inputs, SEEDVR2_RESOLUTIONS[resolution], { seed });
  return workflow;
}

// Uploads the image as a Cloud asset, then submits the workflow that reads it.
export async function submitWorkflowUpscale(image: Buffer, contentType: string, resolution: Seedvr2Resolution, idempotencyKey: string, key: string, fetcher: Fetcher = fetch) {
  // Comfy Cloud reads the fields in order: content_type must precede the file, and tags is a JSON array.
  const fileName = `upscale-input.${contentType === "image/jpeg" ? "jpg" : contentType.split("/")[1]}`;
  const upload = new FormData();
  upload.set("content_type", contentType);
  upload.set("file_path", fileName);
  upload.set("tags", JSON.stringify(["input"]));
  upload.set("expires_in", String(24 * 60 * 60));
  upload.set("file", new Blob([new Uint8Array(image)], { type: contentType }), fileName);
  const asset = await (await cloudFetch("/assets", key, { method: "POST", body: upload }, fetcher)).json() as { id?: string };
  if (!asset.id) throw new GenerationError("Comfy Cloud did not accept the image to upscale.", 502);

  const response = await cloudFetch("/jobs", key, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({ workflow: buildSeedvr2Workflow(asset.id, resolution) }),
  }, fetcher);
  const job = await response.json() as CloudJob;
  if (!job.id || !/^[a-zA-Z0-9_-]{1,128}$/.test(job.id)) throw new GenerationError("Comfy Cloud did not return a valid job ID.", 502);
  return { token: signJob(job.id, key, Date.now(), "workflow"), status: "queued" as const, queuePosition: job.queue_position ?? undefined };
}

export async function readWorkflowJob(token: string, key: string, fetcher: Fetcher = fetch): Promise<GenerationUpdate> {
  const { id, model } = readTicket(token, key);
  if (model !== "workflow") throw new GenerationError("This generation link is invalid or has expired.", 404);
  const job = await (await cloudFetch(`/jobs/${encodeURIComponent(id)}`, key, {}, fetcher)).json() as CloudJob;
  if (job.status === "queued") return { status: "queued", queuePosition: job.queue_position ?? undefined, retryAfter: 3 };
  if (job.status === "running" || job.status === "canceling") return { status: "running", progress: job.progress?.value ?? undefined, retryAfter: 3 };
  if (job.status === "canceled") return { status: "failed", error: "The upscale was cancelled." };
  if (job.status === "expired") return { status: "failed", error: "This upscale is no longer available on Comfy Cloud." };
  if (job.status === "failed") {
    const node = job.error?.class_type ? ` (${job.error.class_type})` : "";
    return { status: "failed", error: `The upscale workflow failed on Comfy Cloud${node}.` };
  }
  if (job.status !== "succeeded") throw new GenerationError("Comfy Cloud returned an unknown job status.", 502);
  const output = job.outputs?.find((item) => item.node_id === OUTPUT_NODE && item.type === "image") ?? job.outputs?.find((item) => item.type === "image");
  if (!output?.url?.startsWith("https://")) throw new GenerationError("Comfy Cloud did not return the upscaled image.", 502);
  // The content endpoint needs the key and redirects to a short-lived signed URL; the server downloads it once.
  // The key is only ever sent to Comfy Cloud itself, never to another host named in a response.
  const headers = new URL(output.url).origin === new URL(cloudBase).origin ? { Authorization: `Bearer ${key}` } : undefined;
  return { status: "succeeded", image: await decodeImage(output.url, "workflow", fetcher, headers) };
}
