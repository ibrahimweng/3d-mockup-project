/**
 * Product option sets and the device catalog.
 *
 * These live outside `app-schema.ts` on purpose: the schema is the public
 * assembly boundary, and keeping the frequently-tuned option lists and per-model
 * facts here means a later change to a device selects only this module's
 * acceptance coverage rather than everything the schema owns.
 */

/**
 * Six devices, so this cannot be a segmented control: that budget is 4 options
 * and 24 total label characters, and these names alone are well past both.
 * Select is the closest built-in for a finite named set rendered full-width.
 *
 * ImagePicker was the other candidate and was rejected because it needs a
 * visual tile per option, and the source repository ships no device thumbnails.
 * A picker of identical placeholder tiles is less useful than named rows.
 */
export const DEVICE_OPTIONS = [
  { label: "iPhone 17 Pro Max", value: "iphone-17-pro-max" },
  { label: "MacBook", value: "macbook" },
  { label: "iMac", value: "imac" },
  { label: "Studio Display", value: "studio-display" },
  { label: "Apple Watch Ultra", value: "apple-watch-ultra" },
] as const;

export type DeviceId = (typeof DEVICE_OPTIONS)[number]["value"];

/**
 * Colourways, shared across every device.
 *
 * The option list has to be the same for all of them because schema options are
 * static, so each device maps these names onto its own materials instead. A
 * device that has nothing sensible for a given finish simply omits it and stays
 * as its author built it.
 *
 * Five options, so this is a Select: the segmented budget is four.
 */
export const FINISH_OPTIONS = [
  { label: "Natural", value: "natural" },
  { label: "Graphite", value: "graphite" },
  { label: "Silver", value: "silver" },
  { label: "Gold", value: "gold" },
  { label: "Blue", value: "blue" },
] as const;

export type FinishId = (typeof FINISH_OPTIONS)[number]["value"];

export const DEFAULT_FINISH: FinishId = "natural";

/**
 * One colourway on one device.
 *
 * `body` paints every material the device lists as its shell, so a device with
 * a dozen materials carrying the same finish needs one colour rather than a
 * dozen. `accents` covers the parts that are deliberately a different colour —
 * a watch band against its case.
 */
export type DeviceFinish = {
  accents?: Readonly<Record<string, string>>;
  body: string;
};

/**
 * A repair to one material, applied before any colourway.
 *
 * Model authors sometimes leave a part at a value that is not physically
 * meaningful. The common one in this set is pure black on a fully metallic
 * material: a metal's base colour is its reflectance, so black metal returns
 * no light at any angle and renders as a hole rather than as the part it
 * represents. No environment or light fixes that — the surface has nothing to
 * reflect with.
 *
 * Corrections are separate from finishes on purpose. A finish is a choice the
 * user makes; a correction is what the model should have said in the first
 * place, so it applies to Natural too and every colourway paints over it.
 */
export type MaterialCorrection = {
  color?: string;
  metalness?: number;
  roughness?: number;
};

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
  /**
   * The materials that make up this device's shell.
   *
   * Named once here rather than repeated in every colourway. A name that the
   * model does not contain is simply ignored, so a family of near-identical
   * models can share one list.
   */
  bodyMaterials?: readonly string[];
  /**
   * What each colourway does to this device.
   *
   * Only base colour is rewritten; metalness and roughness stay as authored, so
   * a brushed enclosure stays brushed and a polished rail stays polished.
   * Natural is always the model exactly as it shipped, so it needs no entry.
   */
  finishes?: Partial<Record<FinishId, DeviceFinish>>;
  /**
   * Authoring defects repaired before the model is ever shown, by material
   * name. See `MaterialCorrection` for what counts as a defect rather than a
   * preference.
   */
  materialCorrections?: Readonly<Record<string, MaterialCorrection>>;
  /**
   * Body materials a colourway paints flat rather than tints.
   *
   * A colourway normally writes base colour alone, which multiplies whatever
   * base-colour texture the material carries. That is right for a neutral
   * texture — brushed aluminium tints and keeps its grain — but wrong for one
   * whose own colour is the thing being replaced, where tinting an orange
   * panel silver just yields a paler orange. Naming a material here sets its
   * texture aside for the duration of a colourway; Natural puts it back.
   */
  repaintedMaterials?: readonly string[];
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

/**
 * The back panel and the small trim beside it.
 *
 * Both carry their orange in a base-colour texture rather than in a base
 * colour, and a colourway multiplies rather than replaces, so tinting the
 * panel silver only produces a paler orange. These are listed separately so
 * the finish can set their texture aside and paint them flat.
 *
 * `SMUhrjUPCjJkPUK` is not a typo for the `.001` below it: the file carries
 * both, the suffixed one as a plain base colour and this one as the printed
 * panel, and only the first was found by a sweep for red base colours.
 */
const PHONE_PRINTED_PANELS = ["SMUhrjUPCjJkPUK", "HETovHCBsEjcSiP"] as const;

/**
 * Every material carrying the phone's finish.
 *
 * Read out of the GLB rather than eyeballed: any material whose base colour is
 * red-dominant, plus the printed panels above, which a base-colour sweep
 * cannot see. Missing the small ones leaves an orange side button on an
 * otherwise repainted phone.
 */
const PHONE_BODY_MATERIALS = [
  "iAKEWdNafBldSCV",
  "nwfiSfJrPZRLBAj",
  "SLmJkLdkhbbuEfG",
  "sJxAokqqlZYuwzy",
  "SMUhrjUPCjJkPUK.001",
  "ooxVuxObmmqIeuh",
  "VXTclbUnoLmmPoD",
  "YQFhPSFSryEqJMp",
  "yPEFElLJTRhfWfw",
  "PJgHvfOhNXkxvzq",
  "awYxKfiOpRgQIxD",
  ...PHONE_PRINTED_PANELS,
] as const;

const PHONE_FINISHES: Partial<Record<FinishId, DeviceFinish>> = {
  blue: { body: "#3b5f8a" },
  gold: { body: "#d4b483" },
  graphite: { body: "#3a3a3c" },
  silver: { body: "#d6d6d8" },
};

const WATCH_BAND = (hex: string): Readonly<Record<string, string>> => ({
  "Material.002": hex,
  "Watch Crown Ring": hex,
  "Watch Strap": hex,
});

export const DEVICE_CATALOG: Readonly<Record<DeviceId, DeviceDefinition>> = {
  "apple-watch-ultra": {
    excludedNodes: [],
    // Case and band are separate materials, so each colourway sets both.
    bodyMaterials: ["Watch Body", "Watch Crown"],
    finishes: {
      blue: { accents: WATCH_BAND("#2f4a6d"), body: "#7d8ea3" },
      gold: { accents: WATCH_BAND("#e8d5b0"), body: "#cfae7b" },
      graphite: { accents: WATCH_BAND("#2c2c2e"), body: "#4a4a4c" },
      silver: { accents: WATCH_BAND("#e3e1dd"), body: "#d8d6d2" },
    },
    label: "Apple Watch Ultra",
    modelFile: "apple-watch-ultra.glb",
    screenMaterial: "Material.004",
  },
  "iphone-17-pro-max": {
    excludedNodes: [],
    // Every material carrying the phone's finish.
    bodyMaterials: PHONE_BODY_MATERIALS,
    finishes: PHONE_FINISHES,
    label: "iPhone 17 Pro Max",
    modelFile: "iphone-5.glb",
    // The file is named for an iPhone 5 but holds a 17 Pro Max in orange, with
    // the display material renamed. The catalog is named for what it renders.
    //
    // The repository also ships `iphone-17-pro-max.glb`, which is the same
    // phone without the orange back panel and with a stray full-height mesh
    // that had to be hidden. Only one of the two is worth offering, and this
    // is the better model.
    //
    // The back panel's colour is printed into its texture rather than set as a
    // base colour, so tinting it leaves it orange whatever finish is chosen.
    repaintedMaterials: PHONE_PRINTED_PANELS,
    screenMaterial: "Screen.001",
  },
  macbook: {
    excludedNodes: [],
    // The two aluminium materials: the lid shell and the deck around the keys.
    bodyMaterials: ["CRQixVLpahJzhJc", "LpqXZqhaGCeSzdu"],
    finishes: {
      blue: { body: "#4a5c7a" },
      gold: { body: "#cbb28f" },
      graphite: { body: "#3f4145" },
      silver: { body: "#cfd2d6" },
    },
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
  imac: {
    // The 24-inch model, in its shipped blue. Two tones, as the real machine
    // has: a pale front and stand against a saturated back, so a colourway
    // names the front and carries the back as an accent.
    bodyMaterials: ["LightBlue"],
    excludedNodes: [],
    finishes: {
      blue: {
        accents: { DarkBlue: "#2b5f96" },
        body: "#bcd8f2",
      },
      gold: {
        accents: { DarkBlue: "#a8834f" },
        body: "#f0dcc0",
      },
      graphite: {
        accents: { DarkBlue: "#4a4c4f" },
        body: "#b8babd",
      },
      silver: {
        accents: { DarkBlue: "#9ea2a6" },
        body: "#e6e8ea",
      },
    },
    label: "iMac",
    // The panel carries its wallpaper as a base texture on a white material
    // rather than as pure emission, so lighting it as a lit surface washes the
    // uploaded design out. Black base leaves only the emissive channel, which
    // is where the design is put.
    materialCorrections: {
      Screen: { color: "#000000" },
    },
    // Shares a file with the MacBook: `macbook.glb` carries a phone, this iMac
    // and the MacBook in sibling scenes, so nothing new is downloaded and the
    // second of the two to be selected is already decoded.
    modelFile: "macbook.glb",
    // Read off a corner-labelled design, as with the MacBook it ships beside:
    // this panel's UVs run bottom-up.
    screenFlip: { y: true },
    screenMaterial: "Screen",
    sceneName: "Scene.001",
    // Measured, not guessed: this scene's display normal points along +X, and
    // the camera looks down +Z. The other models in this set face +Z already,
    // apart from the Studio Display which faces away and is turned 180.
    yawDegrees: -90,
  },
  "studio-display": {
    excludedNodes: [],
    // The enclosure is textured, so its base colour multiplies the texture
    // rather than replacing it: the aluminium tints and keeps its brushed
    // detail. The stand is untextured and takes the colour flat, which is why
    // it needs a correction below before any of this reads correctly.
    bodyMaterials: ["metal.010", "metal2.002"],
    finishes: {
      blue: { body: "#8fa4bd" },
      gold: { body: "#d9c3a1" },
      graphite: { body: "#6f7175" },
      silver: { body: "#e6e8ea" },
    },
    label: "Studio Display",
    // Every one of this model's seven materials is fully metallic, and two of
    // them are pure black on top of that. A metal has no diffuse response —
    // it can only return what it reflects — so a flat panel facing the camera
    // shows whatever is behind the camera, which in a studio is darkness. That
    // is why this device alone rendered as a bright rim around a void while
    // the phones, whose authors left most of the shell dielectric, read
    // correctly from every angle. These corrections give it the same footing.
    materialCorrections: {
      // The frame around the panel. A display bezel is a dark dielectric, not
      // a metal: it should absorb and scatter a little rather than mirror.
      "Besels.002": { color: "#17181a", metalness: 0, roughness: 0.5 },
      // Enclosure and stand neck. The file's metallic-roughness map is a flat
      // white, which is the glTF default rather than authored intent; taking
      // it part-way to dielectric lets the light aluminium texture actually
      // show, while enough metal remains to keep the brushed reflection.
      "metal.010": { metalness: 0.5 },
      // The foot, untextured and left at pure black. Same aluminium as the
      // enclosure, and the same split between diffuse and reflection.
      "metal2.002": { color: "#c8cbcd", metalness: 0.5 },
    },
    modelFile: "macstudio.glb",
    screenMaterial: "Screen",
    // The file's default scene stacks two displays; `Exp` is the single one.
    sceneName: "Exp",
    // Modelled facing away from the default camera.
    yawDegrees: 180,
  },
};

export function readFinishId(value: unknown): FinishId {
  return FINISH_OPTIONS.some((option) => option.value === value)
    ? (value as FinishId)
    : DEFAULT_FINISH;
}

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
