import { expect, test } from "vitest";

import {
  createToolcraftState,
  evaluateToolcraftTimelineValue,
  toolcraftReducer,
  type ToolcraftCommand,
  type ToolcraftState,
} from "@/toolcraft/runtime";

import { appSchema } from "./app-schema";
import { getMotionPresetCommand } from "./apply-motion-preset";

/**
 * What happens to an animation when the loop it was built for changes length.
 *
 * Found by driving the built app: apply a move, shorten the loop, and the
 * animation quietly stops closing. Half of it is now past the end, nothing is
 * drawn there, and the seam jumps once a cycle with nothing on screen to say
 * why. In an editor with no opinion about looping that would be ordinary; here
 * every move ends on the frame it began on, and losing that silently is the
 * defect.
 *
 * Nothing is destroyed, which is the part worth keeping: the keyframes are
 * still in state and lengthening the loop brings them all back. So the fix is
 * to say so rather than to move anybody's keyframes, and these are the facts
 * that fix rests on.
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

const timesOf = (state: ToolcraftState, controlId: string) =>
  state.timeline.keyframeGroups
    .find((group) => group.controlId === controlId)
    ?.keyframes.map((keyframe) => keyframe.timeSeconds) ?? [];

test("shortening the loop keeps every keyframe, and lengthening it brings them back", () => {
  // The behaviour the marker describes. `timeline.setDuration` deliberately
  // does not touch keyframes, so this is non-destructive in the way After
  // Effects is — and the marker would be a lie if it were not.
  const full = withHero();
  const before = timesOf(full, "device.spin");

  expect(before.length).toBeGreaterThan(2);
  expect(Math.max(...before)).toBe(6);

  const short = run(full, { durationSeconds: 3, type: "timeline.setDuration" });

  expect(timesOf(short, "device.spin"), "nothing is dropped by shortening").toEqual(before);

  const long = run(short, { durationSeconds: 6, type: "timeline.setDuration" });
  expect(timesOf(long, "device.spin"), "and nothing is lost on the way back").toEqual(before);
});

test("a shortened loop no longer closes, which is what has to be visible", () => {
  // Measured rather than asserted: at the new end the track is mid-move, so
  // the value there is not the value it starts on. That gap is the hitch, and
  // before the marker existed there was nothing anywhere that showed it.
  const short = run(withHero(), { durationSeconds: 3, type: "timeline.setDuration" });
  const atStart = evaluateToolcraftTimelineValue(short, "device.spin", 0) as number;
  const atEnd = evaluateToolcraftTimelineValue(short, "device.spin", 3) as number;

  expect(
    Math.abs(((atEnd - atStart) % 360) + 360) % 360,
    "a loop that closes ends on the angle it began on, or a whole turn from it",
  ).toBeGreaterThan(1);

  // How many keyframes are unreachable is the number the row has to report.
  const stranded = timesOf(short, "device.spin").filter((time) => time > 3);
  expect(stranded.length).toBeGreaterThan(0);
});

test("re-applying the move at the new length closes the loop again", () => {
  // The remedy, and the reason the marker points at the loop's length rather
  // than at the keyframes: a preset is written in fractions, so it is right at
  // whatever length it is asked for.
  const short = run(withHero(), { durationSeconds: 3, type: "timeline.setDuration" });
  const command = getMotionPresetCommand(short, "hero");
  const refitted = command ? run(short, command) : short;
  const times = timesOf(refitted, "device.spin");

  expect(Math.min(...times)).toBe(0);
  expect(Math.max(...times), "the move now ends on the loop's own last frame").toBe(3);
  expect(
    times.filter((time) => time > 3).length,
    "and nothing is left stranded past it",
  ).toBe(0);

  const atStart = evaluateToolcraftTimelineValue(refitted, "device.spin", 0) as number;
  const atEnd = evaluateToolcraftTimelineValue(refitted, "device.spin", 3) as number;
  expect(Math.abs(((atEnd - atStart) % 360) + 360) % 360).toBeCloseTo(0, 6);
});
