import Image from "next/image";
import type { StylingChoice } from "@/lib/styling-types";
import { POSES } from "@/lib/poses";
import { DEMO_OUTFIT_IMAGE, DEMO_OUTFIT_COLUMNS, DEMO_OUTFIT_ROWS, getDemoOutfit } from "@/lib/demo-outfits";
import styles from "./choice-preview.module.css";


// Tiles are filled edge to edge; the large preview passes "contain" to show the whole image.
export function ChoicePreview({ choice, fit = "cover" }: { choice: StylingChoice; fit?: "cover" | "contain" }) {
  const outfit = getDemoOutfit(choice.demoOutfit);
  if (outfit) {
    return <span className={styles.outfitFrame} data-fit={fit} aria-hidden="true">
      <span className={styles.outfitImage} style={{ backgroundImage: `url("${DEMO_OUTFIT_IMAGE}")`, backgroundSize: `${DEMO_OUTFIT_COLUMNS * 100}% ${DEMO_OUTFIT_ROWS * 100}%`, backgroundPosition: `${(outfit.tile % DEMO_OUTFIT_COLUMNS) * 100 / (DEMO_OUTFIT_COLUMNS - 1)}% ${Math.floor(outfit.tile / DEMO_OUTFIT_COLUMNS) * 100 / (DEMO_OUTFIT_ROWS - 1)}%` }} />
    </span>;
  }
  if (choice.imageUrl) {
    return <Image src={choice.imageUrl} alt="" fill sizes={fit === "contain" ? "520px" : "88px"} unoptimized className={styles.uploadedImage} data-fit={fit} />;
  }
  if (choice.color) {
    return <span className={styles.colorPreview} style={{ background: choice.color }} aria-hidden="true" />;
  }
  // Poses saved without an image URL (older history) still find their mannequin by index.
  const poseImage = choice.pose !== undefined ? POSES[choice.pose]?.image : undefined;
  if (poseImage) {
    return <Image src={poseImage} alt="" fill sizes={fit === "contain" ? "520px" : "88px"} unoptimized className={styles.uploadedImage} data-fit={fit} />;
  }
  return null;
}
