import { stemQuickActionWord, tokenizeQuickActionText } from "./quick-action-text";

/**
 * What someone says, mapped to what the schema calls it.
 *
 * The schema's own labels and descriptions already carry a lot of language —
 * that is what the index searches directly. This table exists for the gap the
 * schema cannot close: a person who does not know the vocabulary. They do not
 * type "specular roughness", they type "shiny"; they do not type "alpha
 * channel", they type "no background". Every entry here is a word a person
 * would reach for that appears nowhere in the schema, pointed at the words that
 * do appear.
 *
 * Keys are single words. Values are read as free text, so they can name several
 * targets at once; both sides are stemmed on load so the table can be written
 * and read in plain English.
 */
const quickActionConceptSources: Readonly<Record<string, string>> = {
  // Finish and colour.
  shiny: "finish silver gloss polish reflective",
  glossy: "finish silver polish reflective",
  polished: "finish silver",
  matte: "natural graphite finish roughness",
  dull: "natural graphite roughness matte",
  chrome: "silver finish reflective",
  aluminium: "silver natural finish",
  aluminum: "silver natural finish",
  metallic: "silver steel finish",
  black: "graphite finish dark",
  golden: "gold finish",
  grey: "silver graphite",
  gray: "silver graphite",
  colour: "color finish background key",
  paint: "finish color",
  recolor: "finish color",

  // The devices, by the words people actually use for them.
  phone: "iphone device model",
  mobile: "iphone device model",
  handset: "iphone device model",
  cell: "iphone device model",
  laptop: "macbook device model",
  notebook: "macbook device model",
  computer: "imac mac studio device model",
  desktop: "imac mac studio device model",
  monitor: "imac device model",
  wearable: "apple watch ultra device model",
  wrist: "apple watch ultra device model",
  product: "device model",
  hardware: "device model",

  // Motion.
  turn: "spin rotation turntable",
  rotate: "spin rotation turntable roll tilt",
  revolve: "spin turntable",
  swivel: "spin turntable",
  turntable: "spin animation rotation",
  animate: "animation timeline keyframe turntable",
  motion: "animation timeline keyframe",
  movie: "video animation export",
  clip: "video export animation",
  playback: "play timeline animation",
  repeat: "loop timeline",
  cycle: "loop spin turntable",

  // Placement.
  move: "position placement offset",
  place: "position placement",
  shift: "position offset",
  nudge: "position offset",
  slide: "position offset",
  left: "position x",
  right: "position x",
  raise: "position y up",
  lower: "position y down",
  higher: "position y scale",
  closer: "position z zoom scale",
  further: "position z zoom scale",
  depth: "position z",
  bigger: "scale zoom size",
  larger: "scale zoom size",
  smaller: "scale zoom size",
  grow: "scale size",
  shrink: "scale size",
  size: "scale zoom resolution",
  lean: "tilt roll",
  pitch: "tilt",
  bank: "roll",
  straighten: "tilt roll spin reset",
  upright: "tilt roll reset",

  // Light.
  lamp: "key fill rim light",
  bright: "key light fill environment intensity",
  brightness: "key fill environment intensity",
  brighter: "key fill environment intensity",
  darker: "key fill environment intensity",
  dim: "key fill environment intensity",
  dark: "key light fill environment graphite",
  expose: "environment intensity key",
  exposure: "environment intensity key",
  blur: "softness shadow",
  blurry: "softness shadow",
  fuzzy: "softness shadow",
  diffuse: "shadow softness fill softbox",
  soften: "shadow softness softbox",
  harsh: "softness shadow hard key",
  sharp: "softness shadow hard key",
  contrast: "hard key fill rim",
  glow: "rim key",
  halo: "rim",
  outline: "rim",
  gobo: "pattern window blinds",
  slats: "blinds pattern",
  stripes: "blinds pattern",
  sun: "daylight environment",
  sunlight: "daylight environment",
  softbox: "studio soft key",

  // Camera.
  lens: "focal length camera zoom",
  wide: "focal length camera",
  telephoto: "focal length camera",
  perspective: "focal length camera",
  distortion: "focal length camera",
  crop: "framing zoom canvas fit",
  composition: "framing zoom position",
  centre: "framing position reset",
  center: "framing position reset",
  viewpoint: "camera spin tilt",

  // Backdrop and surface.
  backdrop: "background backdrop sweep",
  behind: "background backdrop",
  wall: "backdrop background sweep",
  no: "none off transparent disable",
  without: "none off transparent",
  remove: "none off transparent delete reset",
  transparent: "background transparent none alpha png",
  alpha: "background transparent png",
  cutout: "background transparent none",
  floor: "surface",
  ground: "surface",
  table: "surface",
  desk: "surface",
  tabletop: "surface",
  marble: "stone surface",
  concrete: "stone surface",
  wood: "oak surface",
  timber: "oak surface",
  walnut: "oak surface",
  metal: "steel surface",
  acrylic: "glass surface reflection",
  mirror: "reflection glass surface",
  reflect: "reflection glass surface",
  bounce: "reflection fill",
  shine: "reflection gloss roughness",
  grain: "roughness surface",
  texture: "roughness surface finish",
  cyclorama: "sweep curve backdrop",
  infinite: "sweep curve backdrop",
  seamless: "sweep curve backdrop",

  // The thing on the screen.
  screenshot: "artwork screenshot design screen upload",
  design: "artwork screenshot screen",
  artwork: "screenshot design screen",
  picture: "png image export screenshot artwork",
  photo: "screenshot artwork image",
  app: "screenshot artwork screen",
  ui: "screenshot artwork screen",
  content: "screenshot artwork screen",
  upload: "screenshot artwork import",
  import: "screenshot artwork upload",
  swap: "screenshot artwork model finish",
  cover: "fill mode fit",
  contain: "fit mode",

  // Getting it out.
  save: "export download deliver png video",
  download: "export deliver png video",
  output: "export deliver resolution",
  render: "export deliver resolution video",
  share: "export deliver download",
  publish: "export deliver download",
  still: "png image export",
  snapshot: "png image export",
  jpeg: "jpg image export format",
  film: "video export",
  record: "video export",
  quality: "resolution render scale",
  dpi: "resolution",
  pixels: "resolution canvas size",
  retina: "resolution",
  hd: "resolution",

  // The app itself.
  undo: "undo history back",
  revert: "undo reset history",
  mistake: "undo history",
  oops: "undo history",
  redo: "redo history forward",
  reset: "reset default restore",
  default: "reset default",
  restore: "reset default undo",
  clear: "reset none transparent delete",
  clean: "reset none default",
  sidebar: "panel controls",
  collapse: "panel section timeline",
  expand: "panel section timeline",
  shortcut: "keyboard command",
};

/**
 * Stemmed word -> stemmed words it should also reach. Built once; the table
 * above is authored in plain English so it stays readable and reviewable.
 */
export const quickActionConceptMap: ReadonlyMap<string, readonly string[]> =
  new Map(
    Object.entries(quickActionConceptSources).map(([word, related]) => [
      stemQuickActionWord(word.toLowerCase()),
      [...new Set(tokenizeQuickActionText(related))],
    ]),
  );

/**
 * A query token stands for itself first and its related words second. The
 * caller weights the two differently, so that naming a thing outranks
 * describing it — someone who types "gloss" wants the finish, not everything
 * glossy things happen to relate to.
 */
export function expandQuickActionToken(token: string): readonly string[] {
  return quickActionConceptMap.get(token) ?? [];
}
