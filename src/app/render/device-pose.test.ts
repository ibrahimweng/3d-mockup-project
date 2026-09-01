import * as THREE from "three";
import { describe, expect, test } from "vitest";

import { getDevicePose, minimumDeviceScale } from "./device-pose";
import type { DeviceTransform } from "./scene-types";

/**
 * A flat board on a table, long in one direction on purpose.
 *
 * A cube would pass a test a board fails: how far a turned subject reaches
 * below its own centre depends on the whole shape, and the part of this that
 * used to be wrong only shows on something longer than it is thick.
 */
const half = new THREE.Vector3(0.4, 0.2, 1.5);
const radius = half.length();
/** The floor: the subject is recentred, so its underside is where it stands. */
const groundY = -half.y;

const restingTransform: DeviceTransform = {
  offsetX: 0,
  offsetY: 0,
  offsetZ: 0,
  roll: 0,
  scale: 1,
  spin: 0,
  tilt: 0,
};

function pose(patch: Partial<DeviceTransform>) {
  return getDevicePose({ half, radius, transform: { ...restingTransform, ...patch } });
}

/** The lowest corner of the posed box, which is what stands on the floor. */
function feetAfter(patch: Partial<DeviceTransform>): number {
  const posed = pose(patch);
  let lowest = Infinity;
  for (let corner = 0; corner < 8; corner += 1) {
    const y = new THREE.Vector3(
      (corner & 1 ? 1 : -1) * half.x,
      (corner & 2 ? 1 : -1) * half.y,
      (corner & 4 ? 1 : -1) * half.z,
    )
      .multiplyScalar(posed.scale)
      .applyEuler(posed.rotation)
      .add(posed.position).y;
    lowest = Math.min(lowest, y);
  }
  return lowest;
}

/** Where the subject's own up-axis ends up pointing once the pose is applied. */
function upAxisAfter(patch: Partial<DeviceTransform>): THREE.Vector3 {
  return new THREE.Vector3(0, 1, 0).applyEuler(pose(patch).rotation);
}

const resting = pose({});

test("spin turns the subject without moving the camera", () => {
  const turned = pose({ spin: 90 });

  // A turn is about the room's vertical, so the subject's own up-axis is
  // untouched: it is the object that turned, not the room around it.
  expect(upAxisAfter({ spin: 90 }).y).toBeCloseTo(1, 10);
  // A point out along +Z comes round to +X at a quarter turn.
  const front = new THREE.Vector3(0, 0, 1).applyEuler(turned.rotation);
  expect(front.x).toBeCloseTo(1, 10);
  expect(front.z).toBeCloseTo(0, 10);
  // Nothing about a turn moves the subject or changes its size, and the camera
  // is not part of this pose at all.
  expect(turned.position.equals(resting.position)).toBe(true);
  expect(turned.scale).toBe(resting.scale);

  // A full revolution is the same pose as none, which is what makes a turntable
  // loop seamlessly.
  const full = new THREE.Vector3(0, 0, 1).applyEuler(pose({ spin: 360 }).rotation);
  expect(full.x).toBeCloseTo(0, 10);
  expect(full.z).toBeCloseTo(1, 10);
});

test("tilt leans the device without turning it", () => {
  const leaned = pose({ tilt: 30 });

  // Leaning tips the up-axis back through exactly the angle asked for.
  const up = upAxisAfter({ tilt: 30 });
  expect(THREE.MathUtils.radToDeg(up.angleTo(new THREE.Vector3(0, 1, 0)))).toBeCloseTo(30, 10);
  // A lean is about the side-to-side axis, so it does not swing the subject
  // round: the tipped up-axis stays in the plane facing the camera.
  expect(up.x).toBeCloseTo(0, 10);
  // It leans where it stands: nothing slides sideways or towards the camera.
  // What does change is the height, because a subject that leans stands on a
  // different corner -- see the floor tests at the foot of this file.
  expect(leaned.position.x).toBeCloseTo(resting.position.x, 10);
  expect(leaned.position.z).toBeCloseTo(resting.position.z, 10);
});

test("roll cants the device sideways", () => {
  const canted = pose({ roll: 30 });

  const up = upAxisAfter({ roll: 30 });
  expect(THREE.MathUtils.radToDeg(up.angleTo(new THREE.Vector3(0, 1, 0)))).toBeCloseTo(30, 10);
  // A cant drops one shoulder: the up-axis leaves vertical sideways, not
  // backwards, which is what separates it from a lean.
  expect(up.x).not.toBeCloseTo(0, 3);
  expect(up.z).toBeCloseTo(0, 10);
  expect(canted.position.x).toBeCloseTo(resting.position.x, 10);
  expect(canted.position.z).toBeCloseTo(resting.position.z, 10);
});

describe("the three pose angles stay independent", () => {
  test("a lean and a turn compose without becoming a gimbal", () => {
    // The turn is applied about the room's vertical whatever the lean, so a
    // leaning device sweeps like something on a display stand rather than
    // keeping its lean pointed at the camera all the way round.
    const leanOnly = upAxisAfter({ tilt: 30 });
    const leanAndQuarterTurn = upAxisAfter({ spin: 90, tilt: 30 });
    const vertical = new THREE.Vector3(0, 1, 0);

    // The lean away from vertical survives the turn unchanged in size...
    expect(leanAndQuarterTurn.angleTo(vertical)).toBeCloseTo(leanOnly.angleTo(vertical), 10);
    // ...but now points somewhere else, which is the whole point of a turntable.
    expect(leanAndQuarterTurn.z).not.toBeCloseTo(leanOnly.z, 3);
  });
});

test("position x slides the device across the set", () => {
  const moved = pose({ offsetX: 0.5 });

  // Offsets are multiples of the subject's own radius, so the same control
  // value moves a watch and a monitor by the same amount of themselves.
  expect(moved.position.x).toBeCloseTo(0.5 * radius, 10);
  expect(moved.position.y).toBeCloseTo(resting.position.y, 10);
  expect(moved.position.z).toBeCloseTo(resting.position.z, 10);
  expect(pose({ offsetX: -0.5 }).position.x).toBeCloseTo(-0.5 * radius, 10);
});

test("position y lifts the device off the floor", () => {
  const lifted = pose({ offsetY: 0.5 });

  expect(lifted.position.y).toBeCloseTo(0.5 * radius, 10);
  expect(lifted.position.y).toBeGreaterThan(resting.position.y);
  expect(lifted.position.x).toBeCloseTo(resting.position.x, 10);
  expect(lifted.position.z).toBeCloseTo(resting.position.z, 10);
});

test("position z moves the device towards the camera", () => {
  const nearer = pose({ offsetZ: 0.5 });

  expect(nearer.position.z).toBeCloseTo(0.5 * radius, 10);
  expect(nearer.position.x).toBeCloseTo(resting.position.x, 10);
  expect(nearer.position.y).toBeCloseTo(resting.position.y, 10);
});

test("scale resizes the device from its feet", () => {
  const half = pose({ scale: 0.5 });
  expect(half.scale).toBe(0.5);

  // The feet are what must not move. At rest they sit at `groundY`; scaled,
  // they sit at the scaled offset plus whatever the pose lifted the body by.
  const restingFeet = resting.position.y + groundY * resting.scale;
  const halfFeet = half.position.y + groundY * half.scale;
  expect(halfFeet).toBeCloseTo(restingFeet, 10);

  // Which is only true because the centre was moved to compensate. A smaller
  // body's centre sits nearer its own feet, so holding the feet still means
  // bringing the centre down — scaling about the centre instead would have
  // lifted the whole device off the floor.
  expect(half.position.y).toBeLessThan(resting.position.y);

  // Growing keeps the same promise, and moves the centre the other way.
  const doubled = pose({ scale: 2 });
  expect(doubled.position.y + groundY * doubled.scale).toBeCloseTo(restingFeet, 10);
  expect(doubled.position.y).toBeGreaterThan(resting.position.y);

  // A subject scaled to nothing cannot be photographed, so there is a floor.
  expect(pose({ scale: 0 }).scale).toBe(minimumDeviceScale);
  expect(pose({ scale: -5 }).scale).toBe(minimumDeviceScale);
});

describe("a posed device stands on the floor rather than through it", () => {
  /**
   * The bug this is here for.
   *
   * Everything about a pose turns the subject about its own centre, which is
   * what a turntable does and is not what a table does. Leaning a 320mm
   * clipboard back by twenty degrees took the end the clip is on 45mm under the
   * floor, and the floor is drawn over whatever is beneath it -- so the clip did
   * not look sunk, it looked absent, and the model was searched for a missing
   * part that was there the whole time.
   *
   * Stated as the invariant it always was: whatever the pose, the lowest corner
   * of the subject is on the ground.
   */
  test("however far it leans, cants or turns", () => {
    for (const tilt of [0, 5, 20, 48, 90, -37, -90]) {
      expect(feetAfter({ tilt })).toBeCloseTo(groundY, 10);
    }
    for (const roll of [15, 90, 180, -62]) {
      expect(feetAfter({ roll })).toBeCloseTo(groundY, 10);
    }
    // And composed, where the lowest corner is not the one any single angle
    // would have put there.
    expect(feetAfter({ roll: 25, spin: 40, tilt: 33 })).toBeCloseTo(groundY, 10);
    expect(feetAfter({ roll: -80, scale: 0.4, tilt: 61 })).toBeCloseTo(groundY, 10);
  });

  test("which means leaning lifts it, and the further it leans the more", () => {
    // The correction, stated the other way round: a lean that used to bury the
    // far end now raises the middle instead. Twenty degrees on this board puts
    // the corner 1.5*sin(20) + 0.2*cos(20) = 0.701 below the centre, and it
    // already stood 0.2 below, so the body comes up by the difference.
    expect(pose({ tilt: 20 }).position.y).toBeCloseTo(0.5010, 4);
    expect(pose({ tilt: 48 }).position.y).toBeGreaterThan(pose({ tilt: 20 }).position.y);
    expect(pose({ tilt: 90 }).position.y).toBeCloseTo(half.z - half.y, 10);
    // Untouched, nothing moves: this is a correction, not an offset.
    expect(pose({}).position.y).toBe(0);
  });

  test("and a spin alone leaves it flat on the table", () => {
    // Turning on the spot cannot change what the subject stands on, so a
    // turntable must not bob up and down as it goes round.
    for (const spin of [0, 30, 90, 145, 270]) {
      expect(pose({ spin }).position.y).toBeCloseTo(0, 10);
    }
  });
});
