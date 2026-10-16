import { createHmac, timingSafeEqual } from "node:crypto";
import sharp from "sharp";
import { GenerationError } from "./generation-input";
import type { GenerationUpdate } from "../generation-types";

export type JobModel = "generate" | "upscale" | "workflow";
// "workflow" jobs run on Comfy Cloud (comfy-cloud.ts); the other two go through Comfy Router.
const endpoints: Record<Exclude<JobModel, "workflow">, string> = {
  generate: "https://api.comfy.org/v2/models/openai/gpt-image-2.5-sunburst/requests",
  upscale: "https://api.comfy.org/v2/models/wavespeed/ultimate-image-upscaler/requests",
};
// Upscaled 8K output is far larger than a generated image.
const outputLimits: Record<JobModel, { base64: number; pixels: number }> = {
  generate: { base64: 48 * 1024 * 1024, pixels: 40_000_000 },
  upscale: { base64: 96 * 1024 * 1024, pixels: 100_000_000 },
  workflow: { base64: 96 * 1024 * 1024, pixels: 100_000_000 },
};
type Fetcher = typeof fetch;
type RouterStatus = { request_id?: string; status?: string; queue_position?: number; error_type?: string };

export function getComfyKey() {
  const key = process.env.COMFY_API_KEY?.trim();
  if (!key) throw new GenerationError("Generation is not configured. Add COMFY_API_KEY to the server's .env.local file.", 503);
  return key;
}

export function signJob(requestId: string, key: string, now = Date.now(), model: JobModel = "generate") {
  // Generation tickets keep their original shape; only upscale tickets name their model.
  const data = { id: requestId, expires: now + 24 * 60 * 60 * 1000, ...(model !== "generate" ? { model } : {}) };
  const payload = Buffer.from(JSON.stringify(data)).toString("base64url");
  return `${payload}.${createHmac("sha256", key).update(payload).digest("base64url")}`;
}

export function verifyJob(token: string, key: string, now = Date.now()): string {
  return readTicket(token, key, now).id;
}

export function readTicket(token: string, key: string, now = Date.now()): { id: string; model: JobModel } {
  try {
    if (token.length > 1024) throw new Error();
    const [payload, signature, extra] = token.split(".");
    if (!payload || !signature || extra) throw new Error();
    const expected = createHmac("sha256", key).update(payload).digest();
    const supplied = Buffer.from(signature, "base64url");
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) throw new Error();
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (typeof data.id !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(data.id) || typeof data.expires !== "number" || data.expires <= now) throw new Error();
    if (data.model !== undefined && data.model !== "upscale" && data.model !== "workflow") throw new Error();
    return { id: data.id, model: data.model ?? "generate" };
  } catch { throw new GenerationError("This generation link is invalid or has expired.", 404); }
}

function providerError(status: number, errorType?: string): GenerationError {
  if (status === 401 || status === 403) return new GenerationError("Comfy rejected the API key or this model is not enabled for the workspace.", 502);
  if (status === 402 || /credit|balance|budget/i.test(errorType ?? "")) return new GenerationError("The Comfy workspace has insufficient credits or has reached its spending limit.", 502);
  if (status === 429) return new GenerationError("Comfy is busy. Please wait before trying again.", 429);
  if (/cancel/i.test(errorType ?? "")) return new GenerationError("The generation was cancelled.", 422);
  if (/moderation|safety|content_policy/i.test(errorType ?? "")) return new GenerationError("The image request was declined by the model's content checks.", 422);
  return new GenerationError(status === 400 || status === 422 ? "Comfy could not process these images. Please try different references." : "Comfy could not complete the generation. Please try again later.", 502);
}

async function routerFetch(url: string, key: string, init: RequestInit = {}, fetcher: Fetcher = fetch) {
  let response: Response;
  try {
    response = await fetcher(url, { ...init, headers: { "X-API-Key": key, ...init.headers }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(55_000) });
  } catch { throw new GenerationError("The connection to Comfy was interrupted. Check the job status before starting another generation.", 504); }
  if (!response.ok) throw providerError(response.status, response.headers.get("X-Comfy-Error-Type") ?? undefined);
  return response;
}

export async function submitGeneration(input: unknown, idempotencyKey: string, key: string, fetcher: Fetcher = fetch, model: Exclude<JobModel, "workflow"> = "generate") {
  const response = await routerFetch(endpoints[model], key, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey }, body: JSON.stringify(input) }, fetcher);
  const result = await response.json() as RouterStatus;
  if (!result.request_id || !/^[a-zA-Z0-9_-]{1,128}$/.test(result.request_id)) throw new GenerationError("Comfy did not return a valid generation ID.", 502);
  return { token: signJob(result.request_id, key, Date.now(), model), status: "queued" as const, queuePosition: result.queue_position };
}

export async function decodeImage(value: string | undefined, model: JobModel, fetcher: Fetcher, headers?: Record<string, string>) {
  const limits = outputLimits[model];
  let bytes: Buffer;
  if (value && /^https:\/\//.test(value)) {
    // Upscaler links are the provider's own and expire, so they are fetched once and returned inline.
    let response: Response;
    try {
      response = await fetcher(value, { headers, cache: "no-store", signal: AbortSignal.timeout(55_000) });
    } catch { throw new GenerationError("The finished image could not be downloaded from Comfy.", 502); }
    const length = Number(response.headers.get("Content-Length"));
    if (!response.ok || length > limits.base64) throw new GenerationError("The finished image could not be downloaded from Comfy.", 502);
    bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > limits.base64) throw new GenerationError("The finished image could not be downloaded from Comfy.", 502);
  } else {
    const base64 = value?.replace(/^data:image\/[a-z]+;base64,/, "");
    if (!base64 || base64.length > limits.base64 || !/^[A-Za-z0-9+/=\r\n]+$/.test(base64)) {
      throw new GenerationError("Comfy did not return the requested image data.", 502);
    }
    bytes = Buffer.from(base64, "base64");
  }
  let format: string;
  try {
    const metadata = await sharp(bytes, { limitInputPixels: limits.pixels }).metadata();
    if (!metadata.width || !metadata.height || !["png", "jpeg", "webp"].includes(metadata.format ?? "")) throw new Error();
    format = metadata.format!;
  } catch { throw new GenerationError("Comfy returned image data that could not be opened.", 502); }
  const mime = format === "jpeg" ? "image/jpeg" : format === "webp" ? "image/webp" : "image/png";
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

export async function readGeneration(token: string, key: string, fetcher: Fetcher = fetch): Promise<GenerationUpdate> {
  const { id: requestId, model } = readTicket(token, key);
  if (model === "workflow") throw new GenerationError("This generation link is invalid or has expired.", 404);
  const url = `${endpoints[model]}/${encodeURIComponent(requestId)}`;
  const statusResponse = await routerFetch(`${url}/status`, key, {}, fetcher);
  const status = await statusResponse.json() as RouterStatus;
  if (status.error_type) return { status: "failed", error: providerError(502, status.error_type).message };
  const retryAfter = Math.min(15, Math.max(2, Number(statusResponse.headers.get("Retry-After")) || 3));
  if (status.status === "IN_QUEUE") return { status: "queued", queuePosition: status.queue_position, retryAfter };
  if (status.status === "IN_PROGRESS") return { status: "running", retryAfter };
  if (status.status !== "COMPLETED") throw new GenerationError("Comfy returned an unknown generation status.", 502);
  const outputResponse = await routerFetch(url, key, {}, fetcher);
  if (outputResponse.status === 202) return { status: "running", retryAfter };
  const output = await outputResponse.json() as {
    data?: { b64_json?: string }[] | { outputs?: string[]; error?: string };
    output_format?: string;
    error_type?: string;
  };
  if (output.error_type) return { status: "failed", error: providerError(502, output.error_type).message };
  if (model === "upscale") {
    const result = Array.isArray(output.data) ? undefined : output.data;
    if (result?.error) return { status: "failed", error: "Comfy could not upscale this image. Please try again later." };
    return { status: "succeeded", image: await decodeImage(result?.outputs?.[0], model, fetcher) };
  }
  const first = Array.isArray(output.data) ? output.data[0] : undefined;
  return { status: "succeeded", image: await decodeImage(first?.b64_json, model, fetcher) };
}
