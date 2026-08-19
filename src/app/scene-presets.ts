import type { ToolcraftOrientationPose } from "@/toolcraft/runtime/react";

import type { LightPatternId } from "./product-domain";

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
  { label: "Softbox", value: "softbox" },
  { label: "Sweep", value: "sweep" },
  { label: "Hard light", value: "hard-light" },
  { label: "Spotlight", value: "spotlight" },
  { label: "Daylight", value: "daylight" },
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
  /** How wide the bend is where the floor becomes the wall, 0 to 100. */
  sweepCurve: number;
  /** The lamp at the foot of the paper, 0 to 100. */
  sweepLight: number;
  /** How far the backdrop rises behind the device, 0 leaving a bare floor. */
  sweepHeight: number;
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
  /** The key's apparent size, told as its shadow's edge, 0 hard to 100 hazy. */
  shadowSoftness: number;
  /** What the key shines through, if anything. */
  pattern: LightPatternId;
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
    fill: 10,
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
    shadowSoftness: 34,
    pattern: "none",
    // Nothing behind the device at all. A backdrop, however dark, is a surface
    // that catches light and puts a tone in the frame, and the whole point of
    // this one is that there is nothing back there to find.
    sweepCurve: 45,
    sweepHeight: 0,
    sweepLight: 0,
  },

  softbox: {
    // Light grey paper. Not white: white leaves nothing above the device for a
    // highlight to be brighter than, and a polished case photographed against
    // it comes back looking like a drawing of itself.
    background: "#D2D3D5",
    environment: "studio-soft",
    // Driven hard, because in this one the room is most of the light. The rig
    // shapes what the capture has already laid down rather than replacing it.
    environmentIntensity: 130,
    // The bounce a white studio does for free, and the reason this setup has
    // almost no shadow to speak of.
    fill: 65,
    floorEnvironment: 100,
    // A clean mirror under the device. It works here and not in Void because
    // there is a lit backdrop for the floor to carry as well.
    floorReflection: 58,
    // Semi-gloss: sharp enough to return the device, rough enough that the
    // reflection stays a reflection rather than a second device.
    floorRoughness: 20,
    // Long. A polished case shot straight on wants the near edges to stay
    // where they are rather than flaring towards the corners.
    focalLength: 105,
    keyColor: "#FFFFFF",
    // High and only just off centre, so the modelling is gentle and the
    // reflection of the key clears the display.
    keyDirection: { x: 0.6, y: 0.26 },
    keyIntensity: 70,
    label: "Softbox",
    // Dead on, at the height of the device itself.
    pose: { position: [0, 0.08, 1], up: [0, 1, 0] },
    // Barely there. Against a light backdrop the device already separates by
    // being darker than what is behind it, and a rim on top of that reads as
    // a second light nobody placed.
    rim: 20,
// Wide, because a softbox this size barely casts an edge at all.
    shadowSoftness: 62,
    pattern: "none",
    // A broad cove. The graduation is the look, and a wide bend is what makes
    // the tone fall off over a long way instead of breaking at a corner.
    sweepCurve: 78,
    sweepHeight: 62,
    // Barely on. This one wants an even wall; the lamp is here only to keep
    // the top from going as flat as the middle.
    sweepLight: 22,
  },

  sweep: {
    // Near white, off just enough to hold a tone. A backdrop at pure white
    // clips the moment any light reaches it and takes the graduation with it.
    background: "#EDEDEA",
    environment: "studio-soft",
    environmentIntensity: 105,
    fill: 45,
    // Held well back, and this is the counter-intuitive number in the file.
    // White paper under a bright room sits at the top of the range everywhere
    // at once, and a surface already at its ceiling cannot graduate: the lamp
    // below has nothing to lift. Dropping the room light is what buys the
    // headroom the graduation is drawn in.
    floorEnvironment: 30,
    // No mirror. The shadow does the grounding here, and a reflection under a
    // catalogue shot reads as a showroom floor rather than a table.
    floorReflection: 0,
    floorRoughness: 94,
    // Wide enough to show the device in a space rather than isolated on it,
    // which is what a landing-page shot is doing.
    focalLength: 65,
    keyColor: "#FFFFFF",
    // From above and in front. Straighter than the others because the shadow
    // is meant to sit under the device rather than rake away from it.
    keyDirection: { x: 0.56, y: 0.2 },
    keyIntensity: 95,
    label: "Sweep",
    // Eye level, a touch off axis so the device has some depth to it.
    pose: { position: [0.2, 0.06, 1], up: [0, 1, 0] },
    // Off. There is nothing to separate the device from: the backdrop is
    // already brighter than anything on the device.
    rim: 0,
// Tight enough that the contact shadow reads as contact rather than haze.
    shadowSoftness: 26,
    pattern: "none",
    // Tighter than the softbox and taller. The bend sits low and out of frame,
    // so what is behind the device is an even wall rather than a curve.
    sweepCurve: 34,
    sweepHeight: 80,
    // The graduation is the look here, so the lamp does real work: it is what
    // puts the pool of light behind the device that the corners fall away from.
    sweepLight: 90,
  },

  "hard-light": {
    // Warm concrete. A hard shadow needs somewhere to land that is bright
    // enough to show it and dull enough not to compete with it.
    background: "#C7C3BB",
    environment: "studio-soft",
    // Held down deliberately. A captured room arrives from every direction at
    // once, which is the definition of fill, and fill is exactly what dissolves
    // the shadow this preset exists for.
    environmentIntensity: 42,
    fill: 8,
    floorEnvironment: 62,
    floorReflection: 0,
    floorRoughness: 96,
    // Wider than the others. The shadow is half the composition here, so the
    // frame has to have room for it to fall across.
    focalLength: 50,
    // Barely warm, like sun off a wall rather than a lamp.
    keyColor: "#FFF6E8",
    // Hard across from one side, still high enough to clear the display's
    // mirror angle. The shadow leaves the device on the diagonal because the
    // light comes from the corner rather than the front.
    keyDirection: { x: 0.88, y: 0.3 },
    keyIntensity: 150,
    label: "Hard light",
    pose: { position: [-0.22, 0.24, 1], up: [0, 1, 0] },
    rim: 0,
    // The whole point. A bare source throws an edge you could cut around, and
    // everything else in this preset exists to keep that edge legible.
    shadowSoftness: 3,
    pattern: "none",
    // A low wall, mostly to give the frame a top. The shadow belongs on the
    // floor, so the paper stays out of the way of it.
    sweepCurve: 26,
    sweepHeight: 34,
    sweepLight: 0,
  },

  spotlight: {
    // Very dark, and deliberately not black. Void can be black because nothing
    // is meant to be lit down there; here a pool of light has to land on the
    // floor, and a black surface has no diffuse response to land on — it
    // returns nothing at any angle, so the lamp would shine on it and produce
    // no pool at all. This is the least floor that can still catch light.
    background: "#101015",
    environment: "studio-soft",
    // Low. The pool has to be the brightest thing by a long way, and a captured
    // room lifts everything at once — including the floor it is falling to.
    environmentIntensity: 34,
    fill: 4,
    floorEnvironment: 8,
    // A little, so the device stands in the pool rather than on top of it.
    floorReflection: 30,
    floorRoughness: 56,
    focalLength: 85,
    keyColor: "#FFFFFF",
    keyDirection: { x: 0.58, y: 0.16 },
    keyIntensity: 120,
    label: "Spotlight",
    pose: { position: [-0.3, 0.2, 1], up: [0, 1, 0] },
    rim: 60,
    shadowSoftness: 16,
    pattern: "none",
    sweepCurve: 45,
    // No paper, which is what puts the lamp overhead and the pool on the floor.
    sweepHeight: 0,
    // The brightest thing in the frame by a distance, because everything else
    // is turned down so this can be. Not further: past here the top of the
    // subject stops being modelled by it and starts being flattened by it.
    sweepLight: 64,
  },

  daylight: {
    // Warm plaster. Sunlight indoors is never on white — it is on whatever the
    // room is made of, and that surface is half of why it reads as daylight.
    background: "#D9D1C2",
    environment: "studio-soft",
    // Held below the key by a wide margin, and that ratio is the preset. Sun
    // outdoors is a hundred times the sky it arrives with, and a captured room
    // run up near the key would fill every shadow the window casts until the
    // bars stopped being bars.
    environmentIntensity: 44,
    // Standing in for the sky, which is the other half of the light outdoors
    // and the reason a sunlit shadow is never black — only blue.
    fill: 26,
    floorEnvironment: 76,
    // A table rather than a floor: enough sheen to catch the light raking
    // across it, not enough to mirror anything.
    floorReflection: 14,
    floorRoughness: 74,
    focalLength: 75,
    // Afternoon. Warm enough to read as sun without tipping into orange.
    keyColor: "#FFE7C2",
    // Hard across from the side, which is what makes it rake: a long shadow
    // running out sideways rather than a short one pooling underneath.
    keyDirection: { x: 0.94, y: 0.34 },
    keyIntensity: 168,
    label: "Daylight",
    pose: { position: [-0.18, 0.16, 1], up: [0, 1, 0] },
    rim: 0,
    // Sun is a small source ninety-three million miles away, so its shadow has
    // an edge — soft enough to be air, not soft enough to be a studio.
    shadowSoftness: 12,
    // The one preset with a room in it. Sun does not arrive as an even
    // wash indoors — it arrives through something, and the shape of that
    // something on the floor is most of what tells you where you are.
    pattern: "window",
    sweepCurve: 58,
    sweepHeight: 52,
    sweepLight: 34,
  },
};

export function readScenePresetId(value: unknown): ScenePresetId {
  return SCENE_PRESET_OPTIONS.some((option) => option.value === value)
    ? (value as ScenePresetId)
    : DEFAULT_SCENE_PRESET;
}
