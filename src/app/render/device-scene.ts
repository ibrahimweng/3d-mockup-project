import * as THREE from "three";
import { toCreasedNormals } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import {
  creaseNormals,
  prepareProductMaterials,
  type PartColors,
} from "./model-appearance";
import {
  bindZoneArtwork,
  createAllOverPrint,
  capturePrintRelief,
  type ArtworkZoneBinding,
} from "./artwork-binding";
import { createKeyLight } from "./scene-key";
import { createRoom } from "./scene-room";
import { getDevicePose } from "./device-pose";
import { createTable } from "./scene-table";
import { createSurfaceGeometry } from "./surface-geometry";
import type {
  DeviceScene,
  DeviceTransform,
  FloorSettings,
  LightingSettings,
  SurfaceSettings,
  SweepSettings,
} from "./scene-types";

export type {
  DeviceScene,
  DeviceTransform,
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
  measureZoneScale,
  unwrapScreen,
  type ScreenSlack,
  type ScreenTransform,
} from "./screen-mapping";

export type { ScreenSlack, ScreenTransform } from "./screen-mapping";

import {
  applyModelTextureAnisotropy,
  cloneForScene,
  findScene,
  loadEnvironment,
  loadModel,
  loadSurfaceTexture,
} from "./device-assets";

import type {
  ArtworkZoneId,
  DeviceDefinition,
  DeviceSurface,
  FinishId,
  LightPatternId,
} from "../product-domain";
import { readArtworkZones } from "../product-applicability";

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

export async function buildDeviceScene(options: {
  backgroundColor: string;
  /** The colour the product's blank cloth starts on. See `blankStockMaterials`. */
  blankStock?: string;
  device: DeviceDefinition;
  environmentUrl: string;
  finish: FinishId;
  floor: FloorSettings;
  lighting: LightingSettings;
  /** Called when a surface's maps land, so the frame can be drawn again. */
  onSurfaceReady?: () => void;
  /** The colour each of the product's parts starts on. */
  partColors?: PartColors;
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

  // Asked for before anything is cloned or drawn, so the first frame is
  // sampled the same way every later one is.
  applyModelTextureAnisotropy(
    gltf,
    options.renderer.capabilities.getMaxAnisotropy(),
  );

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

  const painter = prepareProductMaterials(subject, options.device, {
    blankStock: options.blankStock,
    finish: options.finish,
    partColors: options.partColors,
  });

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
  // Half the box, kept because posing needs the whole shape rather than just
  // how far down it goes: a subject that leans stands on a different corner.
  const half = bounds.getSize(new THREE.Vector3()).multiplyScalar(0.5);

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

  const clearRelief = options.device.clearPrintRelief === true;

  /**
   * One binding per zone the product declares, resolved against this model.
   *
   * A zone whose material the file does not carry is dropped rather than
   * bound to whatever the fallback finds, because the fallback is "the
   * strongest emissive material" — right for a display named something else
   * after a re-export, and quite wrong for a sleeve.
   */
  const zones = new Map<ArtworkZoneId, ArtworkZoneBinding>();
  for (const [id, zone] of readArtworkZones(options.device)) {
    const materials = findScreenMaterials(subject, zone.material);
    if (materials.length === 0) continue;
    zones.set(id, {
      aspect:
        zone.aspect ??
        (id === "front" ? options.device.screenAspect : undefined) ??
        measureScreenAspect(subject, materials, 9 / 19.5),
      fit: zone.fit,
      materials,
      relief: capturePrintRelief(materials, clearRelief),
      scale: measureZoneScale(subject, materials),
      slack: { x: 0, y: 0 },
    });
  }
  /**
   * The design on each zone and the cloth under it, remembered.
   *
   * Both reach the scene from outside and either can move without the other:
   * an upload rebinds one zone, a print background recolours the cloth every
   * zone is drawn on. Whichever arrives second has to be able to redo the
   * binding with what the first left, or the shirt keeps the template it had
   * when the colour changed.
   */
  let lastArtwork: {
    textures: ReadonlyMap<ArtworkZoneId, THREE.Texture | null>;
    transform?: ScreenTransform;
  } = { textures: new Map() };
  const allOver = createAllOverPrint();
  // Only where the product says its unprinted cloth is the print background;
  // everywhere else a template is drawn on white and stays on white.
  let blankStock = options.device.blankStockMaterials
    ? options.blankStock
    : undefined;
  const rebindArtwork = (): void => {
    const copies = allOver.spread(
      zones.keys(),
      lastArtwork.textures.get("front") ?? null,
      lastArtwork.transform?.allOver === true,
    );
    /**
     * How wide one repeat is, measured off the front and then obeyed by every
     * other panel.
     *
     * The control asks for a number of repeats across the front, because that
     * is the panel someone is looking at while they turn the dial. Everything
     * else follows from the width that implies: three across a 500mm back is a
     * 167mm tile, and a 300mm sleeve gets the 1.8 of them it has room for.
     */
    const front = zones.get("front");
    const tile =
      front && front.scale.u > 0
        ? front.scale.u / Math.max(0.25, lastArtwork.transform?.repeats ?? 1)
        : 0;
    for (const [id, binding] of zones) {
      const own = lastArtwork.textures.get(id) ?? null;
      bindZoneArtwork({
        binding,
        blankStock,
        clearRelief,
        printed: options.device.artworkSurface === "print",
        texture: copies?.get(id) ?? (copies ? null : own),
        tile,
        transform: lastArtwork.transform,
      });
    }
  };

  // The front is what a pointer drags on and what the unwrap is rebuilt for.
  const front = zones.get("front");
  const screenMaterials = front?.materials ?? [];

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
    getScreenSlack: () => ({ x: front?.slack.x ?? 0, y: front?.slack.y ?? 0 }),
    screenMeshes,
    setEnvironment: (next) => {
      scene.environment = next;
      applyFloorEnvironment();
    },
    setFinish: painter.setFinish,
    setPartColors: painter.setPartColors,
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
    setArtwork: (textures, transform) => {
      lastArtwork = { textures, transform };
      rebindArtwork();
    },
    setBlankStock: (hex) => {
      painter.setBlankStock(hex);
      // And again through the zones, because a zone with nothing uploaded is
      // showing its template and that template is drawn on the cloth. The
      // colour reaches the scene by two routes -- this and a re-decode of
      // every design -- which can arrive in either order, so both of them have
      // to leave the same answer behind.
      blankStock = hex;
      rebindArtwork();
    },
    subject,
    framing,
    standTop: groundY,
    /**
     * Stand the device somewhere, turned some way, at some size.
     *
     * Everything here happens on the turntable group rather than the device
     * itself, because the device has been translated so its centre sits on the
     * origin and a rotation would apply before that translation — it would
     * swing around the model's own origin instead of turning on the spot.
     *
     * Scale grows the device from its feet, not its middle. Scaling about the
     * centre would sink half the growth through the floor, so the group is
     * lifted by whatever the scaling moved the feet.
     *
     * Offsets are fractions of the device's own radius, so the same numbers
     * place any model the same way rather than meaning something different for
     * every model that comes through.
     */
    setTransform: (transform: DeviceTransform): boolean => {
      const {
        position: nextPosition,
        rotation: nextRotation,
        scale,
      } = getDevicePose({ half, radius: sphere.radius, transform });

      if (
        spinner.position.equals(nextPosition) &&
        spinner.rotation.equals(nextRotation) &&
        spinner.scale.x === scale
      ) {
        return false;
      }

      spinner.position.copy(nextPosition);
      spinner.rotation.copy(nextRotation);
      spinner.scale.setScalar(scale);
      spinner.updateWorldMatrix(false, true);
      // The floor's reflection is a separate clone of the device rather than a
      // child of it, so it has to be posed too or the device moves while its
      // reflection stays where it started.
      room.setMirrorPose(subject.matrixWorld);
      /**
       * Re-measure what the camera has to hold, now that the device has moved.
       *
       * The framing box is the device's world bounds, and a turned device
       * occupies a different box from a square-on one. It used to be measured
       * only when the surface was applied, which in `applyLiveSettings` happens
       * *before* the transform below — so every frame was fitted to the box of
       * the pose before it, and the camera never quite returned to where it had
       * been.
       *
       * Measured: scrubbing through five poses and back to the first left the
       * camera 8.6e-6 away in x and 1.2e-5 in z, with y bit-identical because
       * spin turns about the vertical and an axis-aligned box does not change
       * height when it turns. That is a fraction of a pixel, and it showed up
       * as 6,686 edge pixels differing by a mean of 16 against a flat-surface
       * mean of 1.25 — a picture that will not come back to itself.
       */
      furniture.measureFraming();
      return true;
    },
    subjectRadius: sphere.radius,
    target,
  };
}
