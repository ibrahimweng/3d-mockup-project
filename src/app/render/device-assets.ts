import * as THREE from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";

/**
 * Everything the scene has to fetch, and the caches that mean it fetches once.
 *
 * Held apart from the scene itself because none of it depends on a scene: a
 * parsed model, a convolved environment and a tiling map are all just assets
 * keyed by their URL, and the whole reason they live behind caches is that a
 * device already seen should cost nothing to return to.
 */

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
/** Made once, on first use: each instance spawns its own decoder workers. */
let loader: GLTFLoader | null = null;

function createLoader(): GLTFLoader {
  const draco = new DRACOLoader();
  draco.setDecoderPath(`${import.meta.env.BASE_URL}draco/`);
  // WebAssembly by default, which is several times faster than the JavaScript
  // fallback the same directory also carries for anything that cannot run it.
  return new GLTFLoader().setDRACOLoader(draco);
}
export function loadModel(url: string): Promise<GLTF> {
  const cached = modelCache.get(url);
  if (cached) return cached;
  loader ??= createLoader();
  const pending = loader.loadAsync(url);
  modelCache.set(url, pending);
  // A failed load must not poison the cache, or the device can never load.
  void pending.catch(() => modelCache.delete(url));
  return pending;
}
/**
 * The maps a device brings with it, sampled the way the rest of the set is.
 *
 * Every other texture in this scene asks for the highest anisotropy the
 * context supports — the tabletop below and the screenshot on the display —
 * and the device's own maps were the one thing left at the default of one.
 * That is the sampler at its worst on exactly the surface that needs it most:
 * a mip chosen for the compressed axis, so a logo on a back turned away from
 * the camera dissolves along the axis that is not compressed while the same
 * logo face on reads sharp. It showed up as a device that looked crisp at one
 * angle and smeared a few degrees later.
 *
 * The textures belong to the parsed model, which is cached and shared by every
 * scene built from it, so this is a deliberate one-time mutation of shared
 * state rather than something each scene does to its own copy. Every renderer
 * wants the same maximum, so whichever asks first is answering for all of them.
 */
const anisotropyApplied = new WeakSet<GLTF>();

const anisotropicMapKeys = [
  "map",
  "normalMap",
  "roughnessMap",
  "metalnessMap",
  "aoMap",
  "emissiveMap",
  "bumpMap",
  "alphaMap",
  "clearcoatMap",
  "clearcoatNormalMap",
  "clearcoatRoughnessMap",
] as const;

export function applyModelTextureAnisotropy(
  gltf: GLTF,
  maxAnisotropy: number,
): void {
  if (anisotropyApplied.has(gltf) || maxAnisotropy <= 1) return;
  anisotropyApplied.add(gltf);

  const seen = new Set<THREE.Texture>();

  for (const scene of gltf.scenes) {
    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;

      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];

      for (const material of materials) {
        for (const key of anisotropicMapKeys) {
          const texture = (material as unknown as Record<string, unknown>)[key];

          if (!(texture instanceof THREE.Texture) || seen.has(texture)) continue;
          seen.add(texture);
          if (texture.anisotropy >= maxAnisotropy) continue;
          texture.anisotropy = maxAnisotropy;
          // The texture is already uploaded by the time anything asks for it,
          // so the sampler only picks this up when the upload is redone.
          texture.needsUpdate = true;
        }
      }
    });
  }
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
export function cloneForScene(source: THREE.Object3D): THREE.Object3D {
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
export function findScene(
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
export function loadSurfaceTexture(
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
