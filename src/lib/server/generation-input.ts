import sharp from "sharp";
import path from "node:path";
import { stylingCategories } from "../styling-categories";
import { POSES } from "../poses";
import { DEFAULT_QUALITY, isQuality, type Quality } from "../quality";
import { DEFAULT_OUTPUT_SIZE, isOutputSize, resolveOutputSize, type OutputSize } from "../output-size";
import type { GenerationSelection } from "../generation-types";
import { DEMO_OUTFIT_IMAGE, DEMO_OUTFIT_COLUMNS, DEMO_OUTFIT_ROWS, getDemoOutfit, type DemoOutfitId } from "../demo-outfits";

export class GenerationError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export const MAX_UPLOAD_BYTES = 32 * 1024 * 1024;
const acceptedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

export async function readGenerationForm(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("multipart/form-data;")) {
    throw new GenerationError("Please upload your photo and references as image files.");
  }
  const reader = request.body?.getReader();
  if (!reader) throw new GenerationError("No upload received.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_UPLOAD_BYTES) {
        await reader.cancel();
        throw new GenerationError("The combined upload must be smaller than 32 MB.", 413);
      }
      chunks.push(value);
    }
    return await new Response(Buffer.concat(chunks), { headers: { "Content-Type": request.headers.get("content-type")! } }).formData();
  } catch (error) {
    if (error instanceof GenerationError) throw error;
    throw new GenerationError("The upload could not be read. Please try again.");
  } finally { reader.releaseLock(); }
}

export function parseSelections(value: FormDataEntryValue | null): GenerationSelection[] {
  let selections: unknown;
  try {
    if (typeof value !== "string" || value.length > 4096) throw new Error();
    selections = JSON.parse(value);
  } catch { throw new GenerationError("The styling selection is invalid."); }
  if (!Array.isArray(selections) || selections.length > stylingCategories.length) {
    throw new GenerationError("The styling selection is invalid.");
  }
  const seen = new Set<string>();
  return selections.map((item: unknown) => {
    if (!item || typeof item !== "object" || !("category" in item)) throw new GenerationError("Unknown styling category.");
    const choice = item as GenerationSelection;
    if (!stylingCategories.some((category) => category.id === choice.category) || seen.has(choice.category)) {
      throw new GenerationError("Unknown or duplicate styling category.");
    }
    seen.add(choice.category);
    if ("presetIndex" in item && item.presetIndex !== undefined) {
      throw new GenerationError("These legacy outfit presets are no longer available. Choose a demo outfit or upload your own reference.");
    }
    if (choice.demoOutfit !== undefined && (choice.category !== "outfit" || !getDemoOutfit(choice.demoOutfit))) {
      throw new GenerationError("Unknown demo outfit.");
    }
    const sources = [choice.demoOutfit !== undefined, choice.color !== undefined, choice.pose !== undefined].filter(Boolean).length;
    if (sources > 1) throw new GenerationError("A styling item can only have one reference.");
    if (choice.color !== undefined && (choice.category !== "background" || !/^#[0-9a-f]{6}$/i.test(choice.color))) {
      throw new GenerationError("Invalid background color.");
    }
    if (choice.pose !== undefined && (choice.category !== "pose" || !Number.isInteger(choice.pose) || choice.pose < 0 || choice.pose >= POSES.length)) {
      throw new GenerationError("Unknown pose.");
    }
    return { category: choice.category, demoOutfit: choice.demoOutfit, color: choice.color, pose: choice.pose };
  });
}

export async function imageData(file: FormDataEntryValue | null) {
  if (!(file instanceof File) || !acceptedTypes.has(file.type) || !file.size || file.size > 10 * 1024 * 1024) {
    throw new GenerationError("Each image must be a JPG, PNG, WebP or AVIF file up to 10 MB.");
  }
  try {
    const image = sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 40_000_000, animated: true });
    const metadata = await image.metadata();
    if (!metadata.width || !metadata.height || (metadata.pages ?? 1) !== 1 || !["jpeg", "png", "webp", "heif", "avif"].includes(metadata.format ?? "")) throw new Error();
    // Normalize AVIF and strip metadata. Router accepts PNG, JPEG and WebP input.
    return await image.rotate().resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg({ quality: 95 }).toBuffer();
  } catch { throw new GenerationError("An image could not be decoded, is animated, or exceeds 40 megapixels."); }
}

// Pose references are mannequin photos from public/images/poses, sent like any other reference image.
async function poseImage(index: number) {
  return sharp(path.join(process.cwd(), "public", POSES[index].image)).flatten({ background: "#ffffff" }).jpeg({ quality: 95 }).toBuffer();
}

async function demoOutfitImage(id: DemoOutfitId) {
  const outfit = getDemoOutfit(id)!; // Validated by parseSelections before reading a file.
  const image = sharp(path.join(process.cwd(), "public", DEMO_OUTFIT_IMAGE));
  const metadata = await image.metadata();
  const column = outfit.tile % DEMO_OUTFIT_COLUMNS;
  const row = Math.floor(outfit.tile / DEMO_OUTFIT_COLUMNS);
  const left = Math.round(column * metadata.width! / DEMO_OUTFIT_COLUMNS);
  const top = Math.round(row * metadata.height! / DEMO_OUTFIT_ROWS);
  const right = Math.round((column + 1) * metadata.width! / DEMO_OUTFIT_COLUMNS);
  const bottom = Math.round((row + 1) * metadata.height! / DEMO_OUTFIT_ROWS);
  return image.extract({ left, top, width: right - left, height: bottom - top }).jpeg({ quality: 95 }).toBuffer();
}

// A missing field keeps the default, so older clients still work; anything else must be a known tier.
export function parseQuality(value: FormDataEntryValue | null): Quality {
  if (value === null || value === "") return DEFAULT_QUALITY;
  if (!isQuality(value)) throw new GenerationError("Unknown image quality.");
  return value;
}

export function parseOutputSize(value: FormDataEntryValue | null): OutputSize {
  if (value === null || value === "") return DEFAULT_OUTPUT_SIZE;
  if (!isOutputSize(value)) throw new GenerationError("Unknown output size.");
  return value;
}

// The normalized photo (already rotated upright) sets the aspect ratio of explicit sizes.
async function photoSize(photo: Buffer, size: OutputSize) {
  if (size === "auto") return "auto";
  const { width, height } = await sharp(photo).metadata();
  return resolveOutputSize(size, width!, height!);
}

export async function buildGenerationInput(form: FormData) {
  const quality = parseQuality(form.get("quality"));
  const outputSize = parseOutputSize(form.get("size"));
  const selections = parseSelections(form.get("selections"));
  if (!selections.some(({ category }) => stylingCategories.some((entry) => entry.id === category && !entry.optional))) {
    throw new GenerationError("Choose an outfit or at least one clothing reference.");
  }
  const images: Buffer[] = [await imageData(form.get("photo"))];
  let framingImage = images[0];
  const hasPose = selections.some(({ category }) => category === "pose");
  const instructions = [
    hasPose
      ? "Create a new photorealistic photograph using the pose reference as the composition template. Image 1 supplies the person's identity and appearance."
      : "Create one photorealistic virtual outfit preview. Image 1 is the person to edit, never a clothing reference.",
    "Keep the person recognizable: preserve their face, hairstyle, skin tone, apparent age and natural body proportions.",
    hasPose
      ? "Priorities, in order: 1. Preserve the person's identity. 2. Match the target pose. 3. Reproduce the selected clothing. 4. Retain the original setting where possible unless a different background is selected. 5. Use the pose reference's camera view and crop rather than image 1's composition."
      : "Keep image 1's original pose, camera angle, framing and crop. Do not widen the shot to show an entire garment.",
    "Fit the selected garments naturally. Adapt fabric folds, shadows, accessories and occlusion to the resulting body position. Retain unselected clothing and personal details where visible; reconstruct newly visible areas naturally.",
  ];
  // Sequential order keeps reference numbering deterministic in the prompt.
  for (const choice of selections) {
    const label = stylingCategories.find(({ id }) => id === choice.category)!.label;
    if (choice.color) { instructions.push(`Use a plain studio background with color ${choice.color}.`); continue; }
    if (choice.category === "pose") {
      // A preset is one of our mannequins; an uploaded pose photo may show any person or figure.
      const preset = choice.pose !== undefined ? POSES[choice.pose] : undefined;
      images.push(preset ? await poseImage(choice.pose!) : await imageData(form.get("reference-pose")));
      const subject = preset ? `a faceless mannequin ${preset.prompt}` : "a figure in the target pose";
      framingImage = images[images.length - 1];
      instructions.push(`Image ${images.length} is the pose reference: ${subject}. Recreate this composition with the person from image 1 wearing the selected clothes in this target pose. Match the figure's entire posture and orientation relative to the camera: head, shoulders, torso, hips and limbs together. Match the viewpoint, subject placement, scale in the frame and crop of this pose reference. If it ends at the thighs or waist, end the output there too; show the full body only when the reference does. Use the person's own proportions within this layout. Replace the mannequin's appearance with the real person's identity and selected clothing. A local arm or hand adjustment to image 1 is insufficient: compose the whole person from the pose reference. Use the pose reference for posture and composition only, not its material, clothing or background.`);
      continue;
    }
    const file = form.get(`reference-${choice.category}`);
    if (choice.demoOutfit && file) throw new GenerationError("Choose either a demo outfit or an uploaded outfit reference.");
    images.push(choice.demoOutfit ? await demoOutfitImage(choice.demoOutfit) : await imageData(file));
    instructions.push(`Image ${images.length} is the ${label.toLowerCase()} reference. ${choice.category === "outfit" ? "Transfer its complete outfit onto the person; the reference may be a flat-lay collage. Output the person wearing it, never the collage." : `Transfer only the selected ${label.toLowerCase()} from this reference.`} Match garment colors, patterns, materials and design as closely as possible. Use this image for clothing only, not for the person's identity, pose or background.`);
  }
  if (!selections.some(({ category }) => category === "background")) {
    instructions.push(hasPose
      ? "Retain the original background's setting and lighting where possible. Extend or reconstruct it naturally wherever the new pose or framing reveals new areas, and adapt contact shadows to the new pose."
      : "Keep the original background and lighting.");
  }
  instructions.push("Return one photorealistic image of the person wearing the selected clothes, with no extra people, reference panels, added text or watermark.", hasPose ? "Use the pose reference's aspect ratio." : "Keep the original image aspect ratio.");
  return { prompt: instructions.join("\n"), image: images.map((bytes) => `data:image/jpeg;base64,${bytes.toString("base64")}`), n: 1, quality, size: await photoSize(framingImage, outputSize), output_format: "png" };
}
