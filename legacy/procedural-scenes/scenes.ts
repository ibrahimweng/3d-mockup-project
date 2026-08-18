import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import { GradientEquirectTexture, ShapedAreaLight } from "three-gpu-pathtracer";

import { buildDevice as buildDeviceGeometry, type DeviceKind } from "./devices";
import type { ArtworkRelief } from "./artwork-relief";

export type SceneKind = "device" | "seal";
export type SealShape = "octagon" | "oval" | "round" | "tag";
export type { DeviceKind } from "./devices";
export type Finish =
  | "brushed-metal"
  | "cast-stone"
  | "matte-plastic"
  | "polished-metal";
export type EnvironmentPreset =
  | "dark-rim"
  | "daylight"
  | "hard-key"
  | "studio-soft";

export type Shading = "clay" | "rendered";

/**
 * Name used to find the subject when hit-testing.
 *
 * The scene also contains a backdrop that fills the frame, so orbit hit tests
 * have to target the subject specifically rather than whatever the ray meets
 * first.
 */
export const SUBJECT_NAME = "plinth-subject";

/**
 * The clay working surface.
 *
 * One neutral matte material stands in for every finish so that nothing but
 * form and light is visible — no metal, no artwork, no reflections to read
 * shape through. Slightly warm and slightly rough, like real modelling clay,
 * because a pure neutral grey reads as flat and untextured plastic instead.
 */
function buildClayMaterial(): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    // Around mid-grey. A lighter clay clips to white under any usable light and
    // the shading gradient that carries form disappears with it.
    color: new THREE.Color(0x8d8880),
    metalness: 0,
    roughness: 0.82,
  });
}

export type SceneSettings = {
  artworkScale: number;
  backgroundColor: string;
  device: DeviceKind;
  environment: EnvironmentPreset;
  finish: Finish;
  intensity: number;
  keyDirection: { x: number; y: number };
  materialColor: string;
  roughness: number;
  objects: readonly {
    kind: DeviceKind;
    place: { x: number; y: number };
    size: number;
    turn: number;
  }[];
  scene: SceneKind;
  shading: Shading;
  shape: SealShape;
  showBackground: boolean;
  size: number;
};

export type BuiltScene = {
  camera: THREE.PerspectiveCamera;
  dispose: () => void;
  scene: THREE.Scene;
  /** Radius of the subject, in scene units, for framing and focus distance. */
  subjectRadius: number;
};

/**
 * Environment presets.
 *
 * These gradients are a deliberate placeholder for real captured HDRIs. They
 * already prove the mechanism — a polished surface shows almost nothing but its
 * reflection of this texture — but a gradient cannot supply the shaped
 * highlights (softbox rectangles, window frames) that give a real studio
 * photograph its structure.
 */
const ENVIRONMENTS: Record<
  EnvironmentPreset,
  { bottom: number; exponent: number; intensity: number; top: number }
> = {
  "dark-rim": { bottom: 0x000000, exponent: 2.6, intensity: 0.55, top: 0x8fa6c4 },
  daylight: { bottom: 0x9fb2c8, exponent: 0.7, intensity: 1.5, top: 0xfdfdff },
  "hard-key": { bottom: 0x08090c, exponent: 3.4, intensity: 0.9, top: 0xffffff },
  "studio-soft": { bottom: 0x1a1c22, exponent: 1.3, intensity: 1.15, top: 0xf2f4f8 },
};

/**
 * Captured environments, loaded once and shared by every scene rebuild.
 *
 * A gradient can supply an overall light level but not *structure*: a real
 * studio HDRI carries the shaped rectangles of its softboxes, and those are what
 * a polished surface actually reflects. They are the difference between metal
 * that looks lit and metal that looks photographed.
 *
 * Cached at module scope on purpose. These are immutable source-bound resources
 * with no per-scene state, and reloading a 1.5MB HDR on every material change
 * would dominate the rebuild cost.
 */
const environmentCache = new Map<EnvironmentPreset, THREE.DataTexture>();
const environmentLoads = new Map<EnvironmentPreset, Promise<void>>();

function loadEnvironment(
  preset: EnvironmentPreset,
  onReady: () => void,
): THREE.DataTexture | null {
  const cached = environmentCache.get(preset);
  if (cached) return cached;

  if (!environmentLoads.has(preset)) {
    const load = new RGBELoader()
      .loadAsync(`${import.meta.env.BASE_URL}hdri/${preset}.hdr`)
      .then((texture) => {
        texture.mapping = THREE.EquirectangularReflectionMapping;
        environmentCache.set(preset, texture);
      })
      .catch(() => {
        // A missing or corrupt map falls back to the gradient below rather than
        // dropping the scene to an unlit black frame.
      })
      .finally(() => {
        environmentLoads.delete(preset);
        onReady();
      });
    environmentLoads.set(preset, load);
  }

  return null;
}

/**
 * Procedural stand-in used until the captured map arrives, and as the permanent
 * fallback if it never does.
 */
function buildGradientEnvironment(preset: EnvironmentPreset): THREE.Texture {
  const config = ENVIRONMENTS[preset];
  const texture = new GradientEquirectTexture(1024);
  texture.topColor.setHex(config.top);
  texture.bottomColor.setHex(config.bottom);
  texture.exponent = config.exponent;
  texture.update();
  return texture as unknown as THREE.Texture;
}

function buildMaterial(
  settings: SceneSettings,
  relief: ArtworkRelief | null,
): THREE.MeshPhysicalMaterial {
  if (settings.shading === "clay") return buildClayMaterial();

  const roughness = settings.roughness / 100;
  const material = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(settings.materialColor),
  });

  switch (settings.finish) {
    case "brushed-metal":
      material.metalness = 1;
      material.roughness = Math.max(0.18, roughness);
      // Brushed metal stretches its highlight along the grain direction.
      material.anisotropy = 0.85;
      material.anisotropyRotation = Math.PI / 2;
      break;
    case "cast-stone":
      material.metalness = 0;
      material.roughness = Math.max(0.55, roughness);
      break;
    case "matte-plastic":
      material.metalness = 0;
      material.roughness = Math.max(0.35, roughness);
      // A thin clearcoat is what separates moulded plastic from chalk.
      material.clearcoat = 0.35;
      material.clearcoatRoughness = 0.4;
      break;
    default:
      material.metalness = 1;
      material.roughness = roughness;
      break;
  }

  if (relief?.normal) {
    material.normalMap = relief.normal;
    material.normalScale = new THREE.Vector2(1, 1);
  }

  // A struck mark shows the substrate — it is the same metal, just tilted, so
  // it carries no colour of its own. A printed one is ink sitting on the
  // surface and must show its own colour on every finish, not only plastic.
  if (relief && relief.mode === "print") {
    material.map = relief.baseColor;
    // Ink is not a mirror. Without this a printed mark on polished metal
    // renders as a perfect reflector and reads as engraving instead.
    material.metalness = 0;
    material.roughness = Math.max(0.4, settings.roughness / 100);
  }

  return material;
}

/**
 * Make a geometry safe for normal-mapped path tracing.
 *
 * A path tracer has no screen-space derivatives, so it cannot synthesise
 * tangents the way a raster shader does — a normal map without an explicit
 * tangent attribute is undefined. three-gpu-pathtracer computes tangents for us
 * (`GeometryPreparationUtils`), but it checks only for uv and normal, not for an
 * index, and `computeTangents()` silently bails on non-indexed geometry. Since
 * `ExtrudeGeometry` emits non-indexed triangles, anything extruded has to be
 * welded first or its relief simply never lights.
 */
function indexForTangents(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  if (geometry.index) {
    geometry.computeVertexNormals();
    return geometry;
  }
  const indexed = mergeVertices(geometry);
  geometry.dispose();
  indexed.computeVertexNormals();
  return indexed;
}

/**
 * Replace ExtrudeGeometry's UVs with a centred planar projection.
 *
 * `WorldUVGenerator` — the default — emits raw object-space X/Y as UVs, so a
 * seal of radius 0.8 gets UVs spanning -0.8..0.8 rather than 0..1. Against a
 * clamped texture that makes almost the entire face sample the artwork's edge
 * pixels, and the mark never appears at all.
 *
 * Projecting from the same XY plane the shape was drawn on puts the artwork
 * flat on the struck face, centred, covering `coverage` of the object's width.
 * Side walls fall outside 0..1 and clamp to the artwork's margin, which is what
 * we want: the mark belongs on the face, not wrapped around the rim.
 */
function applyPlanarArtworkUv(
  geometry: THREE.BufferGeometry,
  coverage: number,
): void {
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  const position = geometry.getAttribute("position");
  if (!bounds || !position) return;

  const width = Math.max(1e-6, bounds.max.x - bounds.min.x);
  const height = Math.max(1e-6, bounds.max.y - bounds.min.y);
  // Square span keeps the artwork's aspect ratio: mapping x and y by different
  // amounts would stretch a round mark into an oval on a non-square object.
  const span = Math.max(width, height) * Math.max(0.05, coverage);

  // UVs are clamped into 0..1 here rather than left to the texture's wrap mode.
  // three-gpu-pathtracer packs textures into an atlas and repeat-wraps them
  // regardless of ClampToEdgeWrapping on the source texture, so any UV outside
  // 0..1 tiles the mark around the object's edge. Clamping in the geometry
  // makes wrap behaviour irrelevant: everything beyond the artwork samples the
  // transparent margin baked into the relief map, which reads as flat surface.
  const clamp = (value: number) => Math.min(1, Math.max(0, value));

  const uv = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i += 1) {
    uv[i * 2] = clamp(position.getX(i) / span + 0.5);
    // Image space runs top-down while geometry Y runs bottom-up.
    uv[i * 2 + 1] = clamp(0.5 - position.getY(i) / span);
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
}

/** 2D outline for each seal shape, in scene units. */
function buildSealOutline(shape: SealShape, radius: number): THREE.Shape {
  const outline = new THREE.Shape();

  if (shape === "octagon") {
    for (let i = 0; i < 8; i += 1) {
      const angle = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (i === 0) outline.moveTo(x, y);
      else outline.lineTo(x, y);
    }
    outline.closePath();
    return outline;
  }

  if (shape === "oval") {
    outline.absellipse(0, 0, radius * 1.28, radius * 0.82, 0, Math.PI * 2, false, 0);
    return outline;
  }

  if (shape === "tag") {
    // Rounded rectangle with clipped corners, like a struck maker's plate.
    const width = radius * 1.55;
    const height = radius * 1.95;
    const clip = radius * 0.3;
    outline.moveTo(-width + clip, height);
    outline.lineTo(width - clip, height);
    outline.lineTo(width, height - clip);
    outline.lineTo(width, -height + clip);
    outline.lineTo(width - clip, -height);
    outline.lineTo(-width + clip, -height);
    outline.lineTo(-width, -height + clip);
    outline.lineTo(-width, height - clip);
    outline.closePath();
    return outline;
  }

  outline.absarc(0, 0, radius, 0, Math.PI * 2, false);
  return outline;
}

function buildSeal(
  settings: SceneSettings,
  relief: ArtworkRelief | null,
  radius: number,
): THREE.Mesh {
  const outline = buildSealOutline(settings.shape, radius);

  // The chamfer is what makes this read as struck metal rather than a sticker:
  // a hard 90-degree rim catches no light, so the object loses its edge against
  // a dark background.
  const bevel = radius * 0.09;
  const extruded = new THREE.ExtrudeGeometry(outline, {
    bevelEnabled: true,
    bevelSegments: 6,
    bevelSize: bevel,
    bevelThickness: bevel,
    curveSegments: 96,
    depth: radius * 0.18,
  });
  extruded.center();

  const geometry = indexForTangents(extruded);
  applyPlanarArtworkUv(geometry, settings.artworkScale / 100);
  const mesh = new THREE.Mesh(geometry, buildMaterial(settings, relief));
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

/**
 * Assemble a device from the real geometry module.
 *
 * The materials are built once here and shared across every part, so a device
 * made of forty meshes still costs one material per role rather than one per
 * mesh — which matters because the path tracer compiles material variants.
 */
function buildDevice(
  settings: SceneSettings,
  relief: ArtworkRelief | null,
  radius: number,
): { disposables: THREE.BufferGeometry[]; group: THREE.Group } {
  const isClay = settings.shading === "clay";

  const body = isClay
    ? buildClayMaterial()
    : new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(settings.materialColor),
        metalness: settings.finish === "matte-plastic" ? 0 : 1,
        roughness: Math.max(0.12, settings.roughness / 100),
      });

  // Lens and keyboard glass: near-black and very smooth, so it reads as a dark
  // reflective recess rather than a painted patch.
  const glass = isClay
    ? buildClayMaterial()
    : new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(0x0b0c0e),
        metalness: 0.2,
        roughness: 0.12,
      });

  // A display emits; treating it as a lit surface makes artwork read as a
  // sticker. In clay it stays an unlit panel so only form is visible.
  const screen =
    isClay || !relief
      ? buildClayMaterial()
      : new THREE.MeshStandardMaterial({
          color: 0x000000,
          emissive: 0xffffff,
          emissiveIntensity: 1.15,
          emissiveMap: relief.baseColor,
          roughness: 0.08,
        });

  return buildDeviceGeometry(settings.device, { body, glass, screen }, radius * 2);
}

export function buildScene(
  settings: SceneSettings,
  relief: ArtworkRelief | null,
  onEnvironmentReady: () => void = () => {},
): BuiltScene {
  const scene = new THREE.Scene();
  const disposables: { dispose: () => void }[] = [];

  // Real-world millimetres map to scene units so depth of field, light falloff,
  // and the size control all agree with each other.
  const radius = Math.max(0.15, settings.size / 40);

  // Clay shows no artwork at all: the relief maps are simply not handed to the
  // scene, rather than being built and then hidden.
  const activeRelief = settings.shading === "clay" ? null : relief;

  let subject: THREE.Object3D;
  if (settings.scene === "seal") {
    subject = buildSeal(settings, activeRelief, radius);
  } else {
    // A device scene holds a set. Materials are built once and shared across
    // every object, so adding a device costs geometry but not another material
    // variant for the path tracer to compile.
    const set = new THREE.Group();
    const objects = settings.objects.length
      ? settings.objects
      : [{ kind: "iphone" as const, place: { x: 0.5, y: 0.5 }, size: 150, turn: 0 }];

    // Spread has to come from the objects' real footprints, not from a scalar
    // multiple of the largest. Each device's longest edge in scene units is
    // size/20, so laying them side by side needs the sum of those edges; scaling
    // only the largest one left a 240mm MacBook intersecting its neighbours.
    const footprint = objects.reduce(
      (total, object) => total + Math.max(0.3, object.size / 20),
      0,
    );
    // Half a footprint of headroom at each end, so an object parked at 0 or 1
    // still sits fully on the ground rather than half off it.
    const spread = footprint * 1.5;

    for (const object of objects) {
      const built = buildDevice(
        { ...settings, device: object.kind },
        activeRelief,
        Math.max(0.15, object.size / 40),
      );
      // Vector controls read 0..1, so they are recentred to -0.5..0.5 before
      // being scaled onto the ground plane.
      built.group.position.set(
        (object.place.x - 0.5) * spread,
        0,
        (object.place.y - 0.5) * spread,
      );
      built.group.rotation.y = (object.turn * Math.PI) / 180;
      set.add(built.group);
      disposables.push(...built.disposables);
    }
    subject = set;
  }
  subject.name = SUBJECT_NAME;
  scene.add(subject);

  // Clay is a fixed working view, so it ignores the studio settings entirely.
  // Inheriting an environment tuned for polished metal blows a diffuse matte
  // surface out to near-white and destroys exactly the form-reading the mode
  // exists to provide.
  const isClay = settings.shading === "clay";
  const environmentPreset = isClay ? "studio-soft" : settings.environment;

  const captured = loadEnvironment(environmentPreset, onEnvironmentReady);
  if (captured) {
    scene.environment = captured;
  } else {
    // Cached maps are owned by the module and outlive this scene, so only the
    // gradient fallback is registered for disposal.
    const gradient = buildGradientEnvironment(environmentPreset);
    scene.environment = gradient;
    disposables.push(gradient);
  }

  scene.environmentIntensity = isClay
    ? 0.42
    : ENVIRONMENTS[settings.environment].intensity;

  // Measure the subject before anything else is placed against it. The ground
  // has to be derived from where the object actually ends, not from the size
  // control: a seal lies flat and barely rises off the surface, while a phone
  // stands upright and extends far below a fixed offset — which buried it.
  const subjectBounds = new THREE.Box3().setFromObject(subject);

  // Everything placed around the subject — ground, lights, camera — is scaled
  // from what is actually in the scene rather than from the size control, which
  // belongs to the seal and bears no relation to a device set. Getting this
  // wrong put the ground plane inside the camera's view and left the key light
  // sitting among the objects instead of outside them.
  const subjectSpan = Math.max(
    radius * 4,
    subjectBounds.getSize(new THREE.Vector3()).length(),
  );

  if (settings.showBackground) {
    const backdropSize = subjectSpan * 14;
    const backdropGeometry = new THREE.PlaneGeometry(backdropSize, backdropSize);
    const backdropMaterial = new THREE.MeshStandardMaterial({
      // Clay ignores the chosen backdrop colour: a dark or saturated ground
      // would tint the bounce light and misrepresent the form being judged.
      color: new THREE.Color(
        settings.shading === "clay" ? 0x6f6b66 : settings.backgroundColor,
      ),
      roughness: 0.94,
    });
    const backdrop = new THREE.Mesh(backdropGeometry, backdropMaterial);
    backdrop.rotation.x = -Math.PI / 2;
    // Sit the object on the ground with a hairline gap, so the contact shadow
    // reads without the surfaces z-fighting.
    // The contact gap is scaled to the subject too, so a large set does not sit
    // visibly above the ground while a small one z-fights against it.
    backdrop.position.y = subjectBounds.min.y - subjectSpan * 0.0006;
    scene.add(backdrop);
    disposables.push(backdropGeometry, backdropMaterial);
  }

  // Key light position comes from the Vector control: x sweeps around the
  // subject, y raises it. Raking it low is what makes shallow relief read.
  const azimuth = (settings.keyDirection.x - 0.5) * Math.PI * 2;
  const elevation = Math.max(0.05, settings.keyDirection.y) * (Math.PI / 2);
  const keyDistance = subjectSpan * 1.6;
  // Clay holds its key at a fixed, moderate level for the same reason it fixes
  // the environment: the mode is for judging form, not lighting.
  const lightScale = isClay ? 0.34 : settings.intensity / 100;
  const key = new ShapedAreaLight(
    0xffffff,
    lightScale * 55,
    subjectSpan * 1.4,
    subjectSpan * 1.4,
  );
  key.position.set(
    Math.sin(azimuth) * Math.cos(elevation) * keyDistance,
    Math.sin(elevation) * keyDistance,
    Math.cos(azimuth) * Math.cos(elevation) * keyDistance,
  );
  key.lookAt(0, 0, 0);
  scene.add(key);

  const fill = new ShapedAreaLight(
    0xbfd4ff,
    lightScale * 14,
    subjectSpan * 1.1,
    subjectSpan * 1.1,
  );
  fill.position.set(-keyDistance * 0.8, subjectSpan * 0.6, -keyDistance * 0.5);
  fill.lookAt(0, 0, 0);
  scene.add(fill);

  const camera = new THREE.PerspectiveCamera(
    35,
    1,
    subjectSpan * 0.005,
    subjectSpan * 60,
  );
  camera.position.set(0, subjectSpan * 0.8, subjectSpan * 1.1);
  camera.lookAt(0, 0, 0);

  // Frame from the subject's real extent rather than the nominal size. A phone
  // is roughly twice as tall as it is wide, so a radius derived from the size
  // control alone underestimates it badly and the camera lands too far out.
  const boundingSphere = subjectBounds.getBoundingSphere(new THREE.Sphere());
  const subjectRadius = Number.isFinite(boundingSphere.radius)
    ? Math.max(radius * 0.5, boundingSphere.radius)
    : radius;

  return {
    camera,
    dispose: () => {
      for (const item of disposables) item?.dispose?.();
      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry?.dispose?.();
        const material = object.material;
        if (Array.isArray(material)) material.forEach((m) => m?.dispose?.());
        else material?.dispose?.();
      });
    },
    scene,
    subjectRadius,
  };
}
