import type { ToolcraftOrientationPose } from "@/toolcraft/runtime/react";

/**
 * Studio presets: a backdrop, a floor, a light rig and a framing, together.
 *
 * A device render becomes a product photograph through decisions that are made
 * as a set. A hard key belongs with a dark floor and a low camera; a broad
 * soft key belongs with a bright sweep and a straight-on one. Exposing the
 * dozen numbers separately is honest but useless — nobody finds the
 * combination by moving one slider at a time, which is why the rim light sat
 * at zero and nothing in the app had an edge.
 *
 * A preset writes those numbers into the ordinary controls. It does not lock
 * them: every one stays where it was, and moving one afterwards is expected.
 * This is a starting point that happens to be a good one, not a mode.
 */

export const SCENE_PRESET_OPTIONS = [
  { label: "Void", value: "void" },
] as const;

export type ScenePresetId = (typeof SCENE_PRESET_OPTIONS)[number]["value"];

export const DEFAULT_SCENE_PRESET: ScenePresetId = "void";

export type ScenePreset = {
  /** Ground plane colour, which is also what the sweep fades into. */
  background: string;
  /** Captured studio, by file name, and how hard it drives the scene. */
  environment: string;
  environmentIntensity: number;
  /** How much of the captured room the floor picks up, 0 to 100. */
  floorEnvironment: number;
  /** How much of the device the floor carries back, 0 to 100. */
  floorReflection: number;
  /** Floor finish, 0 polished to 100 matte. */
  floorRoughness: number;
  focalLength: number;
  label: string;
  /** Bounce, 0 to 400. */
  fill: number;
  keyColor: string;
  /** Where the key sits, each axis 0 to 1 with 0.5 straight on. */
  keyDirection: { x: number; y: number };
  keyIntensity: number;
  /** Camera direction from the subject, and which way is up. */
  pose: ToolcraftOrientationPose;
  /** The separating edge light, 0 to 400. */
  rim: number;
};

export const SCENE_PRESETS: Readonly<Record<ScenePresetId, ScenePreset>> = {
  void: {
    // Black, because the point of this one is that there is nothing to see
    // except the device and the light along its edges.
    background: "#000000",
    // A bright capture, even though the backdrop is black. The two are
    // separate: the environment lights the device and is what metal has to
    // reflect, while the backdrop is a ground plane painted black. Lighting a
    // metal enclosure with a dark capture leaves it flat white under the key,
    // with none of the gradient that makes aluminium look like aluminium.
    environment: "studio-soft",
    environmentIntensity: 80,
    fill: 12,
    // The floor is told to ignore almost all of that bright capture. It is a
    // very large plane and most of it is seen at a grazing angle, where even a
    // black dielectric reflects nearly everything — left alone it comes out a
    // grey sheet with a horizon across it. The device's reflection does not
    // come from here; it comes from the mirrored copy, which is unaffected.
    floorEnvironment: 6,
    floorReflection: 40,
    floorRoughness: 88,
    // Long enough to keep the device's own proportions rather than flaring
    // the near corner, which is what gives a product shot away.
    focalLength: 85,
    keyColor: "#FFFFFF",
    // Off to one side and well above. Height is the part that is not
    // negotiable: every device here is mostly display, and a key near eye
    // level lands in the panel's mirror angle, where it stops being a
    // highlight and becomes a white disc burned across the artwork. Lifting it
    // sends that reflection down to the floor instead, and lights the top
    // surfaces on the way.
    keyDirection: { x: 0.72, y: 0.24 },
    keyIntensity: 95,
    label: "Void",
    // Low, but above the floor. Going under it would put the camera beneath
    // the plane the reflection is seen through, and a single-sided floor culls
    // from below — leaving the mirrored device hanging in the open at full
    // strength. The guard in the scene catches that; this stays clear of it.
    pose: { position: [-0.36, 0.14, 1], up: [0, 1, 0] },
    // A bright line down the far edge, separating the device from a background
    // that is otherwise the same colour as its shadow side. Restrained,
    // because a metal has no diffuse response: past a point a rim stops being
    // an edge and becomes a second broad highlight washing the whole face.
    rim: 85,
  },
};

export function readScenePresetId(value: unknown): ScenePresetId {
  return SCENE_PRESET_OPTIONS.some((option) => option.value === value)
    ? (value as ScenePresetId)
    : DEFAULT_SCENE_PRESET;
}
