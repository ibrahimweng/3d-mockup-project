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
    const { changed, standY } = furniture.applySurface(surface, groundVisible);
    floorY = standY;
    if (changed) placeFloor();
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
    const table = readSurfaceDefinition(furniture.kind()).environmentShare;
    for (const [surface, own] of [
      [groundSurface, 1],
      [sweepSurface, 1],
      [furniture.top, table],
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
      furniture.kind() === "none" &&
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

  // The key light, its shadow, and whatever is standing in front of it. Held
  // apart because it is the one subsystem that has to know where the set is:
  // how far out the cove is standing, how high the paper runs and where the
  // floor sits all decide how much depth map the shadow needs. Everything else
  // about it is its own.
  const { applyPattern, applyShadowEdge, frameShadow, key, keyDirection } =
    createKeyLight(
      {
        disposables,
        scene,
        sphere,
        stage: {
          coveRadius: () => builtCoveRadius,
          floorY: () => floorY,
          sweepHeight: () => sweepHeight,
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
      furniture.kind() === "none" || !groundVisible
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
  await furniture.ready();
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
      furniture.setStaged(visible);
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
