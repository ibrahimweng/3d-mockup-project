import { expect, test } from "vitest";

import {
  createToolcraftState,
  toolcraftReducer,
  type ToolcraftCommand,
  type ToolcraftState,
} from "@/toolcraft/runtime";
import { copyToolcraftTimelineSelection } from "@/toolcraft/runtime/state/timeline-selection";

import { appSchema } from "./app-schema";

/**
 * Editing more than one keyframe at a time.
 *
 * `app-timeline-keyframe-editing.test.ts` proves a single keyframe: that an
 * edit lands on the frame the playhead is on, and that dragging one diamond
 * onto another replaces it. This file proves the part that makes an animation
 * adjustable rather than merely buildable — retiming a move without flattening
 * it, and repeating one without rebuilding it by hand.
 *
 * The thing worth being careful about throughout is that a keyframe's id is
 * its control and its time, so every one of these operations mints new ids for
 * everything it touches. A selection that survives an operation survives it by
 * being rebuilt, not by being left alone.
 */
function run(state: ToolcraftState, ...commands: readonly ToolcraftCommand[]): ToolcraftState {
  return commands.reduce(toolcraftReducer, state);
}

/** A track of Spin keyframes at the given times, each carrying its time as a value. */
function withSpinAt(...timesSeconds: readonly number[]): ToolcraftState {
  return timesSeconds.reduce<ToolcraftState>(
    (state, timeSeconds) =>
      run(state, {
        controlId: "device.spin",
        controlLabel: "Spin",
        timeSeconds,
        type: "timeline.upsertControlKeyframe",
        value: timeSeconds * 10,
        valueLabel: `${timeSeconds * 10}`,
      }),
    createToolcraftState(appSchema),
  );
}

const times = (state: ToolcraftState, controlId = "device.spin"): number[] =>
  state.timeline.keyframeGroups
    .find((group) => group.controlId === controlId)
    ?.keyframes.map((keyframe) => keyframe.timeSeconds) ?? [];

const idAt = (state: ToolcraftState, timeSeconds: number, controlId = "device.spin"): string => {
  const keyframe = state.timeline.keyframeGroups
    .find((group) => group.controlId === controlId)
    ?.keyframes.find((item) => item.timeSeconds === timeSeconds);

  if (!keyframe) {
    throw new Error(`No ${controlId} keyframe at ${timeSeconds}s`);
  }

  return keyframe.id;
};

/** Select several, the way shift-clicking each in turn does. */
function select(state: ToolcraftState, ...timesSeconds: readonly number[]): ToolcraftState {
  return timesSeconds.reduce<ToolcraftState>(
    (current, timeSeconds, index) =>
      run(current, {
        additive: index > 0,
        keyframeId: idAt(current, timeSeconds),
        type: "timeline.selectKeyframe",
      }),
    state,
  );
}

test("shift-click builds a selection, and clicking again takes one back out", () => {
  const state = select(withSpinAt(0, 1, 2), 0, 1, 2);

  expect(times(state)).toEqual([0, 1, 2]);
  expect(state.timeline.selectedKeyframeIds).toHaveLength(3);
  // The anchor -- what the curve editor edits -- is the last one added.
  expect(state.timeline.selectedKeyframeId).toBe(idAt(state, 2));

  const fewer = run(state, {
    additive: true,
    keyframeId: idAt(state, 1),
    type: "timeline.selectKeyframe",
  });
  expect(fewer.timeline.selectedKeyframeIds).toHaveLength(2);
  expect(fewer.timeline.selectedKeyframeIds).not.toContain(idAt(state, 1));

  // A plain click still replaces the selection rather than adding to it.
  const single = run(fewer, { keyframeId: idAt(state, 0), type: "timeline.selectKeyframe" });
  expect(single.timeline.selectedKeyframeIds).toEqual([idAt(state, 0)]);
  expect(single.timeline.selectedKeyframeId).toBe(idAt(state, 0));
});

test("dragging a selection keeps its shape", () => {
  // The whole point of a multi-selection: a move you already timed should be
  // possible to slide later without re-timing it.
  const state = select(withSpinAt(0, 1, 2), 0, 1, 2);
  const moved = run(state, {
    anchorKeyframeId: idAt(state, 0),
    timeSeconds: 2,
    type: "timeline.moveSelectedKeyframes",
  });

  expect(times(moved)).toEqual([2, 3, 4]);
  expect(moved.timeline.selectedKeyframeIds).toHaveLength(3);
  // And the selection followed the keyframes to their new ids rather than
  // pointing at three that no longer exist.
  expect([...moved.timeline.selectedKeyframeIds].sort()).toEqual(
    [idAt(moved, 2), idAt(moved, 3), idAt(moved, 4)].sort(),
  );
});

test("a selection dragged into the end stops rather than piling up on it", () => {
  // Clamping each keyframe on its own would put all three on the last frame,
  // which destroys the move and cannot be undone by dragging back out.
  const state = select(withSpinAt(0, 1, 2), 0, 1, 2);
  const duration = state.timeline.durationSeconds;
  const moved = run(state, {
    anchorKeyframeId: idAt(state, 2),
    timeSeconds: duration + 5,
    type: "timeline.moveSelectedKeyframes",
  });

  expect(times(moved)).toEqual([duration - 2, duration - 1, duration]);

  // Dragging back out restores the spacing, because nothing was lost going in.
  const back = run(moved, {
    anchorKeyframeId: idAt(moved, duration),
    timeSeconds: 2,
    type: "timeline.moveSelectedKeyframes",
  });
  expect(times(back)).toEqual([0, 1, 2]);
});

test("a moved keyframe still replaces an unselected one it lands on", () => {
  const state = select(withSpinAt(0, 1, 4), 0, 1);
  const moved = run(state, {
    anchorKeyframeId: idAt(state, 1),
    timeSeconds: 4,
    type: "timeline.moveSelectedKeyframes",
  });

  // 0 and 1 shift by three onto 3 and 4; the keyframe that was at 4 is gone
  // rather than sharing a frame with the one that landed on it.
  expect(times(moved)).toEqual([3, 4]);
  expect(moved.timeline.selectedKeyframeIds).toHaveLength(2);
});

test("copy and paste repeat a move at the playhead", () => {
  const state = select(withSpinAt(0, 1), 0, 1);
  const copied = copyToolcraftTimelineSelection(
    state.timeline.keyframeGroups,
    state.timeline.selectedKeyframeIds,
  );

  // Offsets, not absolute times: a copy is a shape, and it is put down
  // wherever the playhead is rather than back where it came from.
  expect(copied.map((keyframe) => keyframe.offsetSeconds)).toEqual([0, 1]);

  const pasted = run(state, {
    keyframes: copied,
    timeSeconds: 3,
    type: "timeline.pasteKeyframes",
  });
  expect(times(pasted)).toEqual([0, 1, 3, 4]);
  // What you just pasted is what is selected, so it can be dragged straight away.
  expect(pasted.timeline.selectedKeyframeIds).toHaveLength(2);
  expect([...pasted.timeline.selectedKeyframeIds].sort()).toEqual(
    [idAt(pasted, 3), idAt(pasted, 4)].sort(),
  );
});

test("a paste that would overhang the end is shifted back, not truncated", () => {
  const state = select(withSpinAt(0, 2), 0, 2);
  const copied = copyToolcraftTimelineSelection(
    state.timeline.keyframeGroups,
    state.timeline.selectedKeyframeIds,
  );
  const duration = state.timeline.durationSeconds;
  const pasted = run(state, {
    keyframes: copied,
    timeSeconds: duration,
    type: "timeline.pasteKeyframes",
  });

  // Both keyframes survive, two seconds apart, ending on the last frame.
  // Clamping each would have stacked them both on it and lost the move.
  expect(times(pasted)).toContain(duration - 2);
  expect(times(pasted)).toContain(duration);
});

test("deleting a selection is one undo, and leaves the control on the frame shown", () => {
  const state = select(withSpinAt(0, 1, 2), 0, 1);
  const deleted = run(state, { type: "timeline.deleteSelectedKeyframes" });

  expect(times(deleted)).toEqual([2]);
  expect(deleted.timeline.selectedKeyframeIds).toEqual([]);
  expect(deleted.timeline.selectedKeyframeId).toBeNull();

  const undone = run(deleted, { type: "history.undo" });
  expect(times(undone)).toEqual([0, 1, 2]);
});

test("a selection spanning two tracks moves and copies as one", () => {
  // Objects are grouped by the front of their target, so this is the timeline's
  // version of selecting keyframes across two layers in After Effects.
  const spun = withSpinAt(0, 1);
  const both = run(spun, {
    controlId: "device.scale",
    controlLabel: "Size",
    timeSeconds: 1,
    type: "timeline.upsertControlKeyframe",
    value: 150,
    valueLabel: "150%",
  });
  const selected = run(
    run(both, { keyframeId: idAt(both, 0), type: "timeline.selectKeyframe" }),
    {
      additive: true,
      keyframeId: idAt(both, 1, "device.scale"),
      type: "timeline.selectKeyframe",
    },
  );

  const moved = run(selected, {
    anchorKeyframeId: idAt(selected, 0),
    timeSeconds: 2,
    type: "timeline.moveSelectedKeyframes",
  });

  // Both tracks shifted by the same two seconds; the unselected Spin keyframe
  // at 1 stayed exactly where it was.
  expect(times(moved)).toEqual([1, 2]);
  expect(times(moved, "device.scale")).toEqual([3]);
});

test("a stale selection cannot act", () => {
  // Ids name a time, so an id from before a move names nothing afterwards.
  // Setting a selection prunes what no longer exists rather than storing it.
  const state = withSpinAt(0, 1);
  const stale = run(state, {
    keyframeIds: [idAt(state, 0), "device.spin::99.00"],
    type: "timeline.setKeyframeSelection",
  });

  expect(stale.timeline.selectedKeyframeIds).toEqual([idAt(state, 0)]);
});
