import * as THREE from "three";
import { describe, expect, test } from "vitest";

import { getDevicePose, minimumDeviceScale } from "./device-pose";
import type { DeviceTransform } from "./scene-types";

/** A subject one unit in radius standing on the floor half a unit below centre. */
const radius = 1;
const groundY = -0.5;

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
  return getDevicePose({ groundY, radius, transform: { ...restingTransform, ...patch } });
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
  expect(leaned.position.equals(resting.position)).toBe(true);
});

test("roll cants the device sideways", () => {
  const canted = pose({ roll: 30 });

  const up = upAxisAfter({ roll: 30 });
  expect(THREE.MathUtils.radToDeg(up.angleTo(new THREE.Vector3(0, 1, 0)))).toBeCloseTo(30, 10);
  // A cant drops one shoulder: the up-axis leaves vertical sideways, not
  // backwards, which is what separates it from a lean.
  expect(up.x).not.toBeCloseTo(0, 3);
  expect(up.z).toBeCloseTo(0, 10);
  expect(canted.position.equals(resting.position)).toBe(true);
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
