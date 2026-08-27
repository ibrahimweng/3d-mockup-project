import { describe, expect, test } from "vitest";

import {
  createToolcraftState,
  toolcraftReducer,
  type ToolcraftCommand,
  type ToolcraftState,
} from "@/toolcraft/runtime";
import {
  clampToolcraftTimelinePlaybackRate,
  toolcraftTimelinePlaybackRates,
} from "@/toolcraft/runtime/state/timeline-values";

import { appSchema } from "./app-schema";

/**
 * The transport: review speed, and the rule that it is a way of looking at the
 * work rather than a change to it.
 */
function run(state: ToolcraftState, ...commands: readonly ToolcraftCommand[]): ToolcraftState {
  return commands.reduce(toolcraftReducer, state);
}

const fresh = () => createToolcraftState(appSchema);

describe("playback speed", () => {
  test("a fresh timeline runs at real time", () => {
    expect(fresh().timeline.playbackRate).toBe(1);
  });

  test("the offered speeds are ordered and include real time", () => {
    expect([...toolcraftTimelinePlaybackRates]).toEqual(
      [...toolcraftTimelinePlaybackRates].sort((first, second) => first - second),
    );
    expect(toolcraftTimelinePlaybackRates).toContain(1);
  });

  test("a speed the transport does not offer snaps to the nearest one it does", () => {
    // A stored value from an older document, or a hand-edited one, cannot leave
    // the transport showing a speed it has no button for.
    expect(clampToolcraftTimelinePlaybackRate(3.5)).toBe(4);
    expect(clampToolcraftTimelinePlaybackRate(0.3)).toBe(0.25);
    // Exactly between two offered speeds settles on the slower one, which is
    // the safer way to be wrong: it shows less than real time rather than more.
    expect(clampToolcraftTimelinePlaybackRate(3)).toBe(2);
    expect(clampToolcraftTimelinePlaybackRate(Number.NaN)).toBe(1);
    expect(clampToolcraftTimelinePlaybackRate("fast")).toBe(1);
  });

  test("changing speed leaves the animation alone", () => {
    const before = run(fresh(), {
      controlId: "device.spin",
      controlLabel: "Spin",
      timeSeconds: 0,
      type: "timeline.toggleControlKeyframes",
      value: 0,
      valueLabel: "0",
    });
    const after = run(before, { playbackRate: 2, type: "timeline.setPlaybackRate" });

    expect(after.timeline.playbackRate).toBe(2);
    expect(after.timeline.durationSeconds).toBe(before.timeline.durationSeconds);
    expect(after.timeline.currentTimeSeconds).toBe(before.timeline.currentTimeSeconds);
    expect(after.timeline.keyframeGroups).toEqual(before.timeline.keyframeGroups);
  });

  test("changing speed is not something to undo", () => {
    // Undo steps through edits. Putting review speed in that history would make
    // a person press undo twice to take back the change they actually made.
    const keyed = run(fresh(), {
      controlId: "device.spin",
      controlLabel: "Spin",
      timeSeconds: 0,
      type: "timeline.toggleControlKeyframes",
      value: 0,
      valueLabel: "0",
    });
    const sped = run(keyed, { playbackRate: 4, type: "timeline.setPlaybackRate" });
    const undone = run(sped, { type: "history.undo" });

    expect(undone.timeline.keyframeGroups).toHaveLength(0);
  });
});
