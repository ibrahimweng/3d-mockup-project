import { expect, test } from "vitest";

import {
  createToolcraftState,
  evaluateToolcraftTimelineValue,
  toolcraftReducer,
  type ToolcraftCommand,
  type ToolcraftState,
} from "@/toolcraft/runtime";
import { getToolcraftPanelTargetValue } from "@/toolcraft/runtime/react/controls-panel/conditions/control-conditions";

import { appSchema } from "./app-schema";

/**
 * Editing an animation, rather than playing one back.
 *
 * `app-timeline-runtime.test.ts` proves the clock: that a keyed turn evaluates
 * to the right angle at any time and that the loop is seamless. This file
 * proves the part in front of the person making it — the number in the right
 * panel, and what happens to the track when they change it or drag a diamond
 * around. All three of these were wrong, and wrong in a way that made building
 * an animation by hand quietly impossible rather than visibly broken.
 */
function run(state: ToolcraftState, ...commands: readonly ToolcraftCommand[]): ToolcraftState {
  return commands.reduce(toolcraftReducer, state);
}

const fresh = () => createToolcraftState(appSchema);

/** Spin's keyframes as times and values, which is all these assertions care about. */
function spinTrack(state: ToolcraftState): Array<{ t: number; v: unknown }> {
  return (
    state.timeline.keyframeGroups
      .find((group) => group.controlId === "device.spin")
      ?.keyframes.map((keyframe) => ({ t: keyframe.timeSeconds, v: keyframe.value })) ?? []
  );
}

/** The diamond beside a control's label: key it where the playhead stands. */
function keyHere(state: ToolcraftState, value: number): ToolcraftState {
  return run(state, {
    controlId: "device.spin",
    controlLabel: "Spin",
    type: "timeline.toggleControlKeyframes",
    value,
    valueLabel: String(value),
  });
}

/**
 * Turning the dial, exactly as the controls panel does it.
 *
 * The panel sends no time, which is the whole fix: the reducer reads the
 * playhead. A test that passes `timeSeconds` here would prove the reducer and
 * miss the bug, because the reducer was never the part that was wrong.
 */
function turnDialHere(state: ToolcraftState, value: number): ToolcraftState {
  return run(state, {
    controlId: "device.spin",
    controlLabel: "Spin",
    type: "timeline.upsertControlKeyframe",
    value,
    valueLabel: String(value),
  });
}

function scrubTo(state: ToolcraftState, currentTimeSeconds: number): ToolcraftState {
  return run(state, { currentTimeSeconds, type: "timeline.setCurrentTime" });
}

test("the panel reads a keyframed control at the playhead", () => {
  let state = keyHere(fresh(), 0);
  state = scrubTo(state, state.timeline.durationSeconds);
  state = turnDialHere(state, 360);

  // Scrubbing draws a time, and the number beside the slider is that time's
  // value. It used to be `state.values`, which is wherever the slider was last
  // dragged and which nothing has read since the track was laid down: the
  // device turned on screen while the box beside it sat frozen at 0. A number
  // that disagrees with the picture is worse than no number, because it is
  // also the value the next edit starts from.
  for (const [time, expected] of [
    [0, 0],
    [state.timeline.durationSeconds / 2, 180],
    [state.timeline.durationSeconds, 360],
  ] as const) {
    const at = scrubTo(state, time);
    expect(
      getToolcraftPanelTargetValue(at, "device.spin"),
      `the panel at ${time}s`,
    ).toBeCloseTo(expected, 5);
    // And it is the same number the renderer is drawing, which is the point.
    expect(getToolcraftPanelTargetValue(at, "device.spin")).toBe(
      evaluateToolcraftTimelineValue(at, "device.spin"),
    );
  }

  // A control nobody has keyed is untouched by any of this: it reads what it
  // is set to, at every time.
  const tilt = state.values["device.tilt"];
  expect(getToolcraftPanelTargetValue(scrubTo(state, 2), "device.tilt")).toBe(tilt);
});

test("changing a value keys the frame the playhead is on", () => {
  // The reported fault, start to finish. Key the angle at the start, drag the
  // playhead to the end, turn the dial — the four steps the Turntable preset
  // exists to save, and the four steps anyone takes for an animation the
  // preset does not cover.
  let state = keyHere(fresh(), 0);
  state = scrubTo(state, state.timeline.durationSeconds);
  state = turnDialHere(state, 180);

  // Two keyframes, and an animation between them. This used to produce one:
  // adding a keyframe selects it, the edit was routed to whichever keyframe
  // was selected, and so the value went into the keyframe back at the start.
  // The track changed value, no second keyframe was ever created, and nothing
  // moved. The playhead had no say in where the edit went.
  expect(spinTrack(state)).toEqual([
    { t: 0, v: 0 },
    { t: state.timeline.durationSeconds, v: 180 },
  ]);
  expect(evaluateToolcraftTimelineValue(state, "device.spin", 0)).toBe(0);
  expect(
    evaluateToolcraftTimelineValue(state, "device.spin", state.timeline.durationSeconds),
  ).toBe(180);

  // Landing on a frame that already carries a keyframe edits that keyframe
  // rather than stacking a second one on it. Which is the same rule, not a
  // second one: the playhead decides, and here it is standing on a keyframe.
  state = turnDialHere(state, 200);
  expect(spinTrack(state)).toEqual([
    { t: 0, v: 0 },
    { t: state.timeline.durationSeconds, v: 200 },
  ]);

  // A third, in the middle, from the same gesture.
  state = scrubTo(state, 2);
  state = turnDialHere(state, 90);
  expect(spinTrack(state)).toEqual([
    { t: 0, v: 0 },
    { t: 2, v: 90 },
    { t: state.timeline.durationSeconds, v: 200 },
  ]);
});

test("a selected keyframe elsewhere does not capture the edit", () => {
  // Selection is for dragging a keyframe, deleting it, and shaping its easing.
  // It is not a second, invisible cursor competing with the playhead over
  // where a value lands, which is what it had become.
  let state = keyHere(fresh(), 0);
  state = run(state, { keyframeId: "device.spin::0", type: "timeline.selectKeyframe" });
  expect(state.timeline.selectedKeyframeId).toBe("device.spin::0");

  state = scrubTo(state, 3);
  state = turnDialHere(state, 90);

  // The keyframe at 0 is untouched and a new one exists at 3, even though the
  // one at 0 was explicitly selected the whole time.
  expect(spinTrack(state)).toEqual([
    { t: 0, v: 0 },
    { t: 3, v: 90 },
  ]);
});

test("dragging a keyframe keeps the track in time order", () => {
  let state = keyHere(fresh(), 0);
  state = turnDialHere(state, 0);
  state = run(
    state,
    { controlId: "device.spin", controlLabel: "Spin", timeSeconds: 2, type: "timeline.upsertControlKeyframe", value: 90, valueLabel: "90" },
    { controlId: "device.spin", controlLabel: "Spin", timeSeconds: 4, type: "timeline.upsertControlKeyframe", value: 180, valueLabel: "180" },
  );
  expect(spinTrack(state)).toEqual([
    { t: 0, v: 0 },
    { t: 2, v: 90 },
    { t: 4, v: 180 },
  ]);

  // Drag the first keyframe past the second. The evaluator survived this
  // because it sorts a copy before reading; the row of diamonds drawn from the
  // stored order did not.
  state = run(state, { keyframeId: "device.spin::0", timeSeconds: 3, type: "timeline.moveKeyframe" });
  expect(spinTrack(state)).toEqual([
    { t: 2, v: 90 },
    { t: 3, v: 0 },
    { t: 4, v: 180 },
  ]);
});

test("a keyframe dropped onto another replaces it", () => {
  let state = keyHere(fresh(), 0);
  state = run(
    state,
    { controlId: "device.spin", controlLabel: "Spin", timeSeconds: 4, type: "timeline.upsertControlKeyframe", value: 180, valueLabel: "180" },
  );

  // Two keyframes cannot share a frame. A keyframe's id is its control and its
  // time, so landing on an occupied one used to mint a second keyframe
  // carrying the first one's id: two diamonds on one frame, selecting or
  // deleting either reaching both, and a value on the track that no time could
  // evaluate to. The one being dragged wins, because it is the one being
  // dragged.
  state = run(state, { keyframeId: "device.spin::0", timeSeconds: 4, type: "timeline.moveKeyframe" });
  expect(spinTrack(state)).toEqual([{ t: 4, v: 0 }]);

  const ids = state.timeline.keyframeGroups
    .flatMap((group) => group.keyframes)
    .map((keyframe) => keyframe.id);
  expect(new Set(ids).size, "every keyframe has its own id").toBe(ids.length);
  expect(state.timeline.selectedKeyframeId).toBe("device.spin::4");
});

test("clearing a track leaves the control on the frame that was showing", () => {
  let state = keyHere(fresh(), 0);
  state = scrubTo(state, state.timeline.durationSeconds);
  state = turnDialHere(state, 360);

  // Standing at the end of a full turn, the panel and the canvas both read
  // 360. Deleting the track used to drop the control back to `state.values` —
  // 0, the angle it was keyed from and the last thing written there before the
  // track existed — so the device jumped a full revolution on the way out.
  // Keeping the frame that was showing is what the person deleting the track
  // is looking at.
  expect(getToolcraftPanelTargetValue(state, "device.spin")).toBe(360);
  state = run(state, { controlId: "device.spin", type: "timeline.deleteControlKeyframes" });
  expect(spinTrack(state)).toEqual([]);
  expect(state.values["device.spin"]).toBe(360);
  expect(getToolcraftPanelTargetValue(state, "device.spin")).toBe(360);

  // One undo puts the keyframes and the value back together, because they went
  // in one patch rather than two.
  state = run(state, { type: "history.undo" });
  expect(spinTrack(state)).toEqual([
    { t: 0, v: 0 },
    { t: state.timeline.durationSeconds, v: 360 },
  ]);
  expect(state.values["device.spin"]).toBe(0);
});

test("the diamond turns a track off as well as on", () => {
  // The same button, and the same rule about what the control is left holding.
  let state = keyHere(fresh(), 0);
  state = scrubTo(state, 3);
  state = turnDialHere(state, 90);
  expect(spinTrack(state)).toHaveLength(2);

  state = keyHere(state, 90);
  expect(spinTrack(state)).toEqual([]);
  expect(state.values["device.spin"]).toBe(90);
});
