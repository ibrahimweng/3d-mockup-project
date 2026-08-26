import { describe, expect, test } from "vitest";

import {
  createToolcraftState,
  evaluateToolcraftTimelineValue,
  getToolcraftTimelineLoopTime,
  toolcraftReducer,
  type ToolcraftCommand,
  type ToolcraftState,
} from "@/toolcraft/runtime";

import { appSchema } from "./app-schema";
import { readRasterSettings } from "./render/settings";

/**
 * The timeline, driven through the real reducer against this product's own
 * schema. What a frame *looks* like at a given time is proven in the browser;
 * what it is *made of* is decided here, and that is what this checks.
 */
function run(state: ToolcraftState, ...commands: readonly ToolcraftCommand[]): ToolcraftState {
  return commands.reduce(toolcraftReducer, state);
}

const fresh = () => createToolcraftState(appSchema);

/**
 * The turntable this product exists to make, laid down exactly the way the
 * preset lays it: a full revolution over the loop, at one speed.
 */
function keyedTurn(state: ToolcraftState): ToolcraftState {
  const duration = state.timeline.durationSeconds;
  const track = (appSchema.panels.timeline?.animations ?? [])[0]?.tracks[0];
  if (!track) throw new Error("the product declares no turntable preset");

  let next = run(
    state,
    {
      controlId: track.target,
      controlLabel: track.controlLabel,
      timeSeconds: 0,
      type: "timeline.toggleControlKeyframes",
      value: track.from,
      valueLabel: String(track.from),
    },
    {
      controlId: track.target,
      controlLabel: track.controlLabel,
      timeSeconds: duration,
      type: "timeline.upsertControlKeyframe",
      value: track.to,
      valueLabel: String(track.to),
    },
  );
  if (track.easing) {
    next = run(next, {
      easing: track.easing,
      keyframeId: `${track.target}::0`,
      type: "timeline.changeKeyframeEasing",
    });
  }
  return next;
}

test("timeline playback scrubs, pauses, loops and redraws", () => {
  let state = keyedTurn(fresh());
  const duration = state.timeline.durationSeconds;
  expect(duration).toBeGreaterThan(0);

  // The transport opens ready to run, which is what it means for a timeline to
  // be live. It simply has nothing to do until something is keyed — the clock
  // itself stands down while no control has keyframes, which is what stops an
  // empty loop redrawing a picture that never changes.
  expect(fresh().timeline.isPlaying).toBe(true);

  // Playing runs it; pausing stops it where it stands rather than rewinding.
  state = run(state, { isPlaying: true, type: "timeline.setPlaying" });
  expect(state.timeline.isPlaying).toBe(true);
  state = run(state, { currentTimeSeconds: duration / 2, type: "timeline.setCurrentTime" });
  state = run(state, { type: "timeline.togglePlayback" });
  expect(state.timeline.isPlaying).toBe(false);
  expect(state.timeline.currentTimeSeconds).toBeCloseTo(duration / 2, 10);

  // Resuming carries on from there instead of restarting.
  state = run(state, { type: "timeline.togglePlayback" });
  expect(state.timeline.isPlaying).toBe(true);
  expect(state.timeline.currentTimeSeconds).toBeCloseTo(duration / 2, 10);

  // Scrubbing to a time draws that time: the value the renderer reads is the
  // keyframes evaluated there, not the value the control was last left at.
  //
  // And a turntable turns at one speed. The editor's default easing is a
  // strong ease-in-out, which would put a quarter of the loop at 25 degrees
  // rather than 90 and bring the device to a dead stop at each end of the
  // revolution — visible as a stutter every time the loop came round. The
  // preset declares itself linear so that a quarter of the time really is a
  // quarter of the turn.
  for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
    expect(
      evaluateToolcraftTimelineValue(state, "device.spin", duration * fraction),
      `at ${fraction} of the loop`,
    ).toBeCloseTo(360 * fraction, 3);
  }

  // Editing the duration changes how long the loop takes without changing the
  // animation: the end of the loop is still a full turn.
  state = run(state, { durationSeconds: duration * 2, type: "timeline.setDuration" });
  expect(state.timeline.durationSeconds).toBe(duration * 2);
  expect(evaluateToolcraftTimelineValue(state, "device.spin", duration)).toBeCloseTo(360, 3);

  // The loop only ever runs forward, and the frame it ends on is the frame it
  // began on — which is what makes a turntable seamless.
  expect(getToolcraftTimelineLoopTime({ currentTimeSeconds: 0, durationSeconds: duration })).toBe(0);
  expect(
    getToolcraftTimelineLoopTime({ currentTimeSeconds: duration, durationSeconds: duration }),
  ).toBe(0);
  expect(
    getToolcraftTimelineLoopTime({ currentTimeSeconds: duration * 1.25, durationSeconds: duration }),
  ).toBeCloseTo(duration * 0.25, 10);
});

test("keyframes edit and the renderer evaluates them", () => {
  let state = keyedTurn(fresh());

  // Keyframing gives the control a row with a diamond at each keyed time.
  const group = state.timeline.keyframeGroups.find((item) => item.controlId === "device.spin");
  expect(group).toBeDefined();
  expect(group!.keyframes).toHaveLength(2);

  // Editing at a keyed time updates that keyframe rather than adding another.
  state = run(state, {
    controlId: "device.spin",
    controlLabel: "Spin",
    timeSeconds: state.timeline.durationSeconds,
    type: "timeline.upsertControlKeyframe",
    value: 180,
    valueLabel: "180",
  });
  const edited = state.timeline.keyframeGroups.find((item) => item.controlId === "device.spin");
  expect(edited!.keyframes).toHaveLength(2);
  expect(
    evaluateToolcraftTimelineValue(state, "device.spin", state.timeline.durationSeconds),
  ).toBeCloseTo(180, 6);

  // The renderer reads the evaluated value, not the control's own. This is the
  // join that makes an animation visible at all: settings read at a time have
  // to carry that time's spin.
  const atMidpoint = readRasterSettings({
    ...state.values,
    "device.spin": evaluateToolcraftTimelineValue(
      state,
      "device.spin",
      state.timeline.durationSeconds / 2,
    ),
  });
  expect(atMidpoint.spin).toBeCloseTo(90, 6);

  // A control with no keyframes evaluates to whatever it is set to, so keying
  // one property does not freeze the others.
  expect(evaluateToolcraftTimelineValue(state, "device.tilt", 1)).toBe(state.values["device.tilt"]);

  // Clearing a control's keyframes removes its row entirely.
  state = run(state, { controlId: "device.spin", type: "timeline.deleteControlKeyframes" });
  expect(
    state.timeline.keyframeGroups.find((item) => item.controlId === "device.spin"),
  ).toBeUndefined();
});

describe("the product declares a timeline at all", () => {
  test("keyframes are the mode, and the turntable preset keys the spin", () => {
    const timeline = appSchema.panels.timeline;
    expect(timeline?.enabled).toBe(true);
    expect(timeline?.mode).toBe("keyframes");
    expect(timeline?.defaultDurationSeconds).toBeGreaterThan(0);

    const turntable = (timeline?.animations ?? []).find((entry) => entry.id === "turntable");
    expect(turntable).toBeDefined();
    expect(turntable!.tracks).toEqual([
      {
        controlLabel: "Spin",
        // Linear. A looping turn that inherits the editor's ease-in-out stops
        // dead at each end of the revolution.
        easing: { controlPoints: [0, 0, 1, 1], type: "bezier" },
        from: 0,
        target: "device.spin",
        to: 360,
      },
    ]);
  });
});
