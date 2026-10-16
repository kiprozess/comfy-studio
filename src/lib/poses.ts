// Pose references: a mannequin photo per pose in public/images/poses. The model copies the body
// position from the image; `prompt` describes it in words as a second cue. Add a pose by adding
// an image there and an entry here; the index is what the client sends, so append new poses.
export const POSES = [
  {
    id: "mannequin-standing",
    label: "Standing",
    image: "/images/poses/mannequin-standing.webp",
    prompt: "standing upright facing the camera, weight on both feet, arms hanging relaxed at the sides with the hands slightly away from the thighs, feet slightly apart",
  },
] as const;

export type Pose = (typeof POSES)[number];
