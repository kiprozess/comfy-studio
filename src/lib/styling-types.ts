export type Gender = "male" | "female";

export type StylingChoice = {
  id: string;
  label: string;
  atlasIndex?: number;
  imageUrl?: string;
  file?: File;
  color?: string;
  pose?: number;
  /** Kept in the browser library across reloads; shows a delete control on its tile. */
  saved?: boolean;
};
