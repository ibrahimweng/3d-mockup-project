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

export type SurfaceDefinition = {
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
    // Grey, and only just: a slab lifts the shadow side without tinting it,
    // which is exactly why architects photograph on it.
    bounce: { color: "#b9b3aa", share: 0.13 },
    color: "#ffffff",
    // Rough enough that the room arrives as a wash rather than a picture, and
    // a full share of that wash would flatten the very relief the maps carry.
    environmentShare: 0.5,
    label: "Concrete",
    maps: {
      albedo: "concrete-albedo.jpg",
      normal: "concrete-normal.png",
      roughness: "concrete-rough.jpg",
    },
    metalness: 0,
    normalScale: 0.6,
    roughness: 1,
    // The table is sized against the device and comes out around two metres
    // across, so this is about forty centimetres a tile — which puts the
    // aggregate at the four or five millimetres it actually is. Measured
    // against the render rather than picked: at two tiles the pinholes came
    // out the size of coins.
    tiles: 6,
    value: "concrete",
  },
  {
    // The whole point of wood. A finished board is pale and strongly coloured,
    // and everything standing on one picks up an amber underlight that no
    // amount of key colour reproduces — it arrives from below, which is the
    // one direction the rig has no light in.
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
    normalScale: 0.45,
    roughness: 1,
    // Coarser than a real board, deliberately, and this is the compromise.
    // Thirteen rings a tile at the spacing oak actually grows would want two
    // dozen tiles across a desk, and a tile repeating two dozen times is a
    // wallpaper: the eye finds the period long before it finds the timber. At
    // nine the rings come out around two centimetres — wide-plank rather than
    // furniture-grade, and still unmistakably wood.
    tiles: 9,
    value: "oak",
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
