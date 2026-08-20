/**
 * What a device can be stood on, and what each one does to the light.
 *
 * A surface is not a colour swatch. Standing a phone on oak and standing it on
 * concrete are different photographs, and the difference is only partly the
 * thing underneath — most of it is that a pale timber board throws a lot of
 * warm light back up into the subject and a grey slab throws back a little
 * neutral light. Get the bounce wrong and the material reads as a decal: the
 * right grain in the right place with none of the consequences of being there.
 *
 * So each entry carries two halves. The first is what the slab is made of, as
 * a material. The second is what having it in the room does, as a light. They
 * are declared together because they are one decision, and splitting them is
 * how they drift apart.
 */

/** Tiling maps under `public/textures`, without the extension. */
export type SurfaceMaps = {
  albedo: string;
  normal: string;
  roughness: string;
};

/**
 * What the legs are made of.
 *
 * The same for both tables, and not the same as the top. A stone slab on stone
 * stilts is a plinth and an oak top on oak posts is a farmhouse table; what
 * both of these want to be is the modern thing they are photographing a
 * computer on, which is a solid top on thin dark metal. Keeping it constant
 * also means the leg never has to carry a tiling map at a scale that would
 * suit a surface a hundred times its width.
 */
export const SURFACE_LEG = {
  // Dark, but a long way from black. A leg at 0.85 metalness and a near-black
  // base colour returns almost nothing under a low environment — metals have
  // no diffuse response, so there is nothing left to shade with — and comes
  // out as a flat silhouette with no facets, which reads as a bar drawn on the
  // picture rather than a post standing in it. Dropping the metalness lets the
  // key model the corners.
  color: "#494c50",
  metalness: 0.45,
  roughness: 0.34,
} as const;

export type SurfaceDefinition = {
  /**
   * How wide the eased arris runs, against the default.
   *
   * A material decision that has to be made in geometry. On timber and stone
   * the arris is the millimetre of relief that catches the key and draws the
   * bright line along the front of a table. On glass it is the whole effect:
   * a real glass edge glows because light travels through the slab and leaves
   * at the cut, and with no transmission in this renderer the only way to buy
   * that back is a chamfer wide enough to catch the room and turn it into a
   * line of its own.
   */
  bevel: number;
  /**
   * What the slab throws back up at the device.
   *
   * `share` is a fraction of the key, not an absolute: bounce is light that
   * has already arrived once, so dimming the key has to dim it too. A rig with
   * a bounce that stays put while the key falls is the reason so many renders
   * have a subject that will not go dark.
   */
  bounce: { color: string; share: number };
  /** Multiplied into the albedo map, so one map can serve a range of stock. */
  color: string;
  /**
   * How much of the captured room this surface picks up, against the floor's.
   *
   * Rough materials return the environment as a broad wash and polished ones
   * return it as an image, so the same share does not suit both.
   */
  environmentShare: number;
  label: string;
  maps: SurfaceMaps | null;
  metalness: number;
  /** How deep the relief reads. 1 is the map as authored. */
  normalScale: number;
  /**
   * Base roughness, multiplied by the map's green channel.
   *
   * Left at 1 wherever a map is supplied, so the authored map means exactly
   * what it says and there is one number to reason about rather than two.
   */
  roughness: number;
  /**
   * Tiles across the width of the top, with depth matched so texels stay
   * square. A count rather than a physical size, because the table is sized
   * against the device and a watch's table is not a laptop's.
   */
  tiles: number;
  value: string;
};

/**
 * Ordered as the control offers them: no surface, then hardest to softest.
 */
export const SURFACE_DEFINITIONS = [
  {
    bevel: 1,
    bounce: { color: "#ffffff", share: 0 },
    color: "#ffffff",
    environmentShare: 1,
    label: "None",
    maps: null,
    metalness: 0,
    normalScale: 1,
    roughness: 1,
    tiles: 1,
    value: "none",
  },
  {
    // Warm, and only just. Limestone lifts the shadow side without announcing
    // itself, which is exactly why architects photograph on it.
    bevel: 1,
    bounce: { color: "#c3bbae", share: 0.15 },
    color: "#ffffff",
    // Honed, so the room arrives as a soft sheen rather than a picture — and a
    // full share of it would wash out the veining the map exists for.
    environmentShare: 0.6,
    label: "Stone",
    maps: {
      albedo: "stone-albedo.jpg",
      normal: "stone-normal.png",
      roughness: "stone-rough.jpg",
    },
    metalness: 0,
    normalScale: 0.38,
    roughness: 1,
    // One. A stone tabletop is one slab, and a slab does not repeat: at three
    // tiles the same vein motif appeared nine times on the top, which is a
    // wallpaper however good the map is. This is the one material here that
    // has to be sized to the furniture rather than to the material.
    tiles: 1,
    value: "stone",
  },
  {
    // The whole point of wood. A finished board is pale and strongly coloured,
    // and everything standing on one picks up an amber underlight that no
    // amount of key colour reproduces — it arrives from below, which is the
    // one direction the rig has no light in.
    bevel: 1,
    bounce: { color: "#c98a4a", share: 0.24 },
    color: "#ffffff",
    // Sealed timber carries a clear coat, and a coat is a mirror. This is most
    // of why oak looks finished rather than sawn.
    environmentShare: 0.85,
    label: "Oak",
    maps: {
      albedo: "oak-albedo.jpg",
      normal: "oak-normal.png",
      roughness: "oak-rough.jpg",
    },
    metalness: 0,
    normalScale: 0.2,
    roughness: 1,
    // Coarser than a real board, deliberately, and this is the compromise.
    // Thirteen rings a tile at the spacing oak actually grows would want two
    // dozen tiles across a table, and a tile repeating two dozen times is a
    // wallpaper: the eye finds the period long before it finds the timber. At
    // three the rings come out around three centimetres — wide-plank rather
    // than furniture-grade, and still unmistakably wood. Any finer and the
    // lines close up into a corrugation, which is a different material.
    tiles: 3,
    value: "oak",
  },
  {
    // A steel top is a mirror laid flat, so what it throws back up is the room
    // and the key, cool and surprisingly strong — the brightest bounce here,
    // and the only one that is not really the colour of the material.
    bevel: 1.3,
    bounce: { color: "#b9c4cf", share: 0.2 },
    color: "#ffffff",
    // The whole of it. A metal has no diffuse response, so with no environment
    // to reflect there is nothing there at all: this is the one material that
    // is invisible without a capture behind it rather than merely flat.
    environmentShare: 1,
    label: "Steel",
    maps: {
      albedo: "steel-albedo.jpg",
      normal: "steel-normal.png",
      roughness: "steel-rough.jpg",
    },
    metalness: 1,
    normalScale: 0.24,
    roughness: 1,
    // Coarse. The brush lines are already a hundred to one inside the map, so
    // repeating it hard would shorten them into a weave, and a long smeared
    // highlight is the entire point of a brushed finish.
    tiles: 2,
    value: "steel",
  },
  {
    // Almost nothing. A dark polished top returns the room in a mirror rather
    // than scattering it, and a mirror throws its light onward instead of back
    // at whatever is standing on it — which is why glass tables photograph
    // with such black undersides.
    bevel: 2.6,
    bounce: { color: "#8fa0ad", share: 0.05 },
    // Smoked, not clear. The approved trade: a polished dark tinted slab with
    // a bright chamfer, rather than real transmission — which in this renderer
    // costs an extra full pass of the scene per frame and buys an effect the
    // camera is at the wrong angle to see anyway.
    color: "#1b1e22",
    // Polished, so it carries the capture as an image. This is where the
    // illusion lives: the slab is opaque, and every bit of glass in it is the
    // room arriving off a very smooth surface.
    environmentShare: 1,
    label: "Glass",
    // None. A map is a description of imperfection, and this surface has none
    // — every pixel of it is the same flawless plane, and any texture at all
    // would be the thing that gave it away.
    maps: null,
    metalness: 0,
    normalScale: 1,
    roughness: 0.045,
    tiles: 1,
    value: "glass",
  },
] as const satisfies readonly SurfaceDefinition[];

export type SurfaceId = (typeof SURFACE_DEFINITIONS)[number]["value"];

/**
 * The control's options, derived rather than listed.
 *
 * A second list would be a second place to add a material to, and forgetting
 * it gives an option that selects a surface with no physics or a surface no
 * one can select.
 */
export const SURFACE_OPTIONS = SURFACE_DEFINITIONS.map(
  ({ label, value }) => ({ label, value }),
);

export const DEFAULT_SURFACE: SurfaceId = "none";

export function readSurfaceId(value: unknown): SurfaceId {
  return SURFACE_DEFINITIONS.some((surface) => surface.value === value)
    ? (value as SurfaceId)
    : DEFAULT_SURFACE;
}

export function readSurfaceDefinition(value: unknown): SurfaceDefinition {
  const id = readSurfaceId(value);
  return (
    SURFACE_DEFINITIONS.find((surface) => surface.value === id) ??
    SURFACE_DEFINITIONS[0]
  );
}
