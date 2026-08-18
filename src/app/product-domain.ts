/**
 * Product option sets and numeric domains.
 *
 * These live outside `app-schema.ts` on purpose: the schema is the public
 * assembly boundary, and keeping frequently-tuned defaults here means a later
 * change to an option list selects only this module's acceptance coverage
 * rather than everything the schema owns.
 */

/** Segmented controls allow at most 4 options and 24 total label characters. */
export const RELIEF_OPTIONS = [
  { label: "Emboss", value: "emboss" },
  { label: "Deboss", value: "deboss" },
  { label: "Print", value: "print" },
] as const;

export const SCENE_OPTIONS = [
  { label: "Seal", value: "seal" },
  { label: "Device", value: "device" },
] as const;

export const SEAL_SHAPE_OPTIONS = [
  { label: "Round", value: "round" },
  { label: "Octagon", value: "octagon" },
  { label: "Oval", value: "oval" },
  { label: "Tag", value: "tag" },
] as const;

// 21 label characters across 4 options, inside the segmented control's budget
// of 4 options and 24 total characters.
export const DEVICE_OPTIONS = [
  { label: "iPhone", value: "iphone" },
  { label: "iPad", value: "ipad" },
  { label: "MacBook", value: "macbook" },
  { label: "iMac", value: "imac" },
] as const;

/**
 * Clay is a working view, not a cheaper render.
 *
 * It strips every material, texture and piece of artwork down to one neutral
 * matte surface so only form and light remain — the same reason a modeller
 * works in clay before touching shaders. It is also always interactive, where
 * Rendered has to converge.
 */
export const SHADING_OPTIONS = [
  { label: "Clay", value: "clay" },
  { label: "Rendered", value: "rendered" },
] as const;

export const FINISH_OPTIONS = [
  { label: "Polished metal", value: "polished-metal" },
  { label: "Brushed metal", value: "brushed-metal" },
  { label: "Cast stone", value: "cast-stone" },
  { label: "Matte plastic", value: "matte-plastic" },
] as const;

/**
 * How a screenshot is mapped onto the display before any manual adjustment.
 *
 * Screens are roughly 19.5:9, and almost nothing a user drops in matches that,
 * so the default has to make a sensible choice rather than distort silently.
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

/**
 * A scene holds a set of objects rather than a single one.
 *
 * Each record is self-contained — kind, size, and a position on the ground
 * plane — so an object can be lifted from one scene and dropped into another
 * without carrying any scene-level state (lighting, camera, background) with it.
 * That independence is what makes copy between scenes meaningful rather than a
 * whole-document import.
 */
export const OBJECT_LIMITS = {
  /** Above this the path tracer's BVH build becomes the dominant cost. */
  hardMax: 8,
  size: { defaultValue: 150, max: 400, min: 10 },
} as const;

export const DEFAULT_OBJECTS = [
  { kind: "iphone", place: { x: 0.5, y: 0.5 }, size: 150, turn: 0 },
] as const;

/**
 * Sample count is the renderer's only schema-backed workload dimension. Trace time scales
 * linearly with it, so the schema endpoint here is also the declared workload
 * boundary in `app-performance.ts`; the two must stay equal.
 */
export const SAMPLES = {
  defaultValue: 96,
  max: 512,
  min: 16,
  step: 16,
} as const;
