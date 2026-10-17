export const DEMO_OUTFIT_IMAGE = "/images/demo-outfits.png";
export const DEMO_OUTFIT_COLUMNS = 4;
export const DEMO_OUTFIT_ROWS = 4;

// Stable IDs keep these author-supplied outfits separate from the retired presets.
// Tiles follow the source lookbook in reading order, left to right, top to bottom.
export const DEMO_OUTFITS = [
  { id: "olive-denim", label: "Olive & denim", gender: "male", tile: 0 },
  { id: "cream-polo", label: "Cream polo & shorts", gender: "male", tile: 1 },
  { id: "navy-linen", label: "Navy & linen", gender: "male", tile: 2 },
  { id: "gray-hoodie", label: "Gray hoodie & joggers", gender: "male", tile: 3 },
  { id: "brown-knit", label: "Brown knit & cream", gender: "male", tile: 4 },
  { id: "denim-black", label: "Denim & black", gender: "male", tile: 5 },
  { id: "beige-utility", label: "Beige utility", gender: "male", tile: 6 },
  { id: "charcoal-tailoring", label: "Charcoal tailoring", gender: "male", tile: 7 },
  { id: "breton-denim", label: "Breton stripes & denim", gender: "female", tile: 8 },
  { id: "floral-dress", label: "Blue floral dress", gender: "female", tile: 9 },
  { id: "black-tank", label: "Black tank & tailoring", gender: "female", tile: 10 },
  { id: "blue-shirt", label: "Blue shirt & shorts", gender: "female", tile: 11 },
  { id: "cardigan-boots", label: "Brown cardigan & boots", gender: "female", tile: 12 },
  { id: "beige-blazer", label: "Beige blazer & denim", gender: "female", tile: 13 },
  { id: "black-evening", label: "Black evening dress", gender: "female", tile: 14 },
  { id: "cream-pleats", label: "Cream knit & pleats", gender: "female", tile: 15 },
] as const;

export type DemoOutfitId = (typeof DEMO_OUTFITS)[number]["id"];

export function getDemoOutfit(id: unknown) {
  return DEMO_OUTFITS.find((outfit) => outfit.id === id);
}
