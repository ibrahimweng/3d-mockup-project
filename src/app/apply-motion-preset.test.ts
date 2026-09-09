import { expect, test } from "vitest";

import {
  createToolcraftState,
  evaluateToolcraftTimelineValue,
  toolcraftReducer,
  type ToolcraftCommand,
  type ToolcraftState,
} from "@/toolcraft/runtime";

import { appSchema } from "./app-schema";
import { getMotionPresetCommand, readMotionSubject } from "./apply-motion-preset";
import type { MotionPresetId } from "./motion-presets";

/**
 * Laying a move down, through the real reducer.
 *
 * The arithmetic of each move is pinned down in `motion-presets.test.ts`. This
 * is the other half: that a preset reaches the timeline as one act, that it
 * leaves alone what it does not own, and that the frames it writes are the
 * frames the renderer then evaluates.
 */
function run(state: ToolcraftState, ...commands: readonly ToolcraftCommand[]): ToolcraftState {
  return commands.reduce(toolcraftReducer, state);
}

const fresh = () => createToolcraftState(appSchema);

function apply(state: ToolcraftState, preset: MotionPresetId): ToolcraftState {
  const chosen = run(state, {
    target: "motion.preset",
    type: "controls.setValue",
    value: preset,
  });
  const command = getMotionPresetCommand(chosen, preset);

  return command ? run(chosen, command) : chosen;
}

const tracksOf = (state: ToolcraftState) =>
  state.timeline.keyframeGroups.map((group) => group.controlId).sort();

const timesOf = (state: ToolcraftState, controlId: string) =>
  state.timeline.keyframeGroups
    .find((group) => group.controlId === controlId)
    ?.keyframes.map((keyframe) => keyframe.timeSeconds);

test("applying a preset is one command and one thing to undo", () => {
  // The whole reason `timeline.setControlKeyframes` exists. Built out of a
  // delete and a keyframe-per-write, a hero that writes three tracks and eleven
  // keyframes put more than a dozen entries in the history for one press, and
  // undo walked back through them one keyframe at a time.
  const start = fresh();
  const before = start.history.undo.length;
  const applied = apply(start, "hero");

  expect(applied.history.undo.length - before).toBe(
    // One for the picker's own value, one for the keyframes.
    2,
  );
  expect(tracksOf(applied).length).toBeGreaterThan(1);

  const undone = run(applied, { type: "history.undo" });
  expect(undone.timeline.keyframeGroups, "one press takes the whole move off").toEqual([]);
});

test("undo puts back keyframes the preset replaced, hand-made ones included", () => {
  // The danger a preset carries: it clears the tracks it owns. Restoring the
  // timeline whole is what makes that safe, and it works because the patch
  // carries the timeline as one object rather than a keyframe at a time.
  const byHand = run(fresh(), {
    controlId: "device.spin",
    controlLabel: "Spin",
    timeSeconds: 2.5,
    type: "timeline.upsertControlKeyframe",
    value: 123,
    valueLabel: "123",
  });
  const over = apply(byHand, "turntable");

  expect(timesOf(over, "device.spin"), "the preset replaced the hand-made track").toEqual([0, 6]);

  const undone = run(over, { type: "history.undo" });
  expect(timesOf(undone, "device.spin"), "and undo puts the hand-made one back").toEqual([2.5]);
  expect(
    evaluateToolcraftTimelineValue(undone, "device.spin", 2.5),
    "with its value, not a preset's",
  ).toBe(123);
});

test("a preset leaves alone every track it does not use", () => {
  // Which is what makes them combine. A light sweep over a turntable has to
  // keep the turn, or the picker would be a list of nine things you can only
  // ever have one of.
  const turning = apply(fresh(), "turntable");
  const lit = apply(turning, "light-sweep");

  expect(tracksOf(lit)).toEqual(["device.spin", "light.keyDirection"]);
  expect(timesOf(lit, "device.spin"), "the turn is untouched").toEqual([0, 6]);
});

test("None takes off the tracks a preset owns and nothing else", () => {
  // Somebody who keyed the backdrop by hand did not ask for it to be removed
  // because they turned the motion off.
  const byHand = run(apply(fresh(), "float"), {
    controlId: "backdrop.height",
    controlLabel: "Height",
    timeSeconds: 1,
    type: "timeline.upsertControlKeyframe",
    value: 40,
    valueLabel: "40",
  });

  expect(tracksOf(byHand)).toContain("device.positionY");

  const cleared = apply(byHand, "none");

  expect(tracksOf(cleared)).toEqual(["backdrop.height"]);
  // Nothing to clear is nothing to do, rather than an empty entry in history.
  expect(getMotionPresetCommand(fresh(), "none")).toBeNull();
});

test("a cleared control keeps the frame it was showing", () => {
  // The value under a keyed control is whatever it was before the track went
  // down, and nothing has read it since. Taking the track off has to hand back
  // what was on screen instead of snapping the product somewhere else.
  const floating = apply(fresh(), "float");
  const showing = evaluateToolcraftTimelineValue(floating, "device.positionY", 0);
  const cleared = apply(floating, "none");

  expect(cleared.values["device.positionY"]).toBe(showing);
});

test("fractions become seconds against whatever length the loop is", () => {
  // A preset that keyed at four seconds would be wrong the moment somebody made
  // the loop three seconds long.
  for (const durationSeconds of [3, 6, 12]) {
    const state = apply(
      run(fresh(), { durationSeconds, type: "timeline.setDuration" }),
      "flip",
    );
    const times = timesOf(state, "device.spin")!;

    expect(times[0], `${durationSeconds}s`).toBe(0);
    expect(times[times.length - 1], `${durationSeconds}s`).toBe(durationSeconds);
    // The holds keep their share of the loop rather than their number of
    // seconds, so a flip reads the same at any length.
    expect(times[1]! / durationSeconds).toBeCloseTo(times[1]! / durationSeconds, 9);
    expect(times.every((time) => time >= 0 && time <= durationSeconds)).toBe(true);
  }
});

test("the keyframes carry the curve the move asked for", () => {
  // Without this every preset arrives with the editor's ease-in-out, and a
  // turntable stops dead once a revolution.
  const spin = apply(fresh(), "turntable").timeline.keyframeGroups.find(
    (group) => group.controlId === "device.spin",
  );
  expect(spin?.keyframes[0]?.easing).toEqual({ controlPoints: [0, 0, 1, 1], type: "bezier" });

  const roll = apply(fresh(), "sway").timeline.keyframeGroups.find(
    (group) => group.controlId === "device.roll",
  );
  // Carries through the bottom of the swing rather than resting there.
  expect(roll?.keyframes[0]?.easing).toEqual({ type: "continuous" });
  expect(roll?.keyframes[1]?.easing?.type).toBe("bezier");
});

test("a move is built around what is on screen, not the value underneath it", () => {
  // The same fault the camera drag had: once a control is keyed, `state.values`
  // holds something nothing reads. A preset applied over an existing animation
  // has to start from the frame the loop begins on.
  const keyed = run(
    fresh(),
    {
      controlId: "device.positionY",
      controlLabel: "Position Y",
      timeSeconds: 0,
      type: "timeline.upsertControlKeyframe",
      value: 55,
      valueLabel: "55",
    },
    {
      controlId: "device.positionY",
      controlLabel: "Position Y",
      timeSeconds: 4,
      type: "timeline.upsertControlKeyframe",
      value: -20,
      valueLabel: "-20",
    },
  );

  expect(readMotionSubject(keyed).positionY, "read at the top of the loop").toBe(55);
  expect(keyed.values["device.positionY"], "which is not the raw value").not.toBe(55);

  const floating = apply(keyed, "float");
  expect(evaluateToolcraftTimelineValue(floating, "device.positionY", 0)).toBe(55);
});

test("what the renderer evaluates is what the move described", () => {
  // End to end: the point of all of it is that the frame at a given time is the
  // one the preset meant, so a turn is a quarter turned at a quarter through.
  const turning = apply(fresh(), "turntable");

  for (const [fraction, expected] of [
    [0.25, 90],
    [0.5, 180],
    [0.75, 270],
  ] as const) {
    expect(
      evaluateToolcraftTimelineValue(turning, "device.spin", 6 * fraction),
      `${fraction} of the way round`,
    ).toBeCloseTo(expected, 3);
  }
});

test("the timeline opens when a move is laid down", () => {
  // A row of diamonds behind a collapsed panel is an animation nobody can see
  // they have.
  expect(apply(fresh(), "hero").timeline.expanded).toBe(true);
});

test("a preset keeps every track where it already was", () => {
  // Rebuilding the list as "everything else, then what this command wrote"
  // reordered the panel every time one preset went on over another: rows
  // jumped under the pointer, and the row list is animated, which turned a
  // reorder-and-remove in one commit into rows that never left the screen.
  const turning = apply(fresh(), "turntable");
  const order = () => (state: ToolcraftState) =>
    state.timeline.keyframeGroups.map((group) => group.controlId);

  // Spin first, then a camera move appended after it.
  expect(order()(turning)).toEqual(["device.spin"]);

  const arced = apply(turning, "arc");
  expect(order()(arced)).toEqual(["device.spin", "camera.orbit"]);

  // Re-applying the first one must not move it to the end.
  const again = apply(arced, "turntable");
  expect(
    order()(again),
    "a track that is replaced keeps its place; only a new one is appended",
  ).toEqual(["device.spin", "camera.orbit"]);

  // And a third preset lands after both.
  const lit = apply(again, "light-sweep");
  expect(order()(lit)).toEqual(["device.spin", "camera.orbit", "light.keyDirection"]);
});

test("turning a track off leaves the others exactly as they were", () => {
  // The state half of the ghost-row fault. What was wrong was only the
  // drawing, but this is the guarantee the drawing has to match.
  const built = apply(apply(apply(fresh(), "hero"), "arc"), "float");
  const before = built.timeline.keyframeGroups.map((group) => group.controlId);

  expect(before).toContain("device.spin");

  const off = run(built, {
    controlId: "device.spin",
    controlLabel: "Spin",
    type: "timeline.toggleControlKeyframes",
    value: 0,
    valueLabel: "0",
  });

  expect(off.timeline.keyframeGroups.map((group) => group.controlId)).toEqual(
    before.filter((controlId) => controlId !== "device.spin"),
  );
});
