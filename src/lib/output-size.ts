// Try-on output size. "auto" lets GPT Image pick (about 1.5 MP in the photo's aspect ratio);
// 2K and 4K request explicit dimensions in the photo's aspect ratio. Experimental: the model's
// documentation names no bounds, so the limits below follow GPT Image's usual ones.
export const OUTPUT_SIZES = [
  { id: "auto", label: "Auto", hint: "Model decides, about 1.5 MP" },
  { id: "2k", label: "2K", hint: "Longer edge 2048 px" },
  { id: "4k", label: "4K", hint: "Longer edge up to 3840 px" },
] as const;

export type OutputSize = (typeof OUTPUT_SIZES)[number]["id"];
export const DEFAULT_OUTPUT_SIZE: OutputSize = "auto";

const LONG_EDGE = { "2k": 2048, "4k": 3840 } as const;
const MAX_PIXELS = 3840 * 2160;

/** Flat lays keep a fixed 2:3 portrait; "auto" there means the original 1024x1536. */
export const FLATLAY_BASE = { width: 1024, height: 1536 } as const;

export function resolveFlatlaySize(size: OutputSize) {
  return size === "auto" ? `${FLATLAY_BASE.width}x${FLATLAY_BASE.height}` : resolveOutputSize(size, FLATLAY_BASE.width, FLATLAY_BASE.height);
}

export function isOutputSize(value: unknown): value is OutputSize {
  return OUTPUT_SIZES.some(({ id }) => id === value);
}

/** Model `size` value for a photo of width × height: "auto", or "<w>x<h>" with edges divisible by 16. */
export function resolveOutputSize(size: OutputSize, width: number, height: number) {
  if (size === "auto") return "auto";
  const ratio = width / height;
  let w = ratio >= 1 ? LONG_EDGE[size] : LONG_EDGE[size] * ratio;
  let h = ratio >= 1 ? LONG_EDGE[size] / ratio : LONG_EDGE[size];
  if (w * h > MAX_PIXELS) {
    const scale = Math.sqrt(MAX_PIXELS / (w * h));
    w *= scale;
    h *= scale;
  }
  const snap = (value: number) => Math.max(16, Math.floor(value / 16) * 16);
  return `${snap(w)}x${snap(h)}`;
}
