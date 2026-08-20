import * as THREE from "three";

import type { DeviceDefinition } from "../product-domain";
import { readSurfaceDefinition } from "../surfaces";
import { loadSurfaceTexture } from "./device-assets";
import type { FloorSettings, SweepSettings } from "./scene-types";
import {
  COVE_MAX,
  createFloorFade,
  createSweepFade,
  createSweepGeometry,
  FLOOR_HALF_EXTENT,
} from "./set-geometry";
import type { Table } from "./scene-table";

export type Room = {
  applyBackground: () => void;
  applyFloor: (floor: FloorSettings) => void;
  applyFloorEnvironment: () => void;
  applyGroundVisibility: () => void;
  applySweep: (sweep: SweepSettings) => void;
  builtCoveRadius: () => number;
  coveRadius: () => number;
  floorY: () => number;
  ground: () => THREE.Mesh;
  groundMesh: () => THREE.Mesh | null;
  groundSurface: () => THREE.MeshStandardMaterial | null;
  mirror: THREE.Object3D;
  placeFloor: () => void;
  setFloorY: (y: number) => void;
  setVisible: (visible: boolean) => void;
  shadowSurface: () => THREE.ShadowMaterial | null;
  sweepHeight: () => number;
  sweepLight: () => THREE.PointLight | null;
  sweepMesh: () => THREE.Mesh | null;
  sweepSurface: () => THREE.MeshStandardMaterial | null;
  updateMirrorVisibility: () => void;
  visible: () => boolean;
  /** Repaint and re-show the ground and the paper, without deciding anything else. */
  wearGround: (visible: boolean, color: string) => void;
};

/**
 * The room the device stands in: the floor it sits on, the reflection in that
 * floor, and the paper curving up behind it.
 *
 * It is one subsystem rather than three because they are one surface. The
 * sweep is the floor continuing, the mirror is the floor being polished, and
 * the height the floor sits at is the same number that decides where the paper
 * meets it. What it does not own is anything that stands *in* it — the device,
 * the furniture and the lights all read the room rather than living in it.
 */
export function createRoom(
  context: {
    camera: () => THREE.PerspectiveCamera;
    disposables: { dispose: () => void }[];
    groundY: number;
    /** Redraw the depth map, because recutting the set moved what it looks at. */
    reframeShadow: () => void;
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    sphere: THREE.Sphere;
    subject: THREE.Object3D;
    table: () => Table;
  },
  options: {
    backgroundColor: string;
    device: DeviceDefinition;
    showGround: boolean;
  },
): Room {
  const { disposables, groundY, renderer, scene, sphere, subject } = context;

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
    const framing = context.camera().position.length() / sphere.radius;
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
      context.reframeShadow();
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
    const table = readSurfaceDefinition(context.table().kind()).environmentShare;
    for (const [surface, own] of [
      [groundSurface, 1],
      [sweepSurface, 1],
      [context.table().top, table],
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
      context.table().kind() === "none" &&
      context.camera().position.y > ground.position.y;
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
  disposables.push({ dispose: () => floorFade?.dispose() });

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

  return {
    applyBackground,
    applyFloor,
    applyFloorEnvironment,
    applyGroundVisibility,
    applySweep,
    builtCoveRadius: () => builtCoveRadius,
    coveRadius,
    floorY: () => floorY,
    ground: () => ground,
    groundMesh: () => groundMesh,
    groundSurface: () => groundSurface,
    mirror,
    placeFloor,
    setFloorY: (y: number) => {
      floorY = y;
    },
    setVisible: (visible: boolean) => {
      groundVisible = visible;
    },
    shadowSurface: () => shadowSurface,
    sweepHeight: () => sweepHeight,
    sweepLight: () => sweepLight,
    sweepMesh: () => sweepMesh,
    sweepSurface: () => sweepSurface,
    updateMirrorVisibility,
    visible: () => groundVisible,
    wearGround: (visible: boolean, color: string) => {
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
    },
  };
}
