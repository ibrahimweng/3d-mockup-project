import * as THREE from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { toCreasedNormals } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";

import type { DeviceDefinition, FinishId } from "../product-domain";

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
function createFloorFade(reflection: number): THREE.Texture {
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
    gradient.addColorStop(0, `#${hex}${hex}${hex}`);
    gradient.addColorStop(0.015, `#${hex}${hex}${hex}`);
    gradient.addColorStop(0.07, "#ffffff");
    // Ten radii of solid floor, which is far outside any framing of the
    // device, and then ten more to disappear across.
    gradient.addColorStop(0.5, "#ffffff");
    gradient.addColorStop(1, "#000000");
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

export async function buildDeviceScene(options: {
  backgroundColor: string;
  device: DeviceDefinition;
  environmentUrl: string;
  finish: FinishId;
  floor: FloorSettings;
  lighting: LightingSettings;
  renderer: THREE.WebGLRenderer;
  showGround: boolean;
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
    const groundGeometry = new THREE.PlaneGeometry(
      sphere.radius * 40,
      sphere.radius * 40,
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
    ground.position.y = groundY - sphere.radius * 0.002;
    ground.receiveShadow = true;
    ground.renderOrder = 0;
    scene.add(ground);
    groundMesh = ground;
    groundSurface = groundMaterial;
    shadowSurface = shadowMaterial;
    disposables.push(groundGeometry, groundMaterial, shadowMaterial);
  }

  /** How much reflection the floor is currently letting through. */
  let floorReflection = 0;
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
    if (!groundSurface) return;
    const map = scene.environment;
    if (groundSurface.envMap !== map) {
      groundSurface.envMap = map;
      // Gaining or losing an environment map changes which shader the material
      // compiles, which is the one case that needs more than a new uniform.
      groundSurface.needsUpdate = true;
    }
    groundSurface.envMapIntensity = floorEnvironment * scene.environmentIntensity;
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
      camera.position.y > ground.position.y;
  };

  let floorFade: THREE.Texture | null = null;

  const applyFloor = (floor: FloorSettings): void => {
    const next = Math.max(0, Math.min(1, floor.reflection));
    if (groundSurface) {
      groundSurface.roughness = Math.max(0.02, Math.min(1, floor.roughness));
      floorEnvironment = Math.max(0, Math.min(2, floor.environment));
      applyFloorEnvironment();
      // The floor is see-through in two places whatever the reflection is
      // doing — under the device, by however much it mirrors, and at the rim,
      // where it has to dissolve rather than end — so the map and the
      // transparent pass are not optional. Only its centre depends on the
      // setting, which is the one thing that has to be redrawn.
      if (next !== floorReflection || !floorFade) {
        floorFade?.dispose();
        floorFade = createFloorFade(next);
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
  // 1024 is plenty for a contact shadow that is deliberately soft: the blur
  // radius below throws away the extra detail a larger map would carry, and
  // the map is redrawn from the whole scene whenever it is invalidated.
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.radius = 4;
  key.shadow.bias = -0.0006;
  const extent = sphere.radius * 2.2;
  key.shadow.camera.left = -extent;
  key.shadow.camera.right = extent;
  key.shadow.camera.top = extent;
  key.shadow.camera.bottom = -extent;
  key.shadow.camera.near = sphere.radius * 0.2;
  key.shadow.camera.far = sphere.radius * 12;
  scene.add(key);

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

  const screenMaterials = findScreenMaterials(
    subject,
    options.device.screenMaterial,
  );
  const screenAspect =
    options.device.screenAspect ??
    measureScreenAspect(subject, screenMaterials, 9 / 19.5);

  const screenMeshes: THREE.Mesh[] = [];
  subject.traverse((object) => {
    if (
      object instanceof THREE.Mesh &&
      object.visible &&
      screenMaterials.includes(object.material as THREE.MeshStandardMaterial)
    ) {
      screenMeshes.push(object);
    }
  });

  // After the meshes are known and before anything samples them.
  if (options.device.screenUnwrap) unwrapScreen(screenMeshes);

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
    onCameraMoved: updateMirrorVisibility,
    getScreenSlack: () => ({ x: slack.x, y: slack.y }),
    screenMeshes,
    setEnvironment: (next) => {
      scene.environment = next;
      applyFloorEnvironment();
    },
    setFinish: (next) => applyFinish(baseColors, options.device, next),
    setFloor: applyFloor,
    setGround: (visible, color) => {
      groundVisible = visible;
      // The plane stays; what it is made of is what changes. Hiding it would
      // take the shadow with it, and the shadow is the whole reason a cut-out
      // device looks placed rather than pasted.
      if (groundMesh && groundSurface && shadowSurface) {
        groundMesh.material = visible ? groundSurface : shadowSurface;
      }
      groundSurface?.color.set(color);
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
      fill.intensity = next.fillIntensity;
      rim.intensity = next.rimIntensity;
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
    subjectRadius: sphere.radius,
    target: new THREE.Vector3(0, 0, 0),
  };
}
