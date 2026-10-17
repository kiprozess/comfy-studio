import Image from "next/image";
import type { StylingChoice } from "@/lib/styling-types";
import { POSES } from "@/lib/poses";
import styles from "./choice-preview.module.css";


// Tiles are filled edge to edge; the large preview passes "contain" to show the whole image.
export function ChoicePreview({ choice, fit = "cover" }: { choice: StylingChoice; fit?: "cover" | "contain" }) {
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
