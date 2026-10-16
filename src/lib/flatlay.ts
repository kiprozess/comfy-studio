// Garment groups a flat lay can extract; shared by the sidebar, the request and the server prompt.
export const FLATLAY_PARTS = [
  { id: "outerwear", label: "Outerwear", prompt: "the outerwear (jacket, coat or similar top layer)" },
  { id: "tops", label: "Tops", prompt: "the top (shirt, t-shirt, sweater, knitwear or blouse)" },
  { id: "bottoms", label: "Bottoms", prompt: "the bottoms (trousers, jeans, shorts or skirt)" },
  { id: "socks", label: "Socks", prompt: "the socks" },
  { id: "shoes", label: "Shoes", prompt: "the shoes, as a pair" },
  { id: "accessories", label: "Accessories", prompt: "the accessories (bag, belt, hat, jewellery, glasses or similar)" },
] as const;

export type FlatlayPart = (typeof FLATLAY_PARTS)[number]["id"];
/** "complete" extracts every visible garment and accessory. */
export type FlatlaySelection = "complete" | FlatlayPart[];

export function flatlayLabel(selection: FlatlaySelection) {
  return selection === "complete" ? "Complete outfit" : FLATLAY_PARTS.filter(({ id }) => selection.includes(id)).map(({ label }) => label).join(", ");
}

/** Where a flat lay is saved in try-on: one extracted part goes to its own category, anything more is an outfit. */
export function flatlayCategory(selection: FlatlaySelection): FlatlayPart | "outfit" {
  return selection !== "complete" && selection.length === 1 ? selection[0] : "outfit";
}
