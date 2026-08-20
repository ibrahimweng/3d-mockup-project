import * as THREE from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { toCreasedNormals } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";

import type {
  DeviceDefinition,
  DeviceSurface,
  FinishId,
  LightPatternId,
} from "../product-domain";
import {
  readSurfaceDefinition,
  SURFACE_LEG,
  type SurfaceDefinition,
} from "../surfaces";

/**
 * A device scene: a real GLB lit entirely by a prefiltered environment.
 *
 * There is no path tracer here. The environment is convolved once into mip
 * levels representing increasing roughness, after which every frame is a single
 * raster pass. Moving the camera costs one draw call rather than restarting a
 * convergence that has to be re-accumulated from zero, which is what would let a
 * progressive renderer hold a GPU at full load while showing a static image.
 *
 * Everything that differs between the devices is data on `DeviceDefinition`
 * rather than a branch here, so adding another model is a catalog entry — the
 * iMac was added that way, and needed no code.
 */

/**
 * How the floor behaves under the device.
 *
 * A matte floor takes a shadow and nothing else, which is what a paper sweep
 * does. A polished one also carries the device's reflection, which is most of
 * what makes the references read as photographs rather than renders.
 */
export type SurfaceSettings = {
  /**
   * Whether the device stands on a table, and which one.
   *
   * "none" is the app as it was: an endless floor that dissolves at its rim.
   * That dissolve is right for a backdrop and is exactly why a backdrop can
   * never be furniture — a table is defined by the thing a sweep exists to
   * hide, which is an edge with a lit top on one side of it and a shaded face
   * on the other.
   */
  kind: string;
};

export type SweepSettings = {
  /**
   * How wide the cove is, 0 a corner and 1 a broad cyclorama.
   *
   * The bend is what makes a backdrop graduate. A surface curving away from
   * the light turns a little further from it with every step up, so the tone
   * falls off across the curve on its own — no painted gradient, and it takes
   * a shadow and bounces onto the device while it is at it.
   */
  curve: number;
  /** How far the sweep rises behind the device, 0 leaving a bare floor. */
  height: number;
  /**
   * A lamp tucked into the cove, lighting the paper rather than the device.
   *
   * This is the one light in the rig with any falloff, and it is here because
   * the graduation a backdrop is prized for cannot come from anywhere else.
   * The key, the fill and the rim are all directional or hemispherical: they
   * arrive as parallel rays with no notion of distance, so a large flat wall
   * under them comes back one even tone however it is shaped. A photographer
   * solves this exactly this way, with a small light on the floor behind the
   * subject aimed at the paper.
   */
  light: number;
};

export type FloorSettings = {
  /**
   * How much of the captured room the floor picks up, 0 to 1.
   *
   * Separate from the device's own environment response, because the two want
   * opposite things: metal needs a bright capture to have anything to reflect,
   * while a floor given the same capture turns grey. The floor is very large
   * and most of it is seen at a grazing angle, where reflectance approaches
   * total — so a black floor under a bright room reads as a grey sheet with a
   * horizon, which is the opposite of a void.
   */
  environment: number;
  /**
   * How much of the device's reflection shows, 0 to 1.
   *
   * Zero leaves the floor exactly as it was. Anything above draws the device a
   * second time, mirrored beneath the floor, and lets it show through.
   */
  reflection: number;
  /** Surface roughness of the floor itself, 0 polished to 1 matte. */
  roughness: number;
};

export type ScreenTransform = {
  fit: "fill" | "fit" | "stretch";
  /** Pan, 0..1 per axis with 0.5 centred. */
  offset: { x: number; y: number };
  /** Uniform zoom, as a percentage. */
  scale: number;
  /** Independent width/height, 0..1 per axis with 0.5 unstretched. */
  stretch: { x: number; y: number };
};

/**
 * Parsed models, kept for the life of the page.
 *
 * Decoding a device is the single most expensive thing the app does — the
 * largest is 21MB — and switching away and back used to pay it again. The
 * parsed result is shared; every scene built from it clones the graph and its
 * materials, so one device's finish never leaks into another's.
 */
const modelCache = new Map<string, Promise<GLTF>>();

/**
 * Convolved environments, per renderer.
 *
 * PMREM output is a render target belonging to one WebGL context, so preview
 * and export cannot share it. Within one renderer, convolving the same studio
 * twice is pure waste.
 */
const environmentCache = new WeakMap<
  THREE.WebGLRenderer,
  Map<string, THREE.Texture>
>();

/**
 * One loader, with a Draco decoder attached.
 *
 * A model authored for the web usually arrives Draco-compressed, and the
 * alternative to decoding it here is decompressing it beforehand — which for
 * the Mac Studio means 3.4MB becoming 34.8MB, or being decimated until it
 * fits, which costs the surface detail the model was supplied for. Decoding
 * at load keeps a supplied file exactly as its author sent it.
 *
 * The decoder runs on a worker, so the main thread is not blocked while a
 * device is decompressed, and it is created once because each instance spawns
 * its own workers.
 */
function createLoader(): GLTFLoader {
  const draco = new DRACOLoader();
  draco.setDecoderPath(`${import.meta.env.BASE_URL}draco/`);
  // WebAssembly by default, which is several times faster than the JavaScript
  // fallback the same directory also carries for anything that cannot run it.
  return new GLTFLoader().setDRACOLoader(draco);
}

let loader: GLTFLoader | null = null;

function loadModel(url: string): Promise<GLTF> {
  const cached = modelCache.get(url);
  if (cached) return cached;
  loader ??= createLoader();
  const pending = loader.loadAsync(url);
  modelCache.set(url, pending);
  // A failed load must not poison the cache, or the device can never load.
  void pending.catch(() => modelCache.delete(url));
  return pending;
}

export async function loadEnvironment(
  renderer: THREE.WebGLRenderer,
  url: string,
): Promise<THREE.Texture> {
  let perRenderer = environmentCache.get(renderer);
  if (!perRenderer) {
    perRenderer = new Map();
    environmentCache.set(renderer, perRenderer);
  }
  const cached = perRenderer.get(url);
  if (cached) return cached;

  const equirectangular = await new RGBELoader().loadAsync(url);
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const environment = pmrem.fromEquirectangular(equirectangular).texture;
  equirectangular.dispose();
  pmrem.dispose();
  perRenderer.set(url, environment);
  return environment;
}

/**
 * Clone a cached model for one scene.
 *
 * `Object3D.clone` shares materials by reference, which would make a finish or
 * a screenshot applied to one instance appear on every other. Materials are
 * cloned per scene; geometries and textures stay shared, because those are the
 * expensive part and nothing here mutates them.
 */
function cloneForScene(source: THREE.Object3D): THREE.Object3D {
  const clone = source.clone(true);
  const byOriginal = new Map<THREE.Material, THREE.Material>();
  const copy = (material: THREE.Material): THREE.Material => {
    const existing = byOriginal.get(material);
    if (existing) return existing;
    const fresh = material.clone();
    byOriginal.set(material, fresh);
    return fresh;
  };

  clone.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.material = Array.isArray(object.material)
      ? object.material.map(copy)
      : copy(object.material);
  });
  return clone;
}

export type ScreenSlack = { x: number; y: number };

export type DeviceScene = {
  camera: THREE.PerspectiveCamera;
  dispose: () => void;
  /**
   * How much of the design is cropped on each axis, 0..1.
   *
   * Dragging can only move the design across what is actually hidden, so this
   * is what converts a pointer delta into an offset delta.
   */
  getScreenSlack: () => ScreenSlack;
  /** The display meshes, for hit testing the screen apart from the body. */
  screenMeshes: THREE.Mesh[];
  /** Repaint the shell without rebuilding anything. */
  setFinish: (finish: FinishId) => void;
  /** Move and re-balance the rig without rebuilding anything. */
  setLighting: (lighting: LightingSettings) => void;
  /** Show, hide, and recolour the ground without rebuilding anything. */
  setGround: (visible: boolean, color: string) => void;
  /** Change the floor's finish and how much reflection it carries. */
  setFloor: (floor: FloorSettings) => void;
  /** Raise or lower the paper behind the device. */
  setSweep: (sweep: SweepSettings) => void;
  /** Stand the device on a table, or take it away again. */
  setSurface: (surface: SurfaceSettings) => void;
  /** Re-judge the reflection after the camera has been placed. */
  onCameraMoved: () => void;
  /** Swap the captured studio without rebuilding anything. */
  setEnvironment: (environment: THREE.Texture) => void;
  /** The device geometry, so a hit test can ignore the ground. */
  subject: THREE.Object3D;
  /** Set the artwork shown on the display, or null to leave it dark. */
  setArtwork: (
    texture: THREE.Texture | null,
    transform?: ScreenTransform,
  ) => void;
  scene: THREE.Scene;
  /** Bounding sphere radius of the device, for framing. */
  subjectRadius: number;
  /**
   * Everything the camera is meant to hold, as a box in world space.
   *
   * The device alone with nothing under it; the device and its furniture when
   * there is furniture. Framing off the subject's radius alone is right for a
   * device standing on an endless floor and wrong the moment it is standing on
   * something — a table is four times the width of the laptop on it, so the
   * shot that framed the laptop cropped three quarters of the table away.
   *
   * Mutated in place when the surface changes, so the camera has one thing to
   * read rather than a rule per surface.
   */
  framing: THREE.Box3;
  target: THREE.Vector3;
};

/**
 * Locate the display material by name, falling back to emission.
 *
 * A name lookup is exact but brittle across re-exports; ranking by emissive
 * strength finds the display anywhere, because a screen modelled as a lit panel
 * stays a lit panel even when its material is renamed. Ranking by size or by
 * largest texture does not work: on these phones two correctly-sized unlit
 * panels sit behind the real display and are never seen.
 */
function findScreenMaterials(
  root: THREE.Object3D,
  materialName: string,
): THREE.MeshStandardMaterial[] {
  // Every material carrying the configured name, not just the first found. A
  // model can duplicate its display material across several meshes, and setting
  // only one instance leaves the visible panel showing its stock wallpaper --
  // or the panel the user is looking at unchanged while a hidden twin updates.
  const byName: THREE.MeshStandardMaterial[] = [];
  let byEmission: THREE.MeshStandardMaterial | null = null;
  let strongest = 0;

  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const material = object.material;
    if (
      Array.isArray(material) ||
      !(material instanceof THREE.MeshStandardMaterial)
    ) {
      return;
    }

    if (material.name === materialName) {
      if (!byName.includes(material)) byName.push(material);
      return;
    }

    const emissive = material.emissive;
    const strength = emissive ? emissive.r + emissive.g + emissive.b : 0;
    if (strength > strongest) {
      strongest = strength;
      byEmission = material;
    }
  });

  if (byName.length > 0) return byName;
  return byEmission ? [byEmission] : [];
}

/**
 * Measure the display's proportions from the mesh carrying its material.
 *
 * Taking the two largest axes of the local bounding box is correct for a flat
 * panel. A screen modelled at a tilt has depth in all three axes and reports a
 * height that is too small, which is why the catalog can override this.
 */
function measureScreenAspect(
  root: THREE.Object3D,
  screenMaterials: readonly THREE.MeshStandardMaterial[],
  fallback: number,
): number {
  let aspect = fallback;
  root.traverse((object) => {
    if (
      !(object instanceof THREE.Mesh) ||
      !screenMaterials.includes(object.material as THREE.MeshStandardMaterial)
    ) {
      return;
    }
    object.geometry.computeBoundingBox();
    const box = object.geometry.boundingBox;
    if (!box) return;
    const size = box.getSize(new THREE.Vector3());
    const axes = [size.x, size.y, size.z].sort((a, b) => b - a);
    if (axes[0] > 0 && axes[1] > 0) aspect = axes[1] / axes[0];
  });
  return aspect;
}

/**
 * Map the screen controls onto a texture's repeat/offset.
 *
 * `repeat` below 1 zooms *in*, because it is how much of the texture spans the
 * surface rather than how large the image is drawn — so every factor here is
 * inverted relative to how the control reads.
 */
function applyScreenTransform(
  texture: THREE.Texture,
  screenAspect: number,
  transform: ScreenTransform | undefined,
  slack: ScreenSlack,
): void {
  // Sampling outside 0..1 must clamp, not tile: a zoomed-in screenshot would
  // otherwise repeat itself around the edges of the display.
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  // Scale and stretch operate about the middle of the image rather than its
  // corner, so zooming keeps the subject centred instead of drifting.
  texture.center.set(0.5, 0.5);

  if (!transform) {
    texture.repeat.set(1, 1);
    texture.offset.set(0, 0);
    slack.x = 0;
    slack.y = 0;
    texture.needsUpdate = true;
    return;
  }

  // The panel is measured as height over width, because that is what reads
  // naturally for a device; an image is described the other way round. Both
  // are put in width-over-height here so the comparison below is between like
  // and like — mixing the two silently squared the error and cropped every
  // design far tighter than its aspect called for.
  const screenRatio = screenAspect > 0 ? 1 / screenAspect : 1;
  const image = texture.image as { height?: number; width?: number } | undefined;
  const imageAspect =
    image?.width && image?.height ? image.width / image.height : screenRatio;

  // Base fit. `fill` covers and crops, `fit` shows everything and leaves
  // margins, `stretch` ignores aspect entirely and distorts to the display.
  let repeatX = 1;
  let repeatY = 1;
  if (transform.fit !== "stretch") {
    const ratio = imageAspect / screenRatio;
    const cover = transform.fit === "fill";
    if (ratio > 1 === cover) repeatX = cover ? 1 / ratio : ratio;
    else repeatY = cover ? ratio : 1 / ratio;
  }

  // Manual zoom on top of the fit.
  const zoom = Math.max(0.05, transform.scale / 100);
  repeatX /= zoom;
  repeatY /= zoom;

  // Stretch maps 0..1 onto a half-to-double factor per axis, so the pad's
  // centre leaves the image untouched.
  const stretchX = 0.5 + Math.max(0, Math.min(1, transform.stretch.x)) * 1.5;
  const stretchY = 0.5 + Math.max(0, Math.min(1, transform.stretch.y)) * 1.5;
  repeatX /= stretchX;
  repeatY /= stretchY;

  texture.repeat.set(repeatX, repeatY);

  // Pan across whatever is being cropped. With nothing cropped there is no
  // slack on that axis and the offset correctly does nothing.
  const slackX = Math.max(0, 1 - repeatX);
  const slackY = Math.max(0, 1 - repeatY);
  slack.x = slackX;
  slack.y = slackY;
  texture.offset.set(
    (Math.max(0, Math.min(1, transform.offset.x)) - 0.5) * slackX,
    (Math.max(0, Math.min(1, transform.offset.y)) - 0.5) * slackY,
  );

  texture.needsUpdate = true;
}

export type LightingSettings = {
  /** How strongly the captured studio itself lights the device. */
  environmentIntensity: number;
  /** Bounce from below and behind, lifting the shadow side. */
  fillIntensity: number;
  keyColor: string;
  keyIntensity: number;
  /** Where the key sits, -1..1 per axis with 0 straight on. */
  keyDirection: { x: number; y: number };
  /** A hard edge light behind the device, separating it from the ground. */
  rimIntensity: number;
  /**
   * How wide the key's shadow spreads, 0 for a cut edge and 1 for a haze.
   *
   * This is the size of the light source, expressed as its only visible
   * consequence. A bare bulb is a point and throws an edge you could cut round;
   * a metre-square softbox throws one that takes a hand's width to fade. Every
   * light in this rig is directional, which means infinitely far away and
   * infinitely small, so the shadow is where its apparent size has to be told.
   */
  shadowSoftness: number;
  /** What the key shines through: nothing, a window, or a set of blinds. */
  pattern: LightPatternId;
};

/**
 * Give every surface a normal that matches the face it belongs to.
 *
 * A model that welds a flat panel to its rounded bevel leaves the corner
 * vertices holding an average of both, so the flat face shades as a gradient
 * between them — a soft fan spreading from a corner, on a surface that should
 * be uniform. Recomputing with a crease threshold splits the sharp edges and
 * leaves the fillets smooth.
 *
 * The geometry is cloned first because `Object3D.clone` shares it with the
 * parsed model in the cache, and this must not reach another scene.
 */
function creaseNormals(root: THREE.Object3D, angleDegrees: number): void {
  const creaseAngle = THREE.MathUtils.degToRad(angleDegrees);
  const done = new Map<THREE.BufferGeometry, THREE.BufferGeometry>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const existing = done.get(object.geometry);
    if (existing) {
      object.geometry = existing;
      return;
    }
    const creased = toCreasedNormals(object.geometry, creaseAngle);
    done.set(object.geometry, creased);
    object.geometry = creased;
  });
}

/**
 * The backdrop a studio actually has: floor, cove, wall, in one surface.
 *
 * Seamless paper rolls down a wall, bends, and runs out along the floor. There
 * is no corner in it anywhere, which is the whole point — a corner would draw
 * a line across the frame and the eye would read a room instead of a nowhere.
 *
 * The profile is swept all the way around rather than dragged sideways, so the
 * paper closes on itself and the set has no ends. A strip has two, and they
 * are found the moment anyone orbits: the wall runs out, and past it is
 * whatever the canvas clears to. Revolving costs a few hundred vertices and
 * removes the entire class of problem — there is no direction to look in that
 * finds an edge, because there is no edge.
 */
function createSweepGeometry(
  radius: number,
  curve: number,
  height: number,
): THREE.BufferGeometry {
  // Height above the floor and distance out from the middle of the set, walked
  // from the point where the paper leaves the floor to the top of the wall.
  const profile: [number, number][] = [];
  const SEGMENTS = 20;
  for (let index = 0; index <= SEGMENTS; index += 1) {
    const angle = (Math.PI / 2) * (index / SEGMENTS);
    profile.push([
      curve * (1 - Math.cos(angle)),
      radius + curve * Math.sin(angle),
    ]);
  }
  // Above the cove the paper is vertical, and there is only something to add
  // if it was asked to rise further than the bend already takes it.
  if (height > curve) profile.push([height, radius + curve]);

  // Texture coordinates run with distance along the profile rather than with
  // the index, so the fade at the top is the same width of paper however many
  // segments the curve happens to use.
  let travelled = 0;
  const travel = profile.map((point, index) => {
    if (index > 0) {
      const previous = profile[index - 1];
      travelled += Math.hypot(point[0] - previous[0], point[1] - previous[1]);
    }
    return travelled;
  });
  const total = travel[travel.length - 1] || 1;

  // Enough segments around that the wall reads as curved rather than faceted
  // at the distances a long lens puts it. The seam is a duplicated column of
  // vertices rather than a shared one, so U can run 0 to 1 without the last
  // quad having to wrap backwards through the whole map.
  const AROUND = 72;
  const columns = AROUND + 1;
  const positions = new Float32Array(profile.length * columns * 3);
  const uvs = new Float32Array(profile.length * columns * 2);
  for (let index = 0; index < profile.length; index += 1) {
    const [up, out] = profile[index];
    for (let column = 0; column < columns; column += 1) {
      const turn = (column / AROUND) * Math.PI * 2;
      const vertex = index * columns + column;
      positions[vertex * 3] = Math.sin(turn) * out;
      positions[vertex * 3 + 1] = up;
      positions[vertex * 3 + 2] = -Math.cos(turn) * out;
      uvs[vertex * 2] = column / AROUND;
      uvs[vertex * 2 + 1] = travel[index] / total;
    }
  }

  const indices: number[] = [];
  for (let index = 0; index < profile.length - 1; index += 1) {
    for (let column = 0; column < AROUND; column += 1) {
      const a = index * columns + column;
      const b = a + 1;
      const c = a + columns;
      const d = c + 1;
      // Wound so the faces point inwards, at the camera standing in the set.
      indices.push(a, c, d, a, d, b);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * The cut-out the key shines through.
 *
 * Everything in the rig until now is a light with a number on it, and no
 * number makes a room. A gobo does: a shape held in front of the light so that
 * what lands is the shape rather than the light. Bars across a floor read as a
 * window with no window anywhere in the frame, which is the whole trick.
 *
 * Bars only, never a surround blocking the light around them. A real window is
 * a hole in an opaque wall, but the depth map covering this scene is finite,
 * and beyond its edge nothing is shadowed at all — so a surround would draw a
 * hard line across the floor where the map ran out and the light started
 * arriving again. Bars have no such edge: both sides of that boundary are lit,
 * and only the bars are not.
 *
 * The pattern is laid out around the middle rather than through it, so the
 * device stands in a pane and the shadows fall beside it. A bar across the
 * product is a defect however well it reads on the floor.
 */
/**
 * The table: a chamfered top, and legs under it if it is that kind of table.
 *
 * Two things make furniture read as furniture rather than as floor. The first
 * is the eased arris — every worked surface carries one a millimetre or two
 * across, and that tiny band is what catches the key and draws the bright line
 * along the front of every table you have ever seen photographed. A
 * mathematically sharp edge is the one thing real furniture never has.
 *
 * The second is that you can see under it. A block that runs out of the bottom
 * of frame is a plinth: it tells you the device is standing on something, and
 * nothing else. Legs, an underside, and the backdrop carrying on behind them
 * tell you the device is standing on an object, in a room, and that is the
 * whole difference between a staged photograph and a rendering.
 *
 * Everything is measured from the device, not from the middle of the top, so
 * the device can sit near one corner with two edges running away from it.
 */
function createSurfaceGeometry(
  surface: DeviceSurface,
  radius: number,
  legs: boolean,
  bevel: number,
): THREE.BufferGeometry {
  const west = -surface.left * radius;
  const east = surface.right * radius;
  const north = -surface.back * radius;
  const south = surface.front * radius;
  const top = surface.top * radius;
  // Sized against the subject rather than against the top, because the top
  // runs out of frame and would give a chamfer you could sit on.
  const ease = Math.min(radius * 0.04 * bevel, top * 0.45);
  // UVs are divided through by one length in both directions, so texels come
  // out square and a material declares one repeat count rather than two.
  const across = east - west;

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  type Point = readonly [number, number, number];

  /**
   * One quad, with its map read off whichever pair of axes it actually spans.
   *
   * This is the whole reason the geometry is written out rather than assembled
   * from boxes. A face needs its texture in the table's own units, and which
   * two coordinates carry it depends on which way the face points: a top is
   * read with x and z, a side with one of those and height. Share one set of
   * coordinates across both — which is what happens if the corners of the top
   * are reused for the sides beneath them — and the side gets no variation
   * down its height at all, so a single row of the map is smeared the whole
   * depth of the edge. On a tabletop that edge is the most looked-at surface
   * in the frame.
   */
  const quad = (a: Point, b: Point, c: Point, d: Point): void => {
    const base = positions.length / 3;
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const normal = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0],
    ].map(Math.abs);
    const flat = normal[1] >= normal[0] && normal[1] >= normal[2];
    const sideways = !flat && normal[0] >= normal[2];
    for (const [x, y, z] of [a, b, c, d]) {
      positions.push(x, y, z);
      if (flat) {
        uvs.push((x - west) / across, (z - north) / across);
      } else if (sideways) {
        // Facing along x, so width comes from z and the rest is the drop —
        // offset so the top of the face continues the top surface's own
        // reading rather than restarting at nought.
        uvs.push((z - north) / across, (a[0] - west - y) / across);
      } else {
        uvs.push((x - west) / across, (a[2] - north - y) / across);
      }
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };

  /** The four corners of the outline, inset by `offset`, at height `y`. */
  const ring = (offset: number, y: number): Point[] => [
    [west + offset, y, north + offset],
    [east - offset, y, north + offset],
    [east - offset, y, south - offset],
    [west + offset, y, south - offset],
  ];

  /**
   * A turned leg: a tapered post with enough sides to read as round.
   *
   * Built with shared vertices around the circumference rather than through
   * `quad`, because these are the one part of the table that should *not* be
   * flat shaded. Averaged normals give a post a continuous highlight running
   * down it, which is what says metal; four flat faces give four flat tones
   * and a black rectangle, which is what the first pass at these looked like
   * and what makes them read as bars drawn on the picture.
   *
   * The taper is small and does most of the work. Furniture legs are almost
   * never parallel-sided — the eye reads a perfectly parallel post as a pipe —
   * and a few percent over their length is enough.
   */
  const post = (
    centreX: number,
    centreZ: number,
    wide: number,
    high: number,
    low: number,
  ): void => {
    const SIDES = 14;
    const base = positions.length / 3;
    for (const [level, scale] of [
      [high, 1],
      [low, 0.74],
    ] as const) {
      for (let side = 0; side <= SIDES; side += 1) {
        const turn = (side / SIDES) * Math.PI * 2;
        positions.push(
          centreX + Math.cos(turn) * wide * scale,
          level,
          centreZ + Math.sin(turn) * wide * scale,
        );
        uvs.push((side / SIDES) * ((wide * 6) / across), (high - level) / across);
      }
    }
    const ring = SIDES + 1;
    for (let side = 0; side < SIDES; side += 1) {
      const a = base + side;
      const b = a + 1;
      const c = a + ring;
      const d = c + 1;
      indices.push(a, c, d, a, d, b);
    }
    // Capped top and bottom: the underside of a table is a place a low camera
    // goes, and an open tube there is worse than no leg at all.
    for (const [level, scale, up] of [
      [high, 1, true],
      [low, 0.74, false],
    ] as const) {
      const centre = positions.length / 3;
      positions.push(centreX, level, centreZ);
      uvs.push(0.5, 0.5);
      const rim = positions.length / 3;
      for (let side = 0; side <= SIDES; side += 1) {
        const turn = (side / SIDES) * Math.PI * 2;
        positions.push(
          centreX + Math.cos(turn) * wide * scale,
          level,
          centreZ + Math.sin(turn) * wide * scale,
        );
        uvs.push(0.5 + Math.cos(turn) * 0.5, 0.5 + Math.sin(turn) * 0.5);
      }
      for (let side = 0; side < SIDES; side += 1) {
        if (up) indices.push(centre, rim + side, rim + side + 1);
        else indices.push(centre, rim + side + 1, rim + side);
      }
    }
  };

  if (legs) {
    const thick = surface.leg * radius;
    // Flush: the leg's outer faces sit in the same plane as the top's sides.
    //
    // Not a style choice so much as the placement with no failure mode. A leg
    // set well under a top is hidden by that top from every camera above it,
    // so what reaches the frame is a post apparently starting in mid-air —
    // the join, which is the thing that says the leg belongs to the table, is
    // the one part never in view. Coplanar, the silhouette carries straight on
    // down and there is nothing left to hide.
    const floor = -surface.stand * radius;
    // Tucked into each corner so the post is tangent to both edges: flush with
    // the silhouette, and not hanging off it the way a circle inscribed on the
    // corner point itself would.
    for (const x of [west + thick, east - thick]) {
      for (const z of [north + thick, south - thick]) {
        post(x, z, thick, -top, floor);
      }
    }
  } else {
    // An inset top face, a chamfer falling away from it, the sides, and a
    // closed underside — because with legs there is an angle that sees it.
    const face = ring(ease, 0);
    const brim = ring(0, -ease);
    const under = ring(0, -top);
    quad(face[0], face[3], face[2], face[1]);
    for (const [upper, lower] of [
      [face, brim],
      [brim, under],
    ]) {
      for (let corner = 0; corner < 4; corner += 1) {
        const next = (corner + 1) % 4;
        quad(upper[corner], upper[next], lower[next], lower[corner]);
      }
    }
    quad(under[0], under[1], under[2], under[3]);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(positions), 3),
  );
  geometry.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(uvs), 2));
  geometry.setIndex(indices);
  // Flat, because the arris is the point. Smoothing it away would average the
  // top into the chamfer and put a soft gradient where the highlight belongs.
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * What the key shines through, cut to suit the angle it is shining at.
 *
 * A gobo is drawn in the plane facing the light and its shadow lands on a
 * floor, so the two are not the same shape: the flatter the light, the more
 * the floor stretches everything along the direction it is travelling. At the
 * angle sun comes through a window that factor is four or five, which is why a
 * set of slats cut to look right on paper arrives as two enormous stripes. So
 * the sizes here are stated as what they should measure *on the floor*, and
 * squashed by the sine of the light's elevation on the way in.
 *
 * The other half of it is that a gobo has to be bigger than the shadow map, not
 * smaller. Light simply passes either side of a cut-out that runs out, so the
 * pattern does not fade at its edge — it stops, mid-frame, on a hard line. What
 * a window actually is, and what this now builds, is an opaque wall with a hole
 * in it: dark outside, bright in the opening, bars across the opening.
 */
function createPatternGeometry(
  pattern: LightPatternId,
  radius: number,
  squash: number,
  extent: number,
): THREE.BufferGeometry | null {
  if (pattern === "none") return null;

  // Each piece is a flat quad: centre, half width, half height.
  const bars: [number, number, number, number][] = [];
  /** A floor measurement, in the gobo's own squashed vertical units. */
  const up = (floor: number): number => floor * squash;
  // Generously past the depth map, so no edge of the wall is ever the edge of
  // the pattern. Anything outside the map costs nothing: it is clipped.
  const edge = extent * 1.6;

  /** The wall around an opening, as four rectangles. */
  const wall = (halfWide: number, halfHigh: number): void => {
    bars.push([0, (edge + halfHigh) / 2, edge, (edge - halfHigh) / 2]);
    bars.push([0, -(edge + halfHigh) / 2, edge, (edge - halfHigh) / 2]);
    bars.push([(edge + halfWide) / 2, 0, (edge - halfWide) / 2, halfHigh]);
    bars.push([-(edge + halfWide) / 2, 0, (edge - halfWide) / 2, halfHigh]);
  };

  if (pattern === "window") {
    const halfWide = 3.6 * radius;
    const halfHigh = up(2.6 * radius);
    // Thick enough to survive the projection. A bar is seen from the side the
    // light is going, so a raking key squeezes it across — one cut thin enough
    // to look right on paper arrives as a scratch.
    const bar = 0.13 * radius;
    wall(halfWide, halfHigh);
    // A three-by-three sash, so the device stands in the middle pane.
    for (const sign of [-1, 1]) {
      bars.push([(sign * halfWide) / 3, 0, bar, halfHigh]);
      bars.push([0, (sign * halfHigh) / 3, halfWide, up(bar)]);
    }
  } else {
    // No opening, and no wall around one. A window is a hole in a wall and has
    // to be built as one; a blind is not — it is a stack of slats, and the
    // thing it does to a room is band the whole of it, floor and far wall
    // alike. Giving it a frame put the wall of the gobo across most of the
    // backdrop, which shadowed the backdrop rather than striping it: a room
    // with the blind pulled down and no window behind it.
    //
    // The slats run to the edge of the depth map instead, which is what stops
    // the pattern ending on a line partway across the frame — the fault the
    // frame was doing double duty to prevent.
    //
    // A venetian blind is mostly slat, too. Bands of light with hairlines
    // between them read as a scratched negative; bands of shade with light
    // between them read as a blind, and the ratio is most of what says which.
    const pitch = up(0.62 * radius);
    const slat = pitch * 0.56;
    const count = Math.ceil(edge / pitch);
    // Offset by half a pitch, so the middle of the frame falls in the daylight
    // between two slats rather than under one of them.
    for (let index = -count; index <= count; index += 1) {
      bars.push([0, (index + 0.5) * pitch, edge, slat / 2]);
    }
  }

  const positions = new Float32Array(bars.length * 4 * 3);
  const indices: number[] = [];
  bars.forEach(([x, y, halfWidth, halfHeight], bar) => {
    const corners = [
      [x - halfWidth, y - halfHeight],
      [x + halfWidth, y - halfHeight],
      [x + halfWidth, y + halfHeight],
      [x - halfWidth, y + halfHeight],
    ];
    corners.forEach(([cornerX, cornerY], corner) => {
      const vertex = bar * 4 + corner;
      positions[vertex * 3] = cornerX;
      positions[vertex * 3 + 1] = cornerY;
      positions[vertex * 3 + 2] = 0;
    });
    const base = bar * 4;
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  return geometry;
}

/**
 * Let the paper run out rather than stop.
 *
 * The sweep is built large enough to fill any sensible framing, but "any" is
 * not "every" — someone will zoom out — and a backdrop that ends shows a lit
 * edge against the void, which is the same tell the floor had. Softening the
 * top and the two sides costs one small texture and means there is no framing
 * that catches it.
 */
function createSweepFade(): THREE.Texture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (context) {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, size, size);
    // Read unflipped, the texture climbs the paper: the foot of the wall is at
    // the top of the canvas and the top of the wall at the bottom of it.
    const up = context.createLinearGradient(0, 0, 0, size);
    // A long dissolve rather than a short one. The paper has a top, and at
    // the heights a studio preset actually runs it to, that top is in frame —
    // where a short fade shows as a horizontal edge across the picture with
    // flat colour above it, which is the backdrop visibly stopping. Taken
    // across half the height it arrives at the scene's own background without
    // ever drawing a line.
    up.addColorStop(0, "#ffffff");
    up.addColorStop(0.45, "#ffffff");
    up.addColorStop(1, "#000000");
    context.fillStyle = up;
    context.fillRect(0, 0, size, size);
    // Nothing across. There used to be a fade at each side, from when the
    // paper was a strip that had to stop somewhere without showing an edge.
    // The paper is swept through a full turn now and closes on itself, so U
    // is an angle rather than a position — and fading its ends took a wedge
    // of a quarter of the circumference clean out of the wall, centred at U
    // nought, which is exactly the piece directly behind the device. The
    // whole back wall has been a hole with the scene's background showing
    // through it: no paper in frame, nothing for a pattern to land on, and a
    // flat field of colour where the backdrop should be.
  }
  const texture = new THREE.CanvasTexture(canvas);
  // Textures are flipped on upload by default, which would put the fade at the
  // foot of the paper rather than the top of it — the backdrop dissolving
  // exactly where it has to be solid.
  texture.flipY = false;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Where the floor gives way to the reflection under it, and where it ends.
 *
 * One gradient does two jobs, because both are the floor's own opacity at a
 * distance from the device.
 *
 * Near the centre it is the reflection: a real polished floor loses the
 * mirrored device with distance, because the surface is never perfectly flat
 * and a grazing angle carries less of it. Without that falloff the reflection
 * sits as hard as the device and reads as a second object standing upside
 * down. The stops are tight because the plane is forty subject radii across,
 * so the pool has to be a small fraction of it to stay under the device.
 *
 * At the rim it is the horizon. The plane is finite, and a finite plane has an
 * edge — a hard line across the frame where the floor stops and the backdrop
 * begins, which is exactly the tell that gives a rendered scene away. A real
 * sweep has no edge because it curves out of sight, so this one dissolves
 * instead: opaque where the device stands, gone by the time it would end.
 *
 * The strength is baked into the gradient rather than set as the material's
 * opacity, because three multiplies the two: an opacity of 0.3 would take the
 * whole floor to thirty percent, edges included, and the sweep would vanish.
 */
/**
 * How far the floor plane runs out, in subject radii from the middle.
 *
 * Larger than the furthest the cove is allowed to stand, so the two always
 * meet. Everything past the cove is behind an opaque wall and costs nothing.
 */
const FLOOR_HALF_EXTENT = 34;

/** The furthest out the paper may stand, in subject radii. */
const COVE_MAX = 28;

/**
 * How far the table is turned away from square.
 *
 * Enough that the near corner leads and both edges are legibly receding,
 * little enough that the top still reads as a flat plane the device is
 * standing squarely on rather than as a ramp. Measured against the render at
 * the default framing: at eight degrees it looks like a mistake, and past
 * twenty-five the device starts to look dropped onto a moving surface.
 */
const TABLE_YAW = (16 * Math.PI) / 180;

function createFloorFade(reflection: number, dissolve: boolean): THREE.Texture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (context) {
    const gradient = context.createRadialGradient(
      size / 2,
      size / 2,
      0,
      size / 2,
      size / 2,
      size / 2,
    );
    // Through an alpha map black is fully transparent and white fully opaque,
    // so the centre carries what is left of the floor once the reflection has
    // taken its share.
    const centre = Math.round(255 * (1 - Math.max(0, Math.min(1, reflection))));
    const hex = centre.toString(16).padStart(2, "0");
    // A tall device reflects further from its contact point than a small one,
    // and a fade that reaches three radii leaves a monitor's reflection nearly
    // untouched, so the pool closes within a few percent of the plane.
    // The stops are written in subject radii and converted, so the reflection
    // pool stays the size it was when the plane under it grew to reach the
    // cove. A gradient defined in the plane's own coordinates would have
    // scaled the pool with the floor and made the reflection change size with
    // the focal length.
    const at = (radii: number): number => (radii / FLOOR_HALF_EXTENT) * 0.5;
    gradient.addColorStop(0, `#${hex}${hex}${hex}`);
    gradient.addColorStop(at(0.3), `#${hex}${hex}${hex}`);
    gradient.addColorStop(at(1.4), "#ffffff");
    // Past the reflection the floor is simply floor, and what happens at its
    // rim depends on whether anything is standing there.
    //
    // With a backdrop up, nothing: the cove rises out of the floor and takes
    // over, so the floor has to arrive at full strength or there is a ring of
    // half-floor where the two meet. With no backdrop, the rim is the edge of
    // the world and has to be got rid of, so it dissolves — into the scene
    // background, which is now a real colour rather than a hole in the canvas.
    gradient.addColorStop(dissolve ? at(10) : 1, "#ffffff");
    gradient.addColorStop(1, dissolve ? "#000000" : "#ffffff");
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

/**
 * Rebuild the display's texture coordinates from its own geometry.
 *
 * Panels are frequently unwrapped into a corner of a shared atlas, which is
 * right for a wallpaper baked into the file and wrong for a design supplied at
 * runtime — that design would land squeezed into part of the panel and cropped
 * by the rest. Doing it here rather than in the file keeps a supplied model
 * byte for byte as its author sent it.
 *
 * A display is flat, so the two axes it spans are the two with any extent, and
 * position maps to texture coordinate along them. The remaining axis is the
 * panel's own thickness and is ignored.
 */
function unwrapScreen(meshes: readonly THREE.Mesh[]): void {
  for (const mesh of meshes) {
    // `Object3D.clone` shares geometry with its source, and the source is the
    // parsed model held in the cache for the life of the page. Writing to it
    // would reach every other scene built from the same file, so the panel
    // gets its own copy first. It is a handful of vertices.
    const geometry = mesh.geometry.clone();
    mesh.geometry = geometry;
    const position = geometry.getAttribute("position");
    if (!position) continue;

    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    if (!box) continue;
    const size = box.getSize(new THREE.Vector3()).toArray();
    const [horizontal, vertical] = [0, 1, 2]
      .sort((a, b) => size[b] - size[a])
      .slice(0, 2);
    if (!(size[horizontal] > 0) || !(size[vertical] > 0)) continue;

    const min = box.min.toArray();
    const uv = new Float32Array(position.count * 2);
    for (let index = 0; index < position.count; index += 1) {
      const point = [
        position.getX(index),
        position.getY(index),
        position.getZ(index),
      ];
      uv[index * 2] =
        (point[horizontal] - min[horizontal]) / size[horizontal];
      // Textures are uploaded unflipped, so v runs down from the top edge.
      uv[index * 2 + 1] = 1 - (point[vertical] - min[vertical]) / size[vertical];
    }
    geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  }
}

/**
 * Repair the materials a model got wrong, before anything else touches them.
 *
 * This runs once per built scene and on the scene's own material clones, so a
 * correction never reaches the cached source and never leaks between devices.
 * A named material the model does not contain is simply skipped, which keeps a
 * correction harmless if a re-export renames the part it describes.
 */
function applyMaterialCorrections(
  root: THREE.Object3D,
  device: DeviceDefinition,
): void {
  const corrections = device.materialCorrections;
  if (!corrections) return;

  for (const material of standardMaterials(root)) {
    const correction = corrections[material.name];
    if (!correction) continue;

    if (correction.color !== undefined) material.color.set(correction.color);
    if (correction.metalness !== undefined) {
      material.metalness = correction.metalness;
    }
    if (correction.roughness !== undefined) {
      material.roughness = correction.roughness;
    }
    material.needsUpdate = true;
  }
}

/**
 * What every material looks like once corrections are in and before any
 * colourway is chosen — in other words, what Natural means for this model.
 *
 * A finish is applied to the scene on screen rather than by rebuilding it, so
 * without somewhere to return to, leaving a colourway would leave its paint
 * behind and Natural would be reachable only by reloading the device.
 *
 * The base-colour texture is kept alongside the colour because a colourway can
 * set it aside — see `repaintedMaterials` — and Natural has to put it back.
 */
type BaseAppearance = { color: THREE.Color; map: THREE.Texture | null };
type BaseColors = Map<THREE.MeshStandardMaterial, BaseAppearance>;

function standardMaterials(root: THREE.Object3D): THREE.MeshStandardMaterial[] {
  const seen = new Set<THREE.MeshStandardMaterial>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of materials) {
      if (material instanceof THREE.MeshStandardMaterial) seen.add(material);
    }
  });
  return [...seen];
}

function captureBaseColors(root: THREE.Object3D): BaseColors {
  const colors: BaseColors = new Map();
  for (const material of standardMaterials(root)) {
    colors.set(material, { color: material.color.clone(), map: material.map });
  }
  return colors;
}

/**
 * Repaint the materials a colourway names.
 *
 * Only base colour is rewritten. Metalness and roughness stay as the model's
 * author set them, so a brushed enclosure stays brushed and a polished rail
 * stays polished — the finish changes the colour, not the material.
 *
 * Every material is returned to its captured colour first, so a colourway
 * describes the whole device rather than the difference from whichever
 * colourway happened to precede it.
 */
function applyFinish(
  baseColors: BaseColors,
  device: DeviceDefinition,
  finish: FinishId,
): void {
  const colorway = device.finishes?.[finish];
  const body = new Set(device.bodyMaterials ?? []);
  const repainted = new Set(device.repaintedMaterials ?? []);
  const accents = colorway?.accents ?? {};

  for (const [material, base] of baseColors) {
    // An accent wins over the shell, so a band keeps its own colour.
    const hex =
      accents[material.name] ??
      (colorway && body.has(material.name) ? colorway.body : null);
    if (hex) material.color.set(hex);
    else material.color.copy(base.color);

    // A painted material whose own colour lives in its texture has to lose the
    // texture, or the paint only tints it. Natural restores it, which is why
    // the map was captured rather than discarded.
    if (repainted.has(material.name)) {
      material.map = hex ? null : base.map;
    }
    material.needsUpdate = true;
  }
}

/**
 * Find a scene by the name the file gives it.
 *
 * The loader runs every name through three.js's own sanitiser, which strips
 * the characters its animation paths reserve — `.` among them. A file that
 * names its scenes `Scene.001` and `Scene.002`, as Blender does by default,
 * therefore arrives as `Scene001` and `Scene002` and never matches the catalog
 * on a plain comparison. Matching both forms keeps the catalog readable as the
 * file writes it, and stops a miss falling back silently to the default scene
 * and rendering the wrong device.
 */
function sanitizeSceneName(name: string): string {
  return name.replace(/\s/g, "_").replace(/[[\]./:]/g, "");
}

function findScene(
  scenes: readonly THREE.Group[],
  wanted: string,
): THREE.Group | undefined {
  const exact = scenes.find((entry) => entry.name === wanted);
  if (exact) return exact;
  const sanitized = sanitizeSceneName(wanted);
  return scenes.find((entry) => sanitizeSceneName(entry.name) === sanitized);
}

/**
 * The surface maps, fetched once per session and shared by every scene.
 *
 * Cached as promises rather than as textures so that two scenes asking at the
 * same moment — the preview and the export renderer do exactly this — make one
 * request between them rather than one each. Nothing here is disposed: these
 * outlive any scene that uses them, and a table switched off and on again
 * should not pay for its own maps twice.
 */
const surfaceTextures = new Map<string, Promise<THREE.Texture>>();

function loadSurfaceTexture(
  renderer: THREE.WebGLRenderer,
  file: string,
  color: boolean,
): Promise<THREE.Texture> {
  const cached = surfaceTextures.get(file);
  if (cached) return cached;
  const pending = new THREE.TextureLoader()
    .loadAsync(`${import.meta.env.BASE_URL}textures/${file}`)
    .then((texture) => {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      // Colour is the only one of the three that is a colour. A normal is a
      // direction and a roughness is a number, and putting either through the
      // sRGB curve bends values the shader reads literally.
      if (color) texture.colorSpace = THREE.SRGBColorSpace;
      // A tabletop is the one surface in this scene always seen at a grazing
      // angle, which is precisely the case trilinear filtering handles worst:
      // the mip is chosen for the axis that is compressed, so the axis that is
      // not goes to mush a few centimetres past the front edge.
      texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
      return texture;
    })
    .catch((error: unknown) => {
      // Not left in the cache, so the next attempt is a real attempt.
      surfaceTextures.delete(file);
      throw error;
    });
  surfaceTextures.set(file, pending);
  return pending;
}

export async function buildDeviceScene(options: {
  backgroundColor: string;
  device: DeviceDefinition;
  environmentUrl: string;
  finish: FinishId;
  floor: FloorSettings;
  lighting: LightingSettings;
  /** Called when a surface's maps land, so the frame can be drawn again. */
  onSurfaceReady?: () => void;
  renderer: THREE.WebGLRenderer;
  /** Multiplier on the depth map's resolution; an export turns this up. */
  shadowDetail?: number;
  showGround: boolean;
  surface: SurfaceSettings;
  sweep: SweepSettings;
}): Promise<DeviceScene> {
  const scene = new THREE.Scene();
  const disposables: { dispose: () => void }[] = [];

  const [gltf, environment] = await Promise.all([
    loadModel(`${import.meta.env.BASE_URL}models/${options.device.modelFile}`),
    loadEnvironment(options.renderer, options.environmentUrl),
  ]);

  // The convolved environment is the whole base lighting model: every material
  // samples the mip level matching its roughness, so a polished rail and a
  // matte back read correctly from one texture with no lights at all. It is
  // cached, so it belongs to the cache rather than to this scene.
  scene.environment = environment;
  // The captured studio is the base layer of the lighting model; everything
  // below is placed on top of it rather than replacing it.
  scene.environmentIntensity = options.lighting.environmentIntensity;

  // Several of these files hold more than one device in sibling scenes, and the
  // default scene is not always the one named on the tin — loading `gltf.scene`
  // from `iphone-5.glb` would render the phone rather than the iMac beside it.
  const sourceSubject = options.device.sceneName
    ? (findScene(gltf.scenes, options.device.sceneName) ?? gltf.scene)
    : gltf.scene;
  const subject = cloneForScene(sourceSubject);

  if (options.device.yawDegrees) {
    subject.rotation.y = THREE.MathUtils.degToRad(options.device.yawDegrees);
    subject.updateMatrixWorld(true);
  }

  // Corrections first: a colourway paints over a repaired material, never the
  // other way round, and Natural returns to the repaired model rather than to
  // the file as shipped.
  // Before anything measures or paints: this replaces the geometry.
  if (options.device.creaseAngleDegrees !== undefined) {
    creaseNormals(subject, options.device.creaseAngleDegrees);
  }

  applyMaterialCorrections(subject, options.device);
  const baseColors = captureBaseColors(subject);
  applyFinish(baseColors, options.device, options.finish);

  const excluded = new Set(options.device.excludedNodes);
  subject.traverse((object) => {
    if (excluded.has(object.name)) {
      object.visible = false;
      return;
    }
    if (object instanceof THREE.Mesh) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });

  // Bounds are measured after hiding stray meshes, so framing and shadow extent
  // derive from the device alone.
  const bounds = new THREE.Box3();
  subject.traverse((object) => {
    if (object instanceof THREE.Mesh && object.visible) {
      bounds.expandByObject(object);
    }
  });
  const sphere = bounds.getBoundingSphere(new THREE.Sphere());
  const centre = bounds.getCenter(new THREE.Vector3());

  // Recentre on the origin so orbiting turns the device about itself rather
  // than swinging it around wherever it sat in the source file.
  subject.position.sub(centre);
  scene.add(subject);

  const groundY = bounds.min.y - centre.y;
  /**
   * Where the room's floor is, which is not where the device's feet are.
   *
   * With no table the two are the same: the device stands on the ground. Put a
   * table under it and the ground has to drop by the height of the table,
   * because the device has not moved — it is standing on the top, and the top
   * is where its feet always were. Everything that belongs to the room rather
   * than to the subject hangs off this: the floor plane, the foot of the cove,
   * the lamp that washes it.
   */
  let floorY = groundY;
  let groundMesh: THREE.Mesh | null = null;
  let groundSurface: THREE.MeshStandardMaterial | null = null;

  /**
   * The device again, upside down under the floor.
   *
   * A true planar reflection renders the whole scene a second time through a
   * mirrored camera. On a flat floor with one object, drawing that object
   * mirrored costs one pass over geometry already on the GPU and is not
   * tellable apart. It casts nothing and is never hit by the pointer: it is a
   * picture of the device, not a second device.
   *
   * Every material in this set is double sided, so the negative scale that
   * does the mirroring does not turn the surfaces inside out.
   */
  let ground: THREE.Mesh;
  const mirror = subject.clone(true);
  mirror.scale.y *= -1;
  mirror.position.y = 2 * groundY - subject.position.y;
  mirror.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.castShadow = false;
    object.receiveShadow = false;
  });
  mirror.visible = false;
  // Drawn before the floor, so the floor's own transparency is what decides
  // how much of it survives.
  mirror.renderOrder = -1;
  scene.add(mirror);

  /**
   * The floor with nothing on it but the shadow.
   *
   * Turning the backdrop off exports a transparent PNG, which is only useful
   * if the device still sits on something once it is composited. A shadow
   * material draws the shadow and nothing else, so the plane stays where it
   * was and everything that was not in shadow comes out clear.
   */
  let shadowSurface: THREE.ShadowMaterial | null = null;
  /** Whether the backdrop is showing, as opposed to the shadow catcher. */
  let groundVisible = options.showGround;

  {
    // Wider than the paper can ever stand out, so the floor always arrives at
    // the foot of the cove rather than stopping short of it in a ring.
    const groundGeometry = new THREE.PlaneGeometry(
      sphere.radius * FLOOR_HALF_EXTENT * 2,
      sphere.radius * FLOOR_HALF_EXTENT * 2,
    );
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(options.backgroundColor),
      roughness: 0.92,
      transparent: false,
    });
    // Weighted rather than solid: a composited shadow is being dropped onto a
    // background this app has never seen, and one that arrives at full black
    // cannot be lightened again.
    const shadowMaterial = new THREE.ShadowMaterial({ opacity: 0.42 });
    ground = new THREE.Mesh(
      groundGeometry,
      options.showGround ? groundMaterial : shadowMaterial,
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = floorY - sphere.radius * 0.002;
    ground.receiveShadow = true;
    ground.renderOrder = 0;
    scene.add(ground);
    groundMesh = ground;
    groundSurface = groundMaterial;
    shadowSurface = shadowMaterial;
    disposables.push(groundGeometry, groundMaterial, shadowMaterial);
  }

  /**
   * The sweep: the same paper as the floor, carrying on upwards.
   *
   * A separate mesh rather than one surface with the floor, because the floor
   * has to be see-through in the middle — that is how the reflection under the
   * device is seen — and the sweep must not be. Sharing a material would mean
   * one alpha map doing two unrelated jobs on two parts of the same texture.
   *
   * It writes depth and draws first so the floor cannot paint over it: both
   * are transparent, the floor runs on past the sweep underneath it, and
   * without an order the far half of the floor would be laid across the wall.
   */
  let sweepMesh: THREE.Mesh | null = null;
  let sweepSurface: THREE.MeshStandardMaterial | null = null;
  let sweepGeometry: THREE.BufferGeometry | null = null;
  let sweepHeight = 0;
  /** The shape the current strip was cut to, so it is not recut for nothing. */
  let sweepShape = "";
  let sweepLight: THREE.PointLight | null = null;

  {
    const fade = createSweepFade();
    const material = new THREE.MeshStandardMaterial({
      alphaMap: fade,
      color: new THREE.Color(options.backgroundColor),
      depthWrite: true,
      side: THREE.DoubleSide,
      transparent: true,
    });
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
    mesh.receiveShadow = true;
    mesh.renderOrder = -1;
    mesh.visible = false;
    scene.add(mesh);
    sweepMesh = mesh;
    sweepSurface = material;
    disposables.push(fade, material, {
      dispose: () => sweepGeometry?.dispose(),
    });

    // Inverse-square falloff, which is the whole reason it is here, and no
    // shadow: it exists to shape the paper, and a second set of shadows on the
    // device would read as a room with two suns in it.
    const lamp = new THREE.PointLight(0xffffff, 0, 0, 2);
    lamp.castShadow = false;
    lamp.visible = false;
    // It cannot be flagged off the device the way its equivalent on a real set
    // would be. Layers look like the tool for that and are not: three tests a
    // light's layers against the camera's, not against each object's, so a
    // light moved onto a channel the camera does not draw is not restricted —
    // it is switched off. Keeping it off the subject is therefore a matter of
    // where it is put, which is what the placement below is for.
    scene.add(lamp);
    sweepLight = lamp;
  }

  /**
   * Rebuild the paper at the height and bend asked for.
   *
   * The shape genuinely changes, so there is nothing to interpolate: this
   * throws the old strip away and lays a new one. It is a hundred vertices, so
   * doing that on every frame of a drag costs less than deciding not to.
   */
  /**
   * How far out the paper stands.
   *
   * Far enough that the camera is always inside it. That is not a nicety: the
   * paper is drawn double-sided, so a camera that ends up outside the set sees
   * the back of the wall, and a two-hundred-millimetre lens pulls back four
   * times as far as a twenty-four does. The framing distance is derived from
   * the subject and the field of view, so it can simply be read off the camera
   * that was placed with it.
   *
   * Quantised, because this is consulted whenever the camera moves and the
   * answer is a vertex buffer. A focal-length drag should recut the set a
   * handful of times, not sixty times a second.
   */
  const COVE_STEP = 2;
  /** The radius the current paper was cut to, so it is not recut for nothing. */
  let builtCoveRadius = 0;
  /** What the wash lamp has to run at to reach paper standing that far out. */
  let sweepFalloff = 30;
  const coveRadius = (): number => {
    const framing = camera.position.length() / sphere.radius;
    const wanted = Math.min(COVE_MAX, Math.max(6, framing * 1.45));
    return sphere.radius * Math.ceil(wanted / COVE_STEP) * COVE_STEP;
  };

  const applySweep = (sweep: SweepSettings): void => {
    if (!sweepMesh) return;
    const height = Math.max(0, Math.min(1, sweep.height));
    const curve = Math.max(0, Math.min(1, sweep.curve));
    const standoff = coveRadius();
    const bend = sphere.radius * (0.4 + 7.6 * curve);
    sweepHeight = height;
    sweepMesh.visible = groundVisible && height > 0;

    // Everything the scene can absorb comes through here, so this runs when a
    // light moves as much as when the paper does. Recutting the strip either
    // way would throw away a vertex buffer and upload another one on every
    // frame of a drag that had nothing to do with the backdrop.
    builtCoveRadius = standoff;
    const shape = `${height}/${curve}/${standoff}/${floorY}`;
    if (height > 0 && shape !== sweepShape) {
      sweepShape = shape;
      sweepGeometry?.dispose();
      sweepGeometry = createSweepGeometry(
        standoff,
        bend,
        sphere.radius * 16 * height,
      );
      sweepMesh.geometry = sweepGeometry;
      // How deep the depth map has to reach depends on where the paper now
      // stands, so moving the paper re-frames the shadow as surely as moving
      // the key does.
      frameShadow(key.position);
      // The paper leaves the floor, so it starts where the floor is.
      sweepMesh.position.y = floorY - sphere.radius * 0.0015;
    }

    if (sweepLight) {
      const strength = Math.max(0, Math.min(1, sweep.light));
      if (height > 0) {
        // With paper up, the lamp goes where its equivalent goes on a real
        // set: on the floor, tucked into the bend, hidden behind the subject,
        // throwing a pool at the foot of the wall that falls away as it
        // climbs. That gradient is what the sweep is prized for.
        sweepLight.position.set(
          0,
          floorY + sphere.radius * 0.35,
          // Just inside the foot of the paper rather than tucked behind it.
          // The cove leans away as it rises, so a lamp set even slightly
          // beyond the foot ends up on the wrong side of a wall that is
          // nearly vertical whenever the bend is shallow.
          -standoff + sphere.radius * 0.3,
        );
        // And it is given a range that runs out before it gets to the device.
        // This is the card the gaffer puts beside it, done the only way this
        // renderer offers: past this distance the light contributes nothing at
        // all, so the subject is not touched by it and, more visibly, neither
        // is the polished floor in front of it — where a lamp with unlimited
        // range leaves its own reflection sitting under the device like a
        // puddle nobody put there.
        sweepLight.distance = standoff + bend * 0.12;
        // Inverse-square, and the paper is now as far away as the framing
        // needs it to be rather than at a fixed two and a half radii. Without
        // this the graduation quietly disappears on a long lens, which pushes
        // the whole set back and takes four times the light with it.
        sweepFalloff = (standoff / sphere.radius) ** 2 * 4.8;
      } else {
        // With no paper there is nothing behind to wash, and the only surface
        // left is the floor — so the lamp goes overhead instead and the pool
        // lands around the device, falling to nothing at the edges of frame.
        // Same light, same falloff, the one thing in the rig that has any.
        //
        // Here it is allowed to reach the device, because a light hanging over
        // a subject and pooling on the floor around it is not a light that has
        // gone wrong: it is what a spotlight is.
        sweepLight.position.set(
          0,
          floorY + sphere.radius * 3.4,
          -sphere.radius * 0.5,
        );
        sweepLight.distance = 0;
      }
      // Falloff is by the square of the distance, so an intensity that suits a
      // watch would be invisible on an iMac unless it grows with the set. The
      // tucked lamp is inches from what it lights and the overhead one is
      // several radii above it, so the same slider has to mean different
      // amounts of light in the two placements to arrive at the same strength.
      const reach = height > 0 ? sweepFalloff : 42;
      sweepLight.intensity = strength * reach * sphere.radius * sphere.radius;
      sweepLight.visible = groundVisible && strength > 0;
    }
  };

  /**
   * The table, when there is one.
   *
   * It does not sit on the floor, it replaces it. Both at once would put two
   * surfaces at the same height and leave them fighting over every pixel, and
   * more to the point the endless floor is the thing whose absence makes an
   * edge mean anything.
   */
  let surfaceMesh: THREE.Mesh | null = null;
  let surfaceGeometry: THREE.BufferGeometry | null = null;
  let legMesh: THREE.Mesh | null = null;
  let legGeometry: THREE.BufferGeometry | null = null;
  let surfaceKind = "none";
  /** Remembered so a table can re-place the paper without being handed it. */
  let lastSweep: SweepSettings = options.sweep;
  const surfaceSurface = new THREE.MeshStandardMaterial({
    color: new THREE.Color("#ffffff"),
    roughness: 1,
  });
  /** Which material the slab is currently wearing, so it is dressed once. */
  let surfaceDressed = "";
  /**
   * The maps still in flight, so a caller can wait for a finished slab.
   *
   * The preview does not wait — it shows the untextured slab for a frame and
   * then the textured one, which is what progressive loading is for. An export
   * cannot: it takes one frame and writes it to a file, and a file is not
   * something the user can wait a moment longer for. So the build resolves
   * only once the surface it was asked for is actually wearing its maps.
   */
  let surfaceReady: Promise<unknown> = Promise.resolve();

  /**
   * Put a material on the slab, and its maps on when they arrive.
   *
   * The maps are fetched rather than bundled, so there is a window where the
   * table exists and its texture does not. That window is handled rather than
   * hidden: the untextured slab is already the right colour and roughness, so
   * what lands is detail rather than a different object, and the frame is
   * redrawn when it does. Switching away mid-flight is checked for, because a
   * texture that arrives after the user has chosen something else would dress
   * the slab as the material they just left.
   */
  const dressSurface = (definition: SurfaceDefinition): void => {
    if (surfaceDressed === definition.value) return;
    surfaceDressed = definition.value;
    surfaceSurface.color.set(definition.color);
    surfaceSurface.metalness = definition.metalness;
    surfaceSurface.roughness = definition.roughness;
    surfaceSurface.normalScale.set(
      definition.normalScale,
      definition.normalScale,
    );
    surfaceSurface.map = null;
    surfaceSurface.normalMap = null;
    surfaceSurface.roughnessMap = null;
    surfaceSurface.needsUpdate = true;
    const maps = definition.maps;
    if (!maps) return;
    surfaceReady = Promise.all([
      loadSurfaceTexture(options.renderer, maps.albedo, true),
      loadSurfaceTexture(options.renderer, maps.normal, false),
      loadSurfaceTexture(options.renderer, maps.roughness, false),
    ])
      .then(([albedo, normal, roughness]) => {
        if (surfaceDressed !== definition.value) return;
        for (const texture of [albedo, normal, roughness]) {
          texture.repeat.set(definition.tiles, definition.tiles);
        }
        surfaceSurface.map = albedo;
        surfaceSurface.normalMap = normal;
        surfaceSurface.roughnessMap = roughness;
        surfaceSurface.needsUpdate = true;
        applyFloorEnvironment();
        options.onSurfaceReady?.();
      })
      .catch(() => {
        // A map that will not load leaves a slab of the right colour and
        // roughness, which is a plain material rather than a broken one.
        // Clearing the record lets the next choice of this surface retry.
        if (surfaceDressed === definition.value) surfaceDressed = "";
      });
  };
  /**
   * The legs, as their own mesh.
   *
   * Separate because they are a different material, and a different material
   * is the whole reason they read: a thin dark metal post under a pale stone
   * top is the shape of every table anyone photographs a computer on. Merged
   * into the top they would have had to wear a stone map at a scale chosen for
   * a surface a hundred times their width, which tiles one vein down the
   * length of a leg and reads as a painted stick.
   */
  const legSurface = new THREE.MeshStandardMaterial({
    color: new THREE.Color(SURFACE_LEG.color),
    metalness: SURFACE_LEG.metalness,
    roughness: SURFACE_LEG.roughness,
  });
  {
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), legSurface);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.visible = false;
    mesh.position.y = groundY;
    mesh.rotation.y = TABLE_YAW;
    scene.add(mesh);
    legMesh = mesh;
    disposables.push(legSurface, {
      dispose: () => legGeometry?.dispose(),
    });
  }

  {
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), surfaceSurface);
    // It throws a shadow now, and has to. It is an object standing on a floor
    // with a room behind it, and an object that takes light without returning
    // any is the single clearest tell that a scene was assembled rather than
    // photographed. The reason it did not before was that it was a plinth
    // pressed against the paper, where its shadow was a black band along the
    // join; a table with air behind it has no such join.
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.visible = false;
    mesh.position.y = groundY;
    // Turned, so a corner leads and two edges run away from it. A rectangle
    // presented square-on gives one edge doing all the work and reads as a
    // shelf; the three-quarter view is what says furniture. The device is left
    // facing the camera, because it is the subject and the table is the set.
    mesh.rotation.y = TABLE_YAW;
    scene.add(mesh);
    surfaceMesh = mesh;
    disposables.push(surfaceSurface, {
      dispose: () => surfaceGeometry?.dispose(),
    });
  }

  /**
   * Put the device on a table, or take it off one.
   *
   * Three things move together, and they have to. The floor goes, because a
   * table and an endless floor at the same height are two claims about where
   * the device is standing. The reflection goes with it: it is a mirrored copy
   * seen *through* a transparent floor, and with an opaque slab in the way
   * there is nothing to see it through — it would hang under the table in open
   * air. And the backdrop moves back behind the table's far edge, because a
   * sweep rising out of the middle of a desk is a wall growing out of the
   * furniture.
   */
  /**
   * What the camera has to hold, and where the middle of it is.
   *
   * The table's corners are taken through the same turn the table is, so a
   * box drawn round them is the box the turned table actually occupies rather
   * than the one it would occupy square-on.
   */
  const framing = new THREE.Box3();
  const target = new THREE.Vector3();
  const measureFraming = (): void => {
    framing.setFromObject(subject);
    const size = options.device.surface;
    if (surfaceKind !== "none" && size) {
      const turn = new THREE.Matrix4().makeRotationY(TABLE_YAW);
      const corner = new THREE.Vector3();
      for (const x of [-size.left, size.right]) {
        for (const z of [-size.back, size.front]) {
          for (const y of [0, -size.stand]) {
            corner
              .set(x * sphere.radius, groundY + y * sphere.radius, z * sphere.radius)
              .applyMatrix4(turn);
            framing.expandByPoint(corner);
          }
        }
      }
    }
    framing.getCenter(target);
  };

  const applySurface = (surface: SurfaceSettings): void => {
    const definition = readSurfaceDefinition(
      options.device.surface ? surface.kind : "none",
    );
    const wanted = definition.value;
    const on = wanted !== "none";
    if (wanted !== surfaceKind) {
      surfaceKind = wanted;
      dressSurface(definition);
      // The device has not moved: it is standing on the top, and the top is
      // where its feet already were. So it is the room that drops.
      floorY =
        on && options.device.surface
          ? groundY - options.device.surface.stand * sphere.radius
          : groundY;
      placeFloor();
      if (on && options.device.surface) {
        surfaceGeometry?.dispose();
        surfaceGeometry = createSurfaceGeometry(
          options.device.surface,
          sphere.radius,
          false,
          definition.bevel,
        );
        if (surfaceMesh) surfaceMesh.geometry = surfaceGeometry;
        legGeometry?.dispose();
        legGeometry =
          options.device.surface.leg > 0
            ? createSurfaceGeometry(
                options.device.surface,
                sphere.radius,
                true,
                definition.bevel,
              )
            : null;
        if (legMesh) legMesh.geometry = legGeometry ?? new THREE.BufferGeometry();
      }
    }
    if (surfaceMesh) surfaceMesh.visible = on && groundVisible;
    if (legMesh) legMesh.visible = on && groundVisible && legGeometry !== null;
    measureFraming();
    updateMirrorVisibility();
    applyGroundVisibility();
    applyFloorEnvironment();
    applyBounce();
  };

  /** How much reflection the floor is currently letting through. */
  let floorReflection = 0;
  /** Whether the floor's rim is currently drawn as dissolving. */
  let floorDissolves = true;
  /** The floor's own share of the captured room, 0 to 1. */
  let floorEnvironment = 1;

  /**
   * Scale the captured room down for the floor alone.
   *
   * three.js hands `scene.environment` to every material that has none of its
   * own — and, in doing so, overwrites that material's `envMapIntensity` with
   * the scene's. A per-material share is therefore only possible for a
   * material holding its own reference to the same texture, which is what this
   * gives the floor. Everything else in the scene keeps the shared path.
   *
   * The two scales multiply rather than replace: turning the studio down still
   * dims the floor, and the floor's own share says how much of whatever is
   * left it picks up.
   */
  const applyFloorEnvironment = (): void => {
    const map = scene.environment;
    const share = floorEnvironment * scene.environmentIntensity;
    // The table takes the same control as the floor it replaced — it is the
    // surface the device is standing on, and that is what the control is about
    // — scaled by how much of the room a material of its finish would actually
    // return. A matte slab shows the room as a wash and a sealed board shows
    // it as a reflection, and handing both the same share flattens one or
    // gilds the other.
    const table = readSurfaceDefinition(surfaceKind).environmentShare;
    for (const [surface, own] of [
      [groundSurface, 1],
      [sweepSurface, 1],
      [surfaceSurface, table],
    ] as const) {
      if (!surface) continue;
      if (surface.envMap !== map) {
        surface.envMap = map;
        // Gaining or losing an environment map changes which shader the
        // material compiles, which is the one case that needs more than a new
        // uniform.
        surface.needsUpdate = true;
      }
      surface.envMapIntensity = share * own;
    }
  };

  /**
   * Hide the reflection when the camera drops below the floor.
   *
   * The reflection is only a reflection because it is seen through a floor
   * that fades it. From underneath there is no floor to see it through — the
   * plane is single sided, so it culls — and the mirrored device is simply
   * exposed, upside down and at full strength. A low hero angle is a normal
   * thing to want, so this has to be handled rather than avoided.
   */
  const updateMirrorVisibility = (): void => {
    mirror.visible =
      floorReflection > 0 &&
      groundVisible &&
      surfaceKind === "none" &&
      camera.position.y > ground.position.y;
  };

  /** Move the room to wherever its floor now is. */
  const placeFloor = (): void => {
    if (groundMesh) groundMesh.position.y = floorY - sphere.radius * 0.002;
    mirror.position.y = 2 * floorY - subject.position.y;
  };

  /**
   * Put something behind everything, or nothing at all.
   *
   * The renderer is built with `alpha: true` and clears to transparent, which
   * is exactly right for an export with the backdrop off: the device and its
   * shadow come out on a clear ground. With the backdrop *on* it was the
   * reason the set visibly stopped — above the paper, past the floor's rim and
   * out at the sides there was no geometry, so the canvas was simply
   * see-through and what showed was the page behind it. A set that ends in a
   * hole is not a set.
   *
   * So the backdrop colour goes in as the scene's own background. The paper
   * still does the work in frame; this is what the paper fades into instead of
   * into nothing, and it means no framing, focal length or orbit can find an
   * edge to fall off.
   */
  const applyBackground = (): void => {
    if (!groundVisible) {
      scene.background = null;
      return;
    }
    const colour = groundSurface?.color ?? new THREE.Color(options.backgroundColor);
    if (scene.background instanceof THREE.Color) scene.background.copy(colour);
    else scene.background = colour.clone();
  };

  /**
   * The floor plane has two jobs, and a table only takes one of them.
   *
   * With the backdrop on it is the ground, and a table replaces it. With the
   * backdrop off it is the shadow catcher — the invisible surface that lets a
   * transparent export come out with the device's shadow still under it — and
   * nothing replaces that, because the table is hidden then too. So it stands
   * down for a table only while there is a backdrop for the table to be part
   * of.
   */
  const applyGroundVisibility = (): void => {
    // The floor stays. It used to stand down for a table, because the table
    // was a plinth filling the bottom of frame and two surfaces at one height
    // would have fought over every pixel. Now the table stands *on* the floor
    // with the room continuing under and around it, so hiding the floor would
    // leave the legs in mid-air over nothing.
    if (groundMesh) groundMesh.visible = true;
  };

  let floorFade: THREE.Texture | null = null;

  const applyFloor = (floor: FloorSettings): void => {
    const next = Math.max(0, Math.min(1, floor.reflection));
    if (groundSurface) {
      const roughness = Math.max(0.02, Math.min(1, floor.roughness));
      groundSurface.roughness = roughness;
      // The same finish on the sweep, because it is the same surface. Any
      // difference between them draws a horizontal line across the frame where
      // one meets the other, which is precisely the join a real backdrop
      // exists to avoid.
      if (sweepSurface) sweepSurface.roughness = roughness;
      floorEnvironment = Math.max(0, Math.min(2, floor.environment));
      applyFloorEnvironment();
      // The floor is see-through in two places whatever the reflection is
      // doing — under the device, by however much it mirrors, and at the rim,
      // where it has to dissolve rather than end — so the map and the
      // transparent pass are not optional. Only its centre depends on the
      // setting, which is the one thing that has to be redrawn.
      const dissolve = sweepHeight <= 0;
      if (next !== floorReflection || dissolve !== floorDissolves || !floorFade) {
        floorDissolves = dissolve;
        floorFade?.dispose();
        floorFade = createFloorFade(next, dissolve);
        groundSurface.alphaMap = floorFade;
        groundSurface.transparent = true;
        // A floor that wrote depth would hide the mirrored device beneath it
        // and stop the backdrop showing through where it fades out.
        groundSurface.depthWrite = false;
        groundSurface.needsUpdate = true;
      }
    }
    floorReflection = next;
    updateMirrorVisibility();
  };

  // A placeable three-point rig on top of the captured studio. The key is the
  // only shadow caster: a second shadow map would read as two suns, which is
  // the giveaway of a rendered product shot rather than a photographed one.
  // Every distance is expressed in subject radii, so one rig frames a watch and
  // a laptop alike.
  const keyDirection = new THREE.Vector3(
    options.lighting.keyDirection.x,
    // The pad reads in screen coordinates, where up is negative.
    -options.lighting.keyDirection.y,
    1,
  );
  if (keyDirection.lengthSq() < 1e-6) keyDirection.set(0, 0, 1);
  keyDirection.normalize();

  const key = new THREE.DirectionalLight(
    new THREE.Color(options.lighting.keyColor),
    options.lighting.keyIntensity,
  );
  key.position
    .copy(keyDirection)
    .multiplyScalar(sphere.radius * 4)
    .add(new THREE.Vector3(0, sphere.radius * 2, 0));
  key.castShadow = true;
  /**
   * How far a surface is pushed away from the light before it is compared.
   *
   * Stated in world units rather than as the depth-buffer figure it becomes,
   * because the buffer's range is no longer fixed: the paper now stands as far
   * out as the framing needs, and a bias that is a constant fraction of a
   * range that quadruples is a bias that quadruples with it, which detaches a
   * shadow from the thing casting it.
   */
  const SHADOW_BIAS = sphere.radius * 0.008;
  /** Remembered so a pattern can re-decide the map size without it. */
  let lastSoftness = options.lighting.shadowSoftness;
  /**
   * Set the shadow's edge, and give it enough map to be worth setting.
   *
   * Softness is a blur radius measured in shadow-map texels, so the two have
   * to move together: a crisp edge asks the map for detail a blurred one threw
   * away, and reading it off 1024 texels spread across the whole subject
   * returns a staircase rather than an edge. Doubling the map is only paid for
   * when the shadow is crisp enough to show it, and only when the map is
   * redrawn — which is on change, not on every frame.
   */
  const applyShadowEdge = (softness: number): void => {
    const amount = Math.max(0, Math.min(1, softness));
    lastSoftness = amount;
    key.shadow.radius = 0.35 + 11 * amount;
    // A patterned map covers the backdrop as well as the floor, so it is
    // spread over four times the area and needs the texels back — and an
    // export, drawn once and enlarged to four thousand pixels, can afford
    // more of them than a preview being dragged around can.
    const detail = Math.max(1, options.shadowDetail ?? 1);
    const wanted = Math.min(
      4096,
      (amount < 0.35 || patterned ? 2048 : 1024) * detail,
    );
    if (key.shadow.mapSize.x !== wanted) {
      key.shadow.mapSize.set(wanted, wanted);
      // three allocates the depth target from mapSize on first use and never
      // looks again, so the old one has to go for a new size to take.
      key.shadow.map?.dispose();
      key.shadow.map = null;
    }
  };
  applyShadowEdge(options.lighting.shadowSoftness);

  /** The half-width of the depth map's view, in world units. */
  let shadowExtent = 0;
  /**
   * Whether a cut-out is in the light, which changes what the depth map is for.
   *
   * With no pattern the map exists to draw the device's own shadow, and it
   * should be wrapped as tightly around the device as the rake allows, because
   * every texel spent elsewhere is detail lost from the one edge anybody looks
   * at. With a pattern it also has to reach the backdrop — a window that lands
   * on the floor and stops at the skirting is not a window, it is a rug — and
   * that is a far larger volume for the same number of texels. The map is
   * doubled to pay for it.
   */
  let patterned = false;

  /**
   * Size the depth map's view to the shadow the key is about to throw.
   *
   * A fixed box works only while the key stays overhead. Rake it towards the
   * horizon and the shadow lengthens without limit — the flatter the light, the
   * further it reaches — and anything past the box is simply not drawn, which
   * shows up as the shadow stopping dead along a straight line in the middle of
   * the floor. The box therefore follows the light: a shadow of something one
   * radius tall reaches horizontal-over-height radii along the ground, and that
   * is exactly how much room it needs.
   *
   * The cap is there because a light approaching the horizon asks for a box
   * approaching infinity, and past a point the map is spread so thin the shadow
   * it draws is worse than the one it clipped.
   */
  /**
   * How wide the depth map's view has to be to hold the paper, not just the floor.
   *
   * Measured off the set rather than picked, because the answer moves with all
   * three things it depends on: how far out the cove is standing, how high the
   * paper has been run up, and how steeply the key is raked. A point's distance
   * from the light's axis is what the box has to cover, so this takes the
   * furthest points of the cove that a normal framing can see — the foot and a
   * few radii up it, on the far side and on both flanks — and returns the
   * worst of them.
   *
   * Only the lower part of the paper is considered. A backdrop run to its full
   * height is sixteen radii of wall, almost none of it ever in frame, and
   * sizing the box to cover all of it would spread the map so thin that the
   * device's own shadow — the one edge anybody actually looks at — would go
   * to pieces to light a wall nobody can see.
   */
  const reachPaper = (position: THREE.Vector3): number => {
    const axis = position.clone().normalize();
    const flat = new THREE.Vector3(position.x, 0, position.z);
    if (flat.lengthSq() < 1e-6) flat.set(0, 0, 1);
    flat.normalize();
    const radius = Math.max(builtCoveRadius, sphere.radius * 6);
    const rise = Math.min(sweepHeight * sphere.radius * 16, sphere.radius * 6);
    let worst = 0;
    const probe = new THREE.Vector3();
    for (const height of [floorY, floorY + rise]) {
      for (const [x, z] of [
        [-flat.x, -flat.z],
        [flat.z, -flat.x],
        [-flat.z, flat.x],
      ]) {
        probe.set(x * radius, height, z * radius);
        worst = Math.max(worst, probe.addScaledVector(axis, -probe.dot(axis)).length());
      }
    }
    return worst;
  };

  const frameShadow = (position: THREE.Vector3): void => {
    const horizontal = Math.hypot(position.x, position.z);
    const reach =
      position.y > 1e-3
        ? (sphere.radius * horizontal) / position.y
        : sphere.radius * 9;
    // Enough for the shadow the device throws, and never less than the floor
    // the frame can actually see — a box drawn tight around an overhead
    // subject leaves the pattern covering a patch smaller than the picture.
    // The gobo is then cut to fill whatever this settles on, rather than the
    // box being stretched to contain a gobo of some fixed size, which is the
    // way round that used to leave the two disagreeing.
    const wanted = sphere.radius * 2.2 + Math.max(0, reach);
    const extent = patterned
      ? Math.min(sphere.radius * 20, Math.max(reachPaper(position), wanted))
      : Math.min(
          sphere.radius * 9,
          Math.max(sphere.radius * 3.6, wanted),
        );
    shadowExtent = extent;
    key.shadow.camera.left = -extent;
    key.shadow.camera.right = extent;
    key.shadow.camera.top = extent;
    key.shadow.camera.bottom = -extent;
    /**
     * Deep enough to reach the far side of the paper.
     *
     * This was a fixed twelve radii, from when the backdrop stood two and a
     * half radii behind the device. The cove is now sized to the framing and
     * can stand four times further than that, and everything past the far
     * plane is simply not in the depth map — which is why a pattern landed on
     * the floor and the table and then stopped at the skirting, with the wall
     * above it lit flat. The wall is the half of the shot a window is *for*.
     */
    const reachesWall = Math.hypot(
      builtCoveRadius + sphere.radius * 2,
      sphere.radius * 18,
    );
    const depth = position.length() + reachesWall;
    key.shadow.camera.far = depth;
    // Held constant in world units as the range grows behind it.
    key.shadow.bias = -SHADOW_BIAS / depth;
    key.shadow.camera.updateProjectionMatrix();
  };
  key.shadow.camera.near = sphere.radius * 0.2;
  scene.add(key);

  /**
   * The gobo, hung between the key and the device.
   *
   * It has to be invisible and it has to cast, which sound like a
   * contradiction and are not. Hiding it is the obvious way and the wrong one:
   * three skips an invisible object in the shadow pass as well, and skips one
   * on a layer the *view* camera cannot see — the shadow pass tests the view
   * camera's layers, not the shadow camera's, which is the trap. What does
   * work is refusing to write colour: the depth material three substitutes for
   * the shadow pass does not inherit that refusal, so the gobo draws nothing
   * anyone can see and everything the shadow needs.
   */
  const patternSurface = new THREE.MeshBasicMaterial({
    colorWrite: false,
    depthWrite: false,
    // A flat quad facing the light is back-facing to the shadow camera by the
    // time three has flipped sides for it, so both sides have to count.
    side: THREE.DoubleSide,
  });
  // What the mesh holds when there is no pattern. One of them, kept, because
  // a mesh always needs some geometry and minting a fresh empty one every time
  // the lights move leaves a trail of them behind.
  const noPattern = new THREE.BufferGeometry();
  const patternMesh = new THREE.Mesh(noPattern, patternSurface);
  patternMesh.castShadow = true;
  patternMesh.receiveShadow = false;
  patternMesh.visible = false;
  scene.add(patternMesh);
  let patternGeometry: THREE.BufferGeometry | null = null;
  let patternId: LightPatternId | null = null;
  /** The shape the current cut-out was cut to, so it is not recut for nothing. */
  let patternCut = "";
  disposables.push(patternSurface, noPattern, {
    dispose: () => patternGeometry?.dispose(),
  });

  /**
   * Cut a new gobo, and hang it square to the light.
   *
   * Square to the light is what makes it predictable: the key is directional,
   * so its shadow is a parallel projection and the pattern lands at the size
   * it was cut, however far away it is held. Distance only has to keep it
   * inside the depth map's near plane and out of the device.
   */
  const applyPattern = (next: LightPatternId): void => {
    // Both of these come before the framing, because the framing depends on
    // them: a patterned map has to reach the wall and a plain one does not.
    patterned = next !== "none";
    applyShadowEdge(lastSoftness);
    // Settled first, because the cut-out is then cut to fill it.
    frameShadow(key.position);
    /**
     * The sine of the light's elevation: how much a floor measurement has to
     * be squashed to survive the trip through the gobo plane.
     *
     * Floored rather than allowed to reach zero. A key on the horizon asks for
     * a pattern of no height at all, which is both unbuildable and pointless —
     * past a certain rake the shadow is longer than the room.
     */
    const squash = Math.max(
      0.16,
      key.position.y / Math.max(1e-6, key.position.length()),
    );
    // Quantised, because this is consulted on every move of the key pad and
    // the answer is a vertex buffer. Recut the sash a dozen times across a
    // drag, not sixty times a second.
    const cut = `${next}/${Math.round(squash * 24)}/${Math.round(shadowExtent)}`;
    if (cut !== patternCut) {
      patternCut = cut;
      patternGeometry?.dispose();
      patternGeometry = createPatternGeometry(
        next,
        sphere.radius,
        squash,
        shadowExtent,
      );
      patternMesh.geometry = patternGeometry ?? noPattern;
    }
    patternId = next;
    patternMesh.visible = patternGeometry !== null;
    if (!patternMesh.visible) return;
    patternMesh.position
      .copy(key.position)
      .normalize()
      // Far enough out that the table never stands in front of it, close
      // enough to stay well inside the depth map's near plane.
      .multiplyScalar(sphere.radius * 3.2);
    patternMesh.lookAt(0, 0, 0);
  };
  applyPattern(options.lighting.pattern);

  // Fill and rim are always present and driven by intensity alone, so changing
  // the rig never rebuilds the scene. Hemisphere rather than a second
  // directional for fill: bounce has no edge sharp enough to cast anything.
  const fill = new THREE.HemisphereLight(
    0xffffff,
    new THREE.Color(options.backgroundColor),
    options.lighting.fillIntensity,
  );
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0xffffff, options.lighting.rimIntensity);
  rim.position.set(
    -keyDirection.x * sphere.radius * 3,
    sphere.radius * 1.5,
    -sphere.radius * 3,
  );
  scene.add(rim);

  /**
   * The surface, as a light.
   *
   * This is the half of a material that a texture cannot carry. Light that
   * lands on a table does not stop there — it scatters back up, coloured by
   * whatever it hit, into every face of the subject that points downward. It
   * is why a watch on oak has a warm underside and the same watch on concrete
   * has a grey one, and it arrives from the one direction a three-point rig
   * has no light in, so nothing else in the scene can stand in for it.
   *
   * Directional rather than a lamp under the table, because a bounce has no
   * position worth speaking of: it comes off an area far larger than the
   * subject and reaches it as very nearly parallel rays. It casts nothing —
   * a shadow thrown upward from beneath the floor is the giveaway of a rig
   * built out of lights rather than out of a room.
   */
  const bounce = new THREE.DirectionalLight(0xffffff, 0);
  bounce.castShadow = false;
  scene.add(bounce);

  /**
   * Aim it where the key would have landed, mirrored in the table.
   *
   * The bright patch on a surface is on the far side of the subject from the
   * light, and that patch is what does the bouncing, so the return travels
   * back across the same line the key came down. Mirroring the key's direction
   * about the horizontal is the whole calculation.
   */
  const placeBounce = (direction: { x: number; y: number }): void => {
    const across = new THREE.Vector3(direction.x, -direction.y, 1);
    if (across.lengthSq() < 1e-6) across.set(0, 0, 1);
    across.normalize();
    bounce.position.set(
      across.x * sphere.radius * 2,
      -sphere.radius * 2.4,
      across.z * sphere.radius * 2,
    );
  };
  placeBounce(options.lighting.keyDirection);

  /**
   * How much comes back, as a share of what went out.
   *
   * Tied to the key rather than set outright, because bounce is light that has
   * already arrived once. A rig whose bounce holds steady while the key falls
   * is why so many renders have a subject that will not go dark — the fill
   * that was meant to be a consequence of the key becomes a floor under it.
   */
  const applyBounce = (): void => {
    const definition = readSurfaceDefinition(surfaceKind);
    bounce.color.set(definition.bounce.color);
    bounce.intensity =
      surfaceKind === "none" || !groundVisible
        ? 0
        : key.intensity * definition.bounce.share;
  };

  const screenMaterials = findScreenMaterials(
    subject,
    options.device.screenMaterial,
  );
  const screenAspect =
    options.device.screenAspect ??
    measureScreenAspect(subject, screenMaterials, 9 / 19.5);

  const findScreenMeshes = (root: THREE.Object3D): THREE.Mesh[] => {
    const found: THREE.Mesh[] = [];
    root.traverse((object) => {
      if (
        object instanceof THREE.Mesh &&
        object.visible &&
        screenMaterials.includes(object.material as THREE.MeshStandardMaterial)
      ) {
        found.push(object);
      }
    });
    return found;
  };
  const screenMeshes = findScreenMeshes(subject);

  // After the meshes are known and before anything samples them.
  //
  // The reflection is included, and has to be. It was cloned from the device
  // before this ran, and `Object3D.clone` shares geometry rather than copying
  // it — so rebuilding the unwrap on the device alone leaves the reflected
  // panel still holding the atlas coordinates the file shipped with, and the
  // artwork in the reflection lands squeezed into a corner of it. The two
  // panels have the same local positions, so they rebuild to the same map.
  if (options.device.screenUnwrap) {
    unwrapScreen([...screenMeshes, ...findScreenMeshes(mirror)]);
  }

  const slack: ScreenSlack = { x: 0, y: 0 };

  const camera = new THREE.PerspectiveCamera(
    35,
    1,
    sphere.radius * 0.01,
    sphere.radius * 60,
  );

  // After the camera exists, because whether the reflection is visible at all
  // depends on which side of the floor the camera is on.
  applyFloor(options.floor);
  applySurface(options.surface);
  // Only ever a real wait when the scene is built with a surface already
  // chosen, which is the export path; the preview builds with none and dresses
  // the slab afterwards.
  await surfaceReady;
  applySweep(options.sweep);
  // Once more with the cove's real radius, which the first pass did not have.
  frameShadow(key.position);
  applyBackground();
  disposables.push({ dispose: () => floorFade?.dispose() });

  const placeKey = (direction: { x: number; y: number }): THREE.Vector3 => {
    const vector = new THREE.Vector3(direction.x, -direction.y, 1);
    if (vector.lengthSq() < 1e-6) vector.set(0, 0, 1);
    return vector
      .normalize()
      .multiplyScalar(sphere.radius * 4)
      .add(new THREE.Vector3(0, sphere.radius * 2, 0));
  };

  return {
    camera,
    onCameraMoved: () => {
      updateMirrorVisibility();
      // A longer lens stands the camera further back, and the set has to be
      // bigger than wherever the camera has gone. Recut only when the answer
      // actually changes, which a quantised radius makes rare.
      if (coveRadius() !== builtCoveRadius) applySweep(lastSweep);
    },
    getScreenSlack: () => ({ x: slack.x, y: slack.y }),
    screenMeshes,
    setEnvironment: (next) => {
      scene.environment = next;
      applyFloorEnvironment();
    },
    setFinish: (next) => applyFinish(baseColors, options.device, next),
    setFloor: applyFloor,
    setSurface: (next) => {
      applySurface(next);
      // The paper stands behind the table, so moving one moves the other.
      applySweep(lastSweep);
    },
    setSweep: (next) => {
      lastSweep = next;
      applySweep(next);
    },
    setGround: (visible, color) => {
      groundVisible = visible;
      // The plane stays; what it is made of is what changes. Hiding it would
      // take the shadow with it, and the shadow is the whole reason a cut-out
      // device looks placed rather than pasted.
      if (groundMesh && groundSurface && shadowSurface) {
        groundMesh.material = visible ? groundSurface : shadowSurface;
      }
      groundSurface?.color.set(color);
      // The sweep is the floor continuing, so it is the same paper in the same
      // colour, and it goes when the backdrop does — there is no catching a
      // shadow on a wall the device is not near.
      if (sweepMesh) sweepMesh.visible = visible && sweepHeight > 0;
      // The lamp goes with the backdrop, not with the paper: with no sweep up
      // it is still lighting the floor, which is backdrop enough.
      if (sweepLight) sweepLight.visible = visible && sweepLight.intensity > 0;
      sweepSurface?.color.set(color);
      // A table is part of the backdrop, so it goes when the backdrop does and
      // hands the floor back its other job.
      const staged = surfaceKind !== "none" && visible;
      if (surfaceMesh) surfaceMesh.visible = staged;
      if (legMesh) legMesh.visible = staged && legGeometry !== null;
      applyGroundVisibility();
      applyBounce();
      applyBackground();
      // The reflection lives on the backdrop, so it goes when the backdrop
      // does: there is nothing for it to be seen through.
      updateMirrorVisibility();
      fill.groundColor.set(color);
    },
    setLighting: (next) => {
      scene.environmentIntensity = next.environmentIntensity;
      applyFloorEnvironment();
      key.intensity = next.keyIntensity;
      key.color.set(next.keyColor);
      key.position.copy(placeKey(next.keyDirection));
      placeBounce(next.keyDirection);
      // After the key, because it is a share of it.
      applyBounce();
      applyPattern(next.pattern);
      fill.intensity = next.fillIntensity;
      rim.intensity = next.rimIntensity;
      applyShadowEdge(next.shadowSoftness);
      rim.position.set(
        -next.keyDirection.x * sphere.radius * 3,
        sphere.radius * 1.5,
        -sphere.radius * 3,
      );
    },
    dispose: () => {
      // Geometry, textures and the convolved environment are shared with the
      // cache and outlive this scene. Only the per-scene material clones and
      // the ground built here are ours to release.
      for (const item of disposables) item.dispose();
      subject.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const material = object.material;
        if (Array.isArray(material)) material.forEach((m) => m.dispose());
        else material.dispose();
      });
    },
    scene,
    setArtwork: (texture, transform) => {
      if (screenMaterials.length === 0) return;
      if (texture) applyScreenTransform(texture, screenAspect, transform, slack);
      // A display emits rather than reflects. Assigning the artwork as an
      // emissive map keeps it readable at full brightness regardless of how the
      // environment happens to be lighting the rest of the device. The stock
      // wallpaper on these models is an emissiveMap, so that is the channel
      // that has to be replaced; setting only `map` leaves the original glowing.
      for (const screenMaterial of screenMaterials) {
        screenMaterial.map = texture;
        screenMaterial.emissiveMap = texture;
        screenMaterial.emissive = new THREE.Color(0xffffff);
        screenMaterial.emissiveIntensity = texture ? 1 : 0;
        screenMaterial.toneMapped = false;
        screenMaterial.needsUpdate = true;
      }
    },
    subject,
    framing,
    subjectRadius: sphere.radius,
    target,
  };
}
