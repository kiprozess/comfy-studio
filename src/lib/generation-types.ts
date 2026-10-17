import type { CategoryId } from "./styling-categories";
import type { DemoOutfitId } from "./demo-outfits";

export type GenerationSelection = {
  category: CategoryId;
  demoOutfit?: DemoOutfitId;
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
