import { expect, test } from "vitest";

import {
  createToolcraftState,
  toolcraftReducer,
  type ToolcraftCommand,
  type ToolcraftState,
  type ToolcraftTimelineClipboardKeyframe,
} from "@/toolcraft/runtime";

import { appSchema } from "./app-schema";
import { getMotionPresetCommand } from "./apply-motion-preset";

/**
 * Where a pasted copy goes when it does not fit.
 *
 * Found by driving the built app. Shorten a loop — which this app deliberately
 * allows, leaving the stranded keyframes in place with a marker counting them —
 * then select all, copy, and paste. Nothing appeared to happen: every diamond
 * stayed exactly where it was. What had happened was that the copy was longer
 * than the loop, so every keyframe past the end clamped onto the loop's last
 * frame, each overwriting the one before, and the final one silently replaced
 * whatever was already there. Spin's midpoint went from 180 to 360 and the
 * camera's whole breathe — 100 to 114 and back — was flattened to 100, with the
 * timeline looking untouched because only the values had changed.
 *
 * The shift that was supposed to prevent this only works while the copy is
 * shorter than the loop. These are the tests that it now holds either way, and
 * that the case it already handled is unchanged.
 */
function run(state: ToolcraftState, ...commands: readonly ToolcraftCommand[]): ToolcraftState {
  return commands.reduce(toolcraftReducer, state);
}

function withHero(): ToolcraftState {
  const state = createToolcraftState(appSchema);
  const command = getMotionPresetCommand(state, "hero");

  if (!command) {
    throw new Error("The default product has no hero to lay down.");
  }

  return run(state, command);
}

const trackOf = (state: ToolcraftState, controlId: string) =>
  state.timeline.keyframeGroups.find((group) => group.controlId === controlId);

const timesOf = (state: ToolcraftState, controlId: string) =>
  trackOf(state, controlId)?.keyframes.map((keyframe) => keyframe.timeSeconds) ?? [];

const valuesOf = (state: ToolcraftState, controlId: string) =>
  trackOf(state, controlId)?.keyframes.map((keyframe) => keyframe.value) ?? [];

/**
 * The clipboard the panel would have built from a selection.
 *
 * Offsets are measured from the earliest keyframe copied, which is what makes a
 * paste keep the shape of what was taken rather than stacking it all on one
 * time.
 */
function copyOf(
  state: ToolcraftState,
  controlIds: readonly string[],
): readonly ToolcraftTimelineClipboardKeyframe[] {
  const taken = controlIds.flatMap((controlId) => trackOf(state, controlId)?.keyframes ?? []);
  const earliest = Math.min(...taken.map((keyframe) => keyframe.timeSeconds));

  return taken.map((keyframe) => ({
    controlId: keyframe.controlId,
    controlLabel: keyframe.controlLabel,
    ...(keyframe.easing ? { easing: keyframe.easing } : {}),
    offsetSeconds: Math.round((keyframe.timeSeconds - earliest) * 100) / 100,
    value: keyframe.value,
    valueLabel: keyframe.valueLabel,
  }));
}

const paste = (
  keyframes: readonly ToolcraftTimelineClipboardKeyframe[],
  timeSeconds: number,
): ToolcraftCommand => ({ keyframes, timeSeconds, type: "timeline.pasteKeyframes" });

test("a copy that fits lands where the playhead is", () => {
  // The ordinary case, and the one everything else is measured against.
  const state = withHero();
  const spin = trackOf(state, "device.spin")!.keyframes;
  const copied: readonly ToolcraftTimelineClipboardKeyframe[] = [
    {
      controlId: "device.spin",
      controlLabel: spin[0]!.controlLabel,
      offsetSeconds: 0,
      value: spin[0]!.value,
      valueLabel: spin[0]!.valueLabel,
    },
  ];

  const pasted = run(state, paste(copied, 4.5));

  expect(timesOf(pasted, "device.spin")).toContain(4.5);
});

test("a copy that would overhang the end is pulled back so all of it survives", () => {
  // The decision this code already made, kept: losing the tail of a pasted move
  // is worse than starting it earlier than asked. A two-second copy pasted at
  // five seconds of a six-second loop starts at four, not five, and both ends
  // of it are still there.
  const state = withHero();
  const copied = copyOf(state, ["camera.zoom"]).filter(
    (keyframe) => keyframe.offsetSeconds <= 3,
  );

  expect(Math.max(...copied.map((k) => k.offsetSeconds)), "a three-second copy").toBe(3);

  const pasted = run(state, paste(copied, 5));
  const times = timesOf(pasted, "camera.zoom");

  // Pulled back to three, so the tail lands exactly on the loop's end.
  expect(times, "the head is placed earlier than asked").toContain(3);
  expect(times, "and the tail still fits").toContain(6);
  expect(times.length, "nothing is dropped when a shift can make it fit").toBe(3);
});

test("a copy longer than the loop places what fits and drops the rest", () => {
  // The fault. There is no start at which a six-second copy fits a three-second
  // loop, so pulling it back achieved nothing except to ignore the playhead,
  // and every keyframe past the end then clamped onto the last frame.
  const short = run(withHero(), { durationSeconds: 3, type: "timeline.setDuration" });
  const copied = copyOf(short, ["device.spin"]);

  expect(Math.max(...copied.map((k) => k.offsetSeconds)), "a six-second copy").toBe(6);
  expect(short.timeline.durationSeconds, "into a three-second loop").toBe(3);

  const pasted = run(short, paste(copied, 1));
  const times = timesOf(pasted, "device.spin");

  // Anchored at the playhead, because no earlier start would have helped.
  expect(times, "the head goes where it was asked to").toContain(1);
  expect(times, "and so does what follows it inside the loop").toContain(1.72);
  // And nothing is stacked on the loop's end. Offsets 3, 3.72 and 6 would have
  // landed at 4, 4.72 and 7 -- all outside the loop, so none of them is placed.
  expect(times.filter((time) => time > 3), "nothing lands past the end").toEqual([3.72, 6]);
  expect(
    times.filter((time) => time === 3).length,
    "and nothing is stacked on the last frame",
  ).toBe(1);
});

test("pasting into a shortened loop leaves the keyframes it was not asked to touch alone", () => {
  // Stated as the damage rather than as the mechanism, because this is what was
  // actually lost: the camera's breathe, silently, with every diamond still
  // exactly where it had been.
  const short = run(withHero(), { durationSeconds: 3, type: "timeline.setDuration" });
  const before = { spin: valuesOf(short, "device.spin"), zoom: valuesOf(short, "camera.zoom") };

  expect(before.zoom, "the breathe goes out and comes back").toEqual([100, 114, 100]);

  const pasted = run(short, paste(copyOf(short, ["device.spin", "camera.zoom"]), 1));

  for (const [controlId, was] of [
    ["device.spin", before.spin],
    ["camera.zoom", before.zoom],
  ] as const) {
    const kept = trackOf(pasted, controlId)!
      .keyframes.filter((keyframe) => keyframe.timeSeconds >= 3)
      .map((keyframe) => keyframe.value);

    expect(kept, `${controlId} past the loop's end is untouched`).toEqual(
      was.slice(was.length - kept.length),
    );
  }
  // Specifically the value that used to be overwritten: the top of the breathe.
  expect(valuesOf(pasted, "camera.zoom"), "the breathe survives").toContain(114);
});

test("a paste that changes nothing is not an edit", () => {
  // A copy as long as the loop can only ever land back on itself, so pressing
  // paste did nothing -- and still spent an undo step doing it. Three presses
  // left three entries to peel off before reaching the last real change.
  const state = withHero();
  const copied = copyOf(state, ["device.spin", "camera.zoom"]);
  const depth = state.history.undo.length;

  const pasted = run(state, paste(copied, 2), paste(copied, 2), paste(copied, 2));

  expect(timesOf(pasted, "device.spin"), "nothing moved").toEqual(
    timesOf(state, "device.spin"),
  );
  expect(pasted.history.undo.length, "and nothing was spent").toBe(depth);
});

test("a paste that changes something is still an edit", () => {
  // The other half, so the guard above cannot be satisfied by refusing every
  // paste.
  const state = withHero();
  const spin = trackOf(state, "device.spin")!.keyframes;
  const copied: readonly ToolcraftTimelineClipboardKeyframe[] = [
    {
      controlId: "device.spin",
      controlLabel: spin[0]!.controlLabel,
      offsetSeconds: 0,
      value: spin[0]!.value,
      valueLabel: spin[0]!.valueLabel,
    },
  ];
  const depth = state.history.undo.length;

  const pasted = run(state, paste(copied, 4.5));

  expect(timesOf(pasted, "device.spin")).toContain(4.5);
  expect(pasted.history.undo.length, "one press, one entry").toBe(depth + 1);
});
