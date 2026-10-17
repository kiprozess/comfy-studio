import type { DemoOutfitId } from "./demo-outfits";

export type Gender = "male" | "female";

export type StylingChoice = {
  id: string;
  label: string;
  demoOutfit?: DemoOutfitId;
  imageUrl?: string;
  file?: File;
  color?: string;
  pose?: number;
  /** Kept in the browser library across reloads; shows a delete control on its tile. */
  saved?: boolean;
};
