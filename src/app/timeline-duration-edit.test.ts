import { expect, test } from "vitest";

import {
  clampToolcraftTimelineDurationSeconds,
  createToolcraftState,
  toolcraftReducer,
  type ToolcraftCommand,
  type ToolcraftState,
} from "@/toolcraft/runtime";

import { appSchema } from "./app-schema";
import { getMotionPresetCommand } from "./apply-motion-preset";

/**
 * What an unreadable duration does to a loop.
 *
 * Found by driving the built app: type anything into the duration field that
 * does not begin with a digit — "twenty", a stray letter, a space — and the
 * loop did not refuse the edit. It became eight seconds, which is the runtime's
 * own default and not even this app's default of six. On a twenty-second loop
 * that stranded more than half the animation past the new end, where nothing is
 * drawn and nothing plays.
 *
 * The panel's own current-time field, twelve lines above the duration one, had
 * always done the right thing with the same problem. These are the tests that
 * both ends now agree: an edit that cannot be read is not an edit.
 */
function run(state: ToolcraftState, ...commands: readonly ToolcraftCommand[]): ToolcraftState {
  return commands.reduce(toolcraftReducer, state);
}

function withHeroOver(durationSeconds: number): ToolcraftState {
  const sized = run(createToolcraftState(appSchema), {
    durationSeconds,
    type: "timeline.setDuration",
  });
  const command = getMotionPresetCommand(sized, "hero");

  if (!command) {
    throw new Error("The default product has no hero to lay down.");
  }

  return run(sized, command);
}

const spinTimes = (state: ToolcraftState) =>
  state.timeline.keyframeGroups
    .find((group) => group.controlId === "device.spin")
    ?.keyframes.map((keyframe) => keyframe.timeSeconds) ?? [];

test("a duration that cannot be read leaves the loop the length it was", () => {
  // The command the panel would send if it still pre-clamped a failed parse.
  // Nothing about the timeline may move, because nothing was asked for.
  const state = withHeroOver(20);

  expect(state.timeline.durationSeconds).toBe(20);

  for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    const after = run(state, { durationSeconds: bad, type: "timeline.setDuration" });

    expect(after.timeline.durationSeconds, String(bad)).toBe(20);
    expect(spinTimes(after), `${bad} strands nothing`).toEqual(spinTimes(state));
  }
});

test("the fallback is the loop's own length, not the shortest one allowed", () => {
  // It used to be the minimum, which answered an unreadable command with the
  // largest possible change: a twenty-second move in a one-second loop.
  const state = withHeroOver(20);
  const after = run(state, {
    durationSeconds: Number.NaN,
    type: "timeline.setDuration",
  });

  expect(after.timeline.durationSeconds).not.toBe(1);
  expect(after.timeline.durationSeconds).toBe(20);
});

test("a duration that can be read is still clamped at both ends", () => {
  // The half that has to keep working: a real number is honoured, and one out
  // of range is brought into it rather than refused.
  const state = withHeroOver(6);

  for (const [asked, expected] of [
    [12, 12],
    [0.1, 1],
    [-4, 1],
    [1000, 60],
  ] as const) {
    const after = run(state, { durationSeconds: asked, type: "timeline.setDuration" });

    expect(after.timeline.durationSeconds, `${asked} seconds`).toBe(expected);
  }
});

test("shortening still strands rather than deletes, which is the behaviour being protected", () => {
  // The reason an accidental shortening matters at all. This is Iteration 18's
  // promise and it is unchanged: the keyframes stay, and lengthening the loop
  // reaches them again.
  const state = withHeroOver(20);
  const short = run(state, { durationSeconds: 8, type: "timeline.setDuration" });

  expect(spinTimes(short), "nothing is deleted by shortening").toEqual(spinTimes(state));
  expect(
    spinTimes(short).filter((time) => time > 8).length,
    "and more than one keyframe is now past the end",
  ).toBeGreaterThan(1);
});

test("the clamp still defaults for a caller that has no length to keep", () => {
  // Resolving a schema that does not name a duration is the one caller that
  // wants the runtime's default, and it still gets it.
  expect(clampToolcraftTimelineDurationSeconds(Number.NaN)).toBe(8);
  expect(clampToolcraftTimelineDurationSeconds("nonsense")).toBe(8);
  // And an explicit fallback wins, which is what the reducer now passes.
  expect(clampToolcraftTimelineDurationSeconds(Number.NaN, 20)).toBe(20);
});
