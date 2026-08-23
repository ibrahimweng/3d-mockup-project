import * as THREE from "three";
import { toCreasedNormals } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import {
  applyFinish,
  applyMaterialCorrections,
  captureBaseColors,
  creaseNormals,
  type BaseColors,
} from "./model-appearance";
import { createKeyLight } from "./scene-key";
import { createRoom } from "./scene-room";
import { createTable } from "./scene-table";
import { createSurfaceGeometry } from "./surface-geometry";
import type {
  DeviceScene,
  FloorSettings,
  LightingSettings,
  SurfaceSettings,
  SweepSettings,
} from "./scene-types";

export type {
  DeviceScene,
  FloorSettings,
  LightingSettings,
  SurfaceSettings,
  SweepSettings,
} from "./scene-types";
import {
  COVE_MAX,
  createFloorFade,
  createPatternGeometry,
  createSweepFade,
  createSweepGeometry,
  FLOOR_HALF_EXTENT,
  TABLE_YAW,
} from "./set-geometry";
import {
  applyScreenTransform,
  findScreenMaterials,
  measureScreenAspect,
  unwrapScreen,
  type ScreenSlack,
  type ScreenTransform,
} from "./screen-mapping";

export type { ScreenSlack, ScreenTransform } from "./screen-mapping";

import {
  cloneForScene,
  findScene,
  loadEnvironment,
  loadModel,
  loadSurfaceTexture,
} from "./device-assets";

import type {
  DeviceDefinition,
  DeviceSurface,
  FinishId,
  LightPatternId,
} from "../product-domain";

export { loadEnvironment } from "./device-assets";

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
  /**
   * The turntable the device stands on.
   *
   * Spin has to turn the device where it stands. Rotating the subject itself
   * would not do that: it has just been translated so its centre sits on the
   * origin, and a rotation applies before that translation, so the device
   * would swing around the model's own origin instead of turning on the spot.
   * A parent at the world origin puts the axis where the device is.
   */
  const spinner = new THREE.Group();
  spinner.add(subject);
  scene.add(spinner);

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
  // The room the device stands in. It is handed the camera and the table
  // rather than reaching for them, because both arrive after it does: the
  // camera is posed once the scene exists, and the furniture is built next.
  const room = createRoom(
    {
      camera: () => camera,
      disposables,
      groundY,
      reframeShadow: () => frameShadow(key.position),
      renderer: options.renderer,
      scene,
      sphere,
      subject,
      table: () => furniture,
    },
    options,
  );
  const {
    applyBackground,
    applyFloor,
    applyFloorEnvironment,
    applyGroundVisibility,
    applySweep,
    coveRadius,
    placeFloor,
    updateMirrorVisibility,
  } = room;
  const mirror = room.mirror;

  /** Remembered so a table can re-place the paper without being handed it. */
  let lastSweep: SweepSettings = options.sweep;

  // The furniture, which reports how far the room drops rather than dropping
  // it: the floor, the paper, the bounce and the mirror are all the room's.
  const furniture = createTable(
    {
      disposables,
      groundY,
      onDressed: () => applyFloorEnvironment(),
      renderer: options.renderer,
      scene,
      sphere,
      subject,
    },
    options,
  );
  const { framing, target } = furniture;
  const applySurface = (surface: SurfaceSettings): void => {
    const { changed, standY } = furniture.applySurface(surface, room.visible());
    room.setFloorY(standY);
    if (changed) placeFloor();
    updateMirrorVisibility();
    applyGroundVisibility();
    applyFloorEnvironment();
    applyBounce();
  };


  /** How much reflection the floor is currently letting through. */

  // The key light, its shadow, and whatever is standing in front of it. Held
  // apart because it is the one subsystem that has to know where the set is:
  // how far out the cove is standing, how high the paper runs and where the
  // floor sits all decide how much depth map the shadow needs. Everything else
  // about it is its own.
  //
  // Held rather than closed over: the camera is built further down, and the
  // key light asks the stage what the picture reaches while it is still being
  // put together.
  let viewCamera: THREE.PerspectiveCamera | null = null;
  const { applyPattern, applyShadowEdge, frameShadow, key, keyDirection } =
    createKeyLight(
      {
        disposables,
        scene,
        sphere,
        stage: {
          coveRadius: () => room.builtCoveRadius(),
          floorY: () => room.floorY(),
          sweepHeight: () => room.sweepHeight(),
          viewReach: () => {
            if (!viewCamera) return 0;
            // The half-diagonal of the frame at the far side of the set: the
            // furthest corner of the picture, which is the furthest thing the
            // shadow has to be able to say something about.
            const climb = Math.tan((viewCamera.fov * Math.PI) / 360);
            const depth = viewCamera.position.length() + room.builtCoveRadius();
            const up = depth * climb;
            return Math.hypot(up, up * Math.max(1, viewCamera.aspect));
          },
        },
      },
      options,
    );


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
    const definition = readSurfaceDefinition(furniture.kind());
    bounce.color.set(definition.bounce.color);
    bounce.intensity =
      furniture.kind() === "none" || !room.visible()
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
  viewCamera = camera;

  // After the camera exists, because whether the reflection is visible at all
  // depends on which side of the floor the camera is on.
  applyFloor(options.floor);
  applySurface(options.surface);
  // Only ever a real wait when the scene is built with a surface already
  // chosen, which is the export path; the preview builds with none and dresses
  // the slab afterwards.
  await furniture.ready();
  applySweep(options.sweep);
  // Once more with the cove's real radius, which the first pass did not have.
  frameShadow(key.position);
  applyBackground();

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
      // The depth map has to hold whatever the picture holds, and the picture
      // changes shape when the canvas does — so this settles on every move
      // rather than only when the cove is recut. It is quantised downstream:
      // the sash is only re-cut when the extent actually lands somewhere new.
      frameShadow(key.position);
      // A longer lens stands the camera further back, and the set has to be
      // bigger than wherever the camera has gone. Recut only when the answer
      // actually changes, which a quantised radius makes rare.
      if (coveRadius() === room.builtCoveRadius()) return false;
      applySweep(lastSweep);
      // Recutting moves the paper and re-aims the depth map at it, and the
      // shadow map is only redrawn when something says so. Saying so is the
      // caller's job because only the caller knows it is about to draw.
      return true;
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
      room.wearGround(visible, color);
      // A table is part of the backdrop, so it goes when the backdrop does and
      // hands the floor back its other job.
      furniture.setStaged(visible);
      applyGroundVisibility();
      applyBounce();
      applyBackground();
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
    standTop: groundY,
    setSpin: (degrees: number): boolean => {
      const radians = (degrees * Math.PI) / 180;
      if (spinner.rotation.y === radians) return false;
      spinner.rotation.y = radians;
      return true;
    },
    subjectRadius: sphere.radius,
    target,
  };
}
