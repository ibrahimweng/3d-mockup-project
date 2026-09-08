import * as THREE from "three";

import { sweptSubjectBox } from "./camera-fit";
import { getDevicePose } from "./device-pose";
import type { DeviceTransform } from "./scene-types";

/**
 * What the camera has to hold, and a key saying whether that has changed.
 *
 * Kept apart from the scene builder because it answers a different question.
 * The builder owns where the product stands; this owns where the *camera* is
 * framing from, and since Auto frame exists those two are no longer the same
 * pose. With the switch off the product moves and the framing deliberately
 * does not; switching it back on moves the framing while the product stands
 * still. A scene that read the framing off the posed product could express
 * neither.
 *
 * The box is the cylinder the product sweeps rather than the box it stands in
 * at this instant, and that is the whole reason a turntable is steady. A
 * turned product occupies a different box from a square-on one — a laptop is
 * four times wider than it is deep, so its box swings by half its own depth
 * over a revolution — and a camera fitted to the box of the moment answered
 * that by dollying back and in twice a turn while the product was supposed to
 * be the only thing moving. Swept, the answer is the same at every spin angle,
 * so the camera has nothing to react to.
 *
 * Spin is out of it exactly rather than approximately: spin is applied last
 * and about the room's vertical, which is the axis being swept. Tilt, roll,
 * size and position are all still in, because all of them change the shape
 * being swept and none of them is the turntable axis.
 */
export function measureFramingPose(request: {
  half: THREE.Vector3;
  radius: number;
  transform: DeviceTransform;
}): { box: THREE.Box3; key: string } {
  const { half, radius, transform } = request;
  const pose = getDevicePose({ half, radius, transform });

  return {
    box: sweptSubjectBox({
      half,
      position: pose.position,
      rollDegrees: transform.roll,
      scale: pose.scale,
      tiltDegrees: transform.tilt,
    }),
    // Everything the box is built from, so the scene can skip re-measuring
    // when none of it moved. Spin is absent for the same reason it is absent
    // from the box.
    key: [pose.position.toArray(), pose.scale, transform.tilt, transform.roll].join(),
  };
}
