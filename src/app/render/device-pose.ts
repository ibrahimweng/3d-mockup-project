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
  /** The subject's lowest point, relative to its centre. Negative. */
  readonly groundY: number;
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

export function getDevicePose({ groundY, radius, transform }: DevicePoseInput): DevicePose {
  const scale = Math.max(minimumDeviceScale, transform.scale);
  // Scaling about the centre would sink the device into the floor on the way
  // down and lift it off on the way up. Lifting by the shortfall keeps its feet
  // where they were, so scale reads as a smaller object on the same table.
  const footLift = groundY * (1 - scale);

  return {
    position: new THREE.Vector3(
      transform.offsetX * radius,
      transform.offsetY * radius + footLift,
      transform.offsetZ * radius,
    ),
    // Spin last, about the room's vertical, so it stays a turntable however the
    // device is posed: a leaning device sweeps around like something on a
    // display stand. Tilting last instead would keep the lean pointed at the
    // camera through the whole turn, which is a gimbal, not a turntable.
    rotation: new THREE.Euler(
      THREE.MathUtils.degToRad(transform.tilt),
      THREE.MathUtils.degToRad(transform.spin),
      THREE.MathUtils.degToRad(transform.roll),
      "YXZ",
    ),
    scale,
  };
}
