import * as THREE from "three";

import type { LightPatternId } from "../product-domain";
import { createPatternGeometry } from "./set-geometry";
import type { LightingSettings } from "./scene-types";

/**
 * What the key has to know about the set it is lighting.
 *
 * Read through functions rather than taken as numbers because all three move
 * while the scene is alive: the cove is recut when the camera stands back, the
 * paper is run up and down by a slider, and the floor drops when a table
 * appears under the device.
 */
export type StageReader = {
  coveRadius: () => number;
  floorY: () => number;
  sweepHeight: () => number;
};

export type KeyLight = {
  applyPattern: (next: LightPatternId) => void;
  applyShadowEdge: (softness: number) => void;
  frameShadow: (position: THREE.Vector3) => void;
  key: THREE.DirectionalLight;
  keyDirection: THREE.Vector3;
};

/**
 * The one light in the rig that casts, and the cut-out it casts through.
 *
 * A second shadow map would read as two suns, which is the giveaway of a
 * rendered product shot rather than a photographed one, so everything to do
 * with shadow lives here: where the light stands, how wide its depth map has
 * to reach, how crisp its edge is, and what is held in front of it.
 */
export function createKeyLight(
  context: {
    disposables: { dispose: () => void }[];
    scene: THREE.Scene;
    sphere: THREE.Sphere;
    stage: StageReader;
  },
  options: { lighting: LightingSettings; shadowDetail?: number },
): KeyLight {
  const { disposables, scene, sphere, stage } = context;

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
    const radius = Math.max(stage.coveRadius(), sphere.radius * 6);
    const rise = Math.min(stage.sweepHeight() * sphere.radius * 16, sphere.radius * 6);
    let worst = 0;
    const probe = new THREE.Vector3();
    for (const height of [stage.floorY(), stage.floorY() + rise]) {
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
      stage.coveRadius() + sphere.radius * 2,
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

  return { applyPattern, applyShadowEdge, frameShadow, key, keyDirection };
}
