import { describe, expect, test } from "vitest";

import {
  createToolcraftState,
  evaluateToolcraftTimelineValue,
  toolcraftReducer,
  type ToolcraftCommand,
  type ToolcraftState,
  type ToolcraftTimelineKeyframeEasing,
} from "@/toolcraft/runtime";

import { appSchema } from "./app-schema";

/**
 * Continuous keyframes, measured as speed rather than as control points.
 *
 * Every other easing shapes one segment and rests at both of its ends, so a run
 * of three keyframes comes to a full stop at the middle one. That stop is the
 * thing continuous exists to remove, and the only honest way to check it is to
 * differentiate the evaluated value across the joint and look at the number.
 */
function run(state: ToolcraftState, ...commands: readonly ToolcraftCommand[]): ToolcraftState {
  return commands.reduce(toolcraftReducer, state);
}

const SMOOTH: ToolcraftTimelineKeyframeEasing = {
  controlPoints: [0.65, 0, 0.35, 1],
  type: "bezier",
};
const CONTINUOUS: ToolcraftTimelineKeyframeEasing = { type: "continuous" };

/**
 * Lay down a run of keyframes on one control. The first keying has to toggle
 * the control on; every one after it is an upsert, which is how the panel does
 * it.
 */
function keyRun(
  state: ToolcraftState,
  target: string,
  points: readonly (readonly [number, number])[],
): ToolcraftState {
  return points.reduce((next, [timeSeconds, value], index) => {
    return run(next, {
      controlId: target,
      controlLabel: target,
      timeSeconds,
      type: index === 0 ? "timeline.toggleControlKeyframes" : "timeline.upsertControlKeyframe",
      value,
      valueLabel: String(value),
    });
  }, state);
}

function setEasing(
  state: ToolcraftState,
  target: string,
  index: number,
  easing: ToolcraftTimelineKeyframeEasing,
): ToolcraftState {
  return run(state, {
    easing,
    keyframeId: `${target}::${index}`,
    type: "timeline.changeKeyframeEasing",
  });
}

function valueAt(state: ToolcraftState, target: string, timeSeconds: number): number {
  const value = evaluateToolcraftTimelineValue(state, target, timeSeconds);

  expect(typeof value, `${target} at ${timeSeconds}s should evaluate to a number`).toBe("number");

  return value as number;
}

/** Units per second, measured across the evaluated value rather than assumed. */
function speedAt(state: ToolcraftState, target: string, timeSeconds: number): number {
  const step = 0.01;

  return (
    (valueAt(state, target, timeSeconds + step) - valueAt(state, target, timeSeconds - step)) /
    (2 * step)
  );
}

const fresh = () => createToolcraftState(appSchema);

/** Three keyframes climbing at a steady ten units a second, joint at t = 1. */
function threeKeyframeClimb(easingAtJoint: ToolcraftTimelineKeyframeEasing): ToolcraftState {
  const state = keyRun(fresh(), "device.spin", [
    [0, 0],
    [1, 10],
    [2, 20],
  ]);

  return setEasing(state, "device.spin", 1, easingAtJoint);
}

describe("continuous keyframes", () => {
  test("a smooth keyframe stops the motion dead at the joint", () => {
    const state = threeKeyframeClimb(SMOOTH);

    // The value is right either way — it is the speed that is wrong. Both
    // segments ease to rest at the shared keyframe, so the device arrives,
    // stops, and sets off again twice per loop.
    expect(valueAt(state, "device.spin", 1)).toBeCloseTo(10, 6);
    expect(Math.abs(speedAt(state, "device.spin", 1))).toBeLessThan(1);
  });

  test("a continuous keyframe carries the motion through at the speed it arrives", () => {
    const state = threeKeyframeClimb(CONTINUOUS);

    // Ten units of value over one second on each side, so the speed to carry
    // through at is ten. It still passes exactly through the keyed value.
    expect(valueAt(state, "device.spin", 1)).toBeCloseTo(10, 6);
    expect(speedAt(state, "device.spin", 1)).toBeCloseTo(10, 0);

    // And the joint is no longer the slowest point of the run, which is the
    // whole complaint.
    expect(speedAt(state, "device.spin", 1)).toBeGreaterThan(
      Math.abs(speedAt(threeKeyframeClimb(SMOOTH), "device.spin", 1)),
    );
  });

  test("continuous re-solves when a neighbour moves, instead of going stale", () => {
    const state = threeKeyframeClimb(CONTINUOUS);
    const before = speedAt(state, "device.spin", 1);

    // Push the last keyframe twice as far. The speed to carry through the joint
    // at is the average across the neighbours, so it has to rise. A curve baked
    // at the moment the keyframe was marked would not have moved at all.
    const steeper = run(state, {
      controlId: "device.spin",
      controlLabel: "device.spin",
      timeSeconds: 2,
      type: "timeline.upsertControlKeyframe",
      value: 30,
      valueLabel: "30",
    });

    expect(speedAt(steeper, "device.spin", 1)).toBeGreaterThan(before + 1);
  });

  test("continuous flattens at a peak rather than overshooting past it", () => {
    // Up then back down. The average across the neighbours points flat, and
    // following a slope through the turn would swing the value past the
    // keyframe on both sides before coming back.
    let state = keyRun(fresh(), "device.positionY", [
      [0, 0],
      [1, 10],
      [2, 0],
    ]);
    state = setEasing(state, "device.positionY", 1, CONTINUOUS);

    let peak = -Infinity;

    for (let timeSeconds = 0; timeSeconds <= 2; timeSeconds += 0.005) {
      peak = Math.max(peak, valueAt(state, "device.positionY", timeSeconds));
    }

    expect(peak).toBeCloseTo(10, 4);
  });

  test("each axis keeps its own easing", () => {
    let state = keyRun(fresh(), "device.spin", [
      [0, 0],
      [1, 10],
      [2, 20],
    ]);
    state = keyRun(state, "device.positionX", [
      [0, 0],
      [1, 10],
      [2, 20],
    ]);

    // Spin is asked to carry through; Position X is not touched.
    state = setEasing(state, "device.spin", 1, CONTINUOUS);

    expect(speedAt(state, "device.spin", 1)).toBeCloseTo(10, 0);
    expect(Math.abs(speedAt(state, "device.positionX", 1))).toBeLessThan(1);
  });

  test("a hold beats a continuous neighbour", () => {
    let state = threeKeyframeClimb(CONTINUOUS);

    // The first keyframe holds its value to the joint. A hold is absolute, so
    // the continuous keyframe at the far end of that segment cannot round it
    // off — the segment stays flat and jumps at the end.
    state = setEasing(state, "device.spin", 0, { type: "step" });

    expect(valueAt(state, "device.spin", 0.5)).toBeCloseTo(0, 6);
    expect(valueAt(state, "device.spin", 0.99)).toBeCloseTo(0, 6);

    // The segment after the joint still carries through, because that one is
    // the continuous keyframe's own.
    expect(speedAt(state, "device.spin", 1.5)).toBeGreaterThan(0);
  });

  test("continuous composes with an ordinary curve at the other end", () => {
    let state = threeKeyframeClimb(CONTINUOUS);

    // Leave the run gently and arrive at the joint at speed: the opening
    // keyframe keeps its own ease, and only the handle the continuous keyframe
    // owns is replaced.
    state = setEasing(state, "device.spin", 0, {
      controlPoints: [0.42, 0, 1, 1],
      type: "bezier",
    });

    expect(speedAt(state, "device.spin", 0.05)).toBeLessThan(4);
    expect(speedAt(state, "device.spin", 1)).toBeGreaterThan(8);
  });
});
