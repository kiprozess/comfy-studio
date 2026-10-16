// GPT Image 2.5 Sunburst quality tiers. Higher tiers take longer and cost more credits per image.
// The schema also lists "standard" and "hd", which are DALL·E-era spellings this model does not read.
export const QUALITIES = [
  { id: "low", label: "Low", hint: "Fastest drafts" },
  { id: "medium", label: "Med", hint: "Balanced" },
  { id: "high", label: "High", hint: "Default" },
  { id: "xhigh", label: "XHigh", hint: "More detail" },
  { id: "max", label: "Max", hint: "Best, slowest" },
] as const;

export type Quality = (typeof QUALITIES)[number]["id"];
export const DEFAULT_QUALITY: Quality = "high";

export function isQuality(value: unknown): value is Quality {
  return QUALITIES.some(({ id }) => id === value);
}
