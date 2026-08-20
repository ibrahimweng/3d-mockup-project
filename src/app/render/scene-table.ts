import * as THREE from "three";

import type { DeviceDefinition } from "../product-domain";
import {
  readSurfaceDefinition,
  SURFACE_LEG,
  type SurfaceDefinition,
} from "../surfaces";
import { loadSurfaceTexture } from "./device-assets";
import type { SurfaceSettings } from "./scene-types";
import { TABLE_YAW } from "./set-geometry";
import { createSurfaceGeometry } from "./surface-geometry";

export type Table = {
  applySurface: (
    surface: SurfaceSettings,
    groundVisible: boolean,
  ) => { changed: boolean; standY: number };
  framing: THREE.Box3;
  kind: () => string;
  top: THREE.MeshStandardMaterial;
  measureFraming: () => void;
  ready: () => Promise<unknown>;
  setStaged: (visible: boolean) => void;
  target: THREE.Vector3;
};

/**
 * The furniture the device stands on, and nothing else.
 *
 * It used to move the floor, re-place the paper and re-balance the bounce
 * itself, which meant the table knew about three things that are not the
 * table. It now reports how far the room has to drop and lets the room drop
 * it; everything here is the top, the legs, their materials and the box the
 * camera has to hold.
 */
export function createTable(
  context: {
    disposables: { dispose: () => void }[];
    groundY: number;
    /** Called once a material's maps have landed on the top. */
    onDressed: () => void;
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    sphere: THREE.Sphere;
    subject: THREE.Object3D;
  },
  options: {
    device: DeviceDefinition;
    onSurfaceReady?: () => void;
  },
): Table {
  const { disposables, groundY, renderer, scene, sphere } = context;


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
      loadSurfaceTexture(renderer, maps.albedo, true),
      loadSurfaceTexture(renderer, maps.normal, false),
      loadSurfaceTexture(renderer, maps.roughness, false),
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
        // The room decides how much of the captured studio a given material
        // takes, and that answer changes the moment the material has maps.
        context.onDressed();
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
    framing.setFromObject(context.subject);
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

  const applySurface = (
    surface: SurfaceSettings,
    groundVisible: boolean,
  ): { changed: boolean; standY: number } => {
    let changed = false;
    let standY = groundY;
    const definition = readSurfaceDefinition(
      options.device.surface ? surface.kind : "none",
    );
    const wanted = definition.value;
    const on = wanted !== "none";
    if (wanted !== surfaceKind) {
      surfaceKind = wanted;
      dressSurface(definition);
      // The device has not moved: it is standing on the top, and the top is
      // where its feet already were. So it is the room that drops — which is
      // the room's business, so this reports the drop rather than making it.
      standY =
        on && options.device.surface
          ? groundY - options.device.surface.stand * sphere.radius
          : groundY;
      changed = true;
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
    return { changed, standY };
  };

  return {
    applySurface,
    top: surfaceSurface,
    framing,
    kind: () => surfaceKind,
    measureFraming,
    ready: () => surfaceReady,
    setStaged: (visible: boolean) => {
      const staged = surfaceKind !== "none" && visible;
      if (surfaceMesh) surfaceMesh.visible = staged;
      if (legMesh) legMesh.visible = staged && legGeometry !== null;
    },
    target,
  };
}
