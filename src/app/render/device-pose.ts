import * as THREE from "three";

import type { DeviceTransform } from "./scene-types";

/**
 * Where the device stands, as arithmetic.
 *
 * Pulled out of the scene builder so it can be checked without a GPU, a model
 * file or a canvas. The builder still owns the scene graph; this owns only the
 * question of what pose a set of control values means, which is the part every
 * placement requirement is actually about.
 */
export type DevicePoseInput = {
  /**
   * Half the subject's box, about its own centre, in the scene's own units.
   *
   * The floor is at `-half.y`, because the subject is recentred on the origin
   * before it is posed: its lowest point and the height of the ground it
   * stands on are the same number read twice. A box rather than that one
   * number because a pose turns the subject, and which corner is lowest
   * afterwards depends on all three.
   */
  readonly half: THREE.Vector3;
  /** The subject's bounding radius. Offsets are expressed in multiples of it. */
  readonly radius: number;
  readonly transform: DeviceTransform;
};

export type DevicePose = {
  readonly position: THREE.Vector3;
  readonly rotation: THREE.Euler;
  readonly scale: number;
};

/** Below this the subject is a point, and a point cannot be photographed. */
export const minimumDeviceScale = 0.01;

export function getDevicePose({ half, radius, transform }: DevicePoseInput): DevicePose {
  const scale = Math.max(minimumDeviceScale, transform.scale);
  // Spin last, about the room's vertical, so it stays a turntable however the
  // device is posed: a leaning device sweeps around like something on a
  // display stand. Tilting last instead would keep the lean pointed at the
  // camera through the whole turn, which is a gimbal, not a turntable.
  const rotation = new THREE.Euler(
    THREE.MathUtils.degToRad(transform.tilt),
    THREE.MathUtils.degToRad(transform.spin),
    THREE.MathUtils.degToRad(transform.roll),
    "YXZ",
  );

  /**
   * The subject's feet, lifted back onto the floor wherever the pose put them.
   *
   * Everything here turns and grows about the subject's own centre, which is
   * the right thing for a turntable and the wrong thing for a floor: scaled
   * down it hangs in the air, and leaned over it goes through the table. Both
   * are the same mistake, and this is the one correction for both.
   *
   * A box turned about its centre reaches lowest at one corner, and which
   * corner that is falls out of the arithmetic rather than needing a search:
   * take the row of the rotation that lands on the vertical, and the corner
   * that goes furthest down is the one that agrees in sign with all three of
   * its terms. So the depth is the same row against the box's half extents,
   * every term taken positive.
   *
   * With nothing turned this is the height of the box's own underside, and the
   * lift collapses to the shortfall from scaling alone, which is what this was
   * before a tilt could bury a part: the clipboard's clip is at one end of a
   * 320mm board, and 20 degrees of tilt put the whole of it under the table,
   * its highest point 15mm below the floor, with the floor drawn over it.
   */
  const m = new THREE.Matrix4().makeRotationFromEuler(rotation).elements;
  const drop = Math.abs(m[1]) * half.x + Math.abs(m[5]) * half.y + Math.abs(m[9]) * half.z;
  const footLift = drop * scale - half.y;

  return {
    position: new THREE.Vector3(
      transform.offsetX * radius,
      transform.offsetY * radius + footLift,
      transform.offsetZ * radius,
    ),
    rotation,
    scale,
  };
}
