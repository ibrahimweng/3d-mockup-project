/**
 * Product option sets and the device catalog.
 *
 * These live outside `app-schema.ts` on purpose: the schema is the public
 * assembly boundary, and keeping the frequently-tuned option lists and per-model
 * facts here means a later change to a device selects only this module's
 * acceptance coverage rather than everything the schema owns.
 */

/**
 * Five devices, so this cannot be a segmented control: that budget is 4 options
 * and 24 total label characters, and these names alone are 63. Select is the
 * closest built-in for a finite named set rendered full-width.
 *
 * ImagePicker was the other candidate and was rejected because it needs a
 * visual tile per option, and the source repository ships no device thumbnails.
 * A picker of five identical placeholder tiles is less useful than named rows.
 */
export const DEVICE_OPTIONS = [
  { label: "iPhone 17 Pro Max", value: "iphone-17-pro-max" },
  { label: "iPhone 17 Pro Max (Orange)", value: "iphone-orange" },
  { label: "MacBook", value: "macbook" },
  { label: "Studio Display", value: "studio-display" },
  { label: "Apple Watch Ultra", value: "apple-watch-ultra" },
] as const;

export type DeviceId = (typeof DEVICE_OPTIONS)[number]["value"];

export const DEFAULT_DEVICE: DeviceId = "iphone-17-pro-max";

/**
 * What a renderer needs to know about one model file.
 *
 * Each field exists because a model in this set actually needed it, and every
 * value was read out of the GLB rather than guessed — see the notes per entry.
 */
export type DeviceDefinition = {
  /**
   * Nodes hidden before bounds are measured. A mesh that extends past the
   * device pushes the camera back and floats the object above its own shadow.
   */
  excludedNodes: readonly string[];
  /** Human-readable name, used for the export file name. */
  label: string;
  modelFile: string;
  /**
   * Mirror the screenshot on the display's own axes.
   *
   * Each model authors its screen UVs however its creator happened to unwrap
   * them, so a texture that reads correctly on one device can arrive mirrored
   * on another. This is measured per model by putting a legible image on the
   * screen and reading it, not guessed.
   */
  screenFlip?: { x?: boolean; y?: boolean };
  /**
   * Screen height / width, when measuring the mesh cannot give it.
   *
   * The scene builder normally measures the panel carrying the display
   * material, which is correct for a flat screen. A screen modelled at a tilt
   * has a three-dimensional local bounding box, so measurement understates its
   * height and the override is the honest value.
   */
  screenAspect?: number;
  /**
   * Material carrying the display, by name.
   *
   * Names are exact but brittle across re-exports, so the builder falls back to
   * the strongest emissive material — a display is the surface that emits.
   */
  screenMaterial: string;
  /**
   * Scene to load when the file's default scene is not this device.
   *
   * Several of these files are multi-scene: `macbook.glb` also contains an
   * iPhone and an iMac in sibling scenes, and `macstudio.glb`'s default scene
   * holds two displays where `Exp` holds one.
   */
  sceneName?: string;
  /**
   * Turn the model about its vertical axis before framing, in degrees.
   *
   * The default camera looks down +Z, and not every source file models its
   * device facing that way. Without this the Studio Display presents its back.
   */
  yawDegrees?: number;
};

export const DEVICE_CATALOG: Readonly<Record<DeviceId, DeviceDefinition>> = {
  "apple-watch-ultra": {
    excludedNodes: [],
    label: "Apple Watch Ultra",
    modelFile: "apple-watch-ultra.glb",
    screenMaterial: "Material.004",
  },
  "iphone-17-pro-max": {
    // A stray 5,155-triangle mesh spanning the full height of the source file
    // and sitting proud of the phone's back. Nothing on a real iPhone extends
    // above the top edge, and its bounds alone added 83mm of height. Hidden
    // rather than deleted, so the source file stays untouched.
    excludedNodes: ["lwfmQebmsqyrPXh"],
    label: "iPhone 17 Pro Max",
    modelFile: "iphone-17-pro-max.glb",
    screenMaterial: "BsXHDwLKqtDOfrW",
  },
  "iphone-orange": {
    excludedNodes: [],
    label: "iPhone 17 Pro Max (Orange)",
    modelFile: "iphone-5.glb",
    // The file is named for an iPhone 5 but holds the same phone geometry as
    // the 17 Pro Max in an orange finish, with the display material renamed.
    // Labelled for what it renders rather than what the file is called.
    screenMaterial: "Screen.001",
  },
  macbook: {
    excludedNodes: [],
    label: "MacBook",
    modelFile: "macbook.glb",
    // 16:10. The open lid is modelled at its hinge angle, so the panel's local
    // bounding box spans three axes and measuring it would report 0.61.
    // 16:10. The open lid is modelled at its hinge angle, so the panel's local
    // bounding box spans three axes and measuring it would report 0.61.
    screenAspect: 0.625,
    // This lid's screen UVs run bottom-up relative to the phones', so an
    // unflipped design lands vertically mirrored on it.
    screenFlip: { y: true },
    screenMaterial: "Screen.002",
    sceneName: "Scene.002",
  },
  "studio-display": {
    excludedNodes: [],
    label: "Studio Display",
    modelFile: "macstudio.glb",
    screenMaterial: "Screen",
    // The file's default scene stacks two displays; `Exp` is the single one.
    sceneName: "Exp",
    // Modelled facing away from the default camera.
    yawDegrees: 180,
  },
};

export function readDeviceDefinition(value: unknown): DeviceDefinition {
  return (
    DEVICE_CATALOG[value as DeviceId] ?? DEVICE_CATALOG[DEFAULT_DEVICE]
  );
}

/**
 * How a screenshot is mapped onto the display before any manual adjustment.
 *
 * Screens across this set run from 19.5:9 to 16:10 to nearly square, and almost
 * nothing a user drops in matches any of them, so the default has to make a
 * sensible choice rather than distort silently.
 * 14 label characters across 3 options, inside the segmented budget.
 */
export const FIT_OPTIONS = [
  { label: "Fit", value: "fit" },
  { label: "Fill", value: "fill" },
  { label: "Stretch", value: "stretch" },
] as const;

export const ENVIRONMENT_OPTIONS = [
  { label: "Studio soft", value: "studio-soft" },
  { label: "Hard key", value: "hard-key" },
  { label: "Dark rim", value: "dark-rim" },
  { label: "Daylight", value: "daylight" },
] as const;
