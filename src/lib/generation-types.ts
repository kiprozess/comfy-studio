import type { CategoryId } from "./styling-categories";

export type GenerationSelection = {
  category: CategoryId;
  color?: string;
  pose?: number;
};

export type GenerationUpdate = {
  status: "queued" | "running" | "succeeded" | "failed";
  queuePosition?: number;
  /** 0–1, reported by Comfy Cloud workflow jobs while they run. */
  progress?: number;
  retryAfter?: number;
  image?: string;
  error?: string;
};
