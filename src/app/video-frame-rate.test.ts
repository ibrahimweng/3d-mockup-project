import { expect, test } from "vitest";

import {
  createToolcraftVideoFrameSchedule,
  getToolcraftVideoExportBitrate,
  resolveToolcraftVideoExportSettings,
  TOOLCRAFT_VIDEO_EXPORT_FRAMES_PER_SECOND,
} from "@/toolcraft/runtime/export";
import { createToolcraftState, toolcraftReducer } from "@/toolcraft/runtime";

import { appSchema } from "./app-schema";

/**
 * How many frames a second of video is cut into.
 *
 * It was thirty, everywhere, as a literal — in the schedule that lays the
 * frames out, in the encoder that declares the rate, in the bitrate formula
 * where it did not look like a rate at all, and in the motion blur's idea of
 * how long a frame is. Four copies of one number in three files, with nothing
 * making them agree.
 *
 * These are the tests that they agree now, and the reason it matters is not
 * tidiness: a file whose frames were laid out at one rate and declared at
 * another plays at the wrong speed, which looks like a badly built animation
 * rather than like a bad setting.
 */
const withFrameRate = (rate: string) =>
  toolcraftReducer(createToolcraftState(appSchema), {
    target: "export.video.frameRate",
    type: "controls.setValue",
    value: rate,
  });

/**
 * A value the control could not have produced, put where a restored workspace
 * would put it.
 *
 * Not through `controls.setValue`, because the reducer normalizes against the
 * select's own options and simply refuses anything else — which is worth
 * knowing, and is why this is the only door a bad rate can come through.
 */
const withStoredFrameRate = (rate: unknown) => {
  const state = createToolcraftState(appSchema);

  return { ...state, values: { ...state.values, "export.video.frameRate": rate } };
};

test("the schedule lays out as many frames as the rate asks for", () => {
  for (const [framesPerSecond, expected] of [
    [30, 180],
    [60, 360],
  ] as const) {
    const schedule = createToolcraftVideoFrameSchedule(6, framesPerSecond);

    expect(schedule, `${framesPerSecond} fps over six seconds`).toHaveLength(expected);
    expect(schedule[0]!.timeSeconds).toBe(0);
    // Every frame stands for its own slice, and the slices tile the loop
    // exactly: the last one ends on the duration rather than past it.
    const last = schedule[schedule.length - 1]!;
    expect(last.timeSeconds + last.durationSeconds).toBeCloseTo(6, 12);
    expect(
      schedule.reduce((total, entry) => total + entry.durationSeconds, 0),
    ).toBeCloseTo(6, 9);
  }
});

test("the frames of a faster rate sit between the frames of a slower one", () => {
  // Which is what makes sixty smoother rather than merely different: it is the
  // same moments with more of them, not a different sampling of the loop.
  const slow = createToolcraftVideoFrameSchedule(6, 30).map((entry) => entry.timeSeconds);
  const fast = createToolcraftVideoFrameSchedule(6, 60).map((entry) => entry.timeSeconds);

  for (const time of slow) {
    expect(
      fast.some((candidate) => Math.abs(candidate - time) < 1e-9),
      `${time}s is in both`,
    ).toBe(true);
  }
});

test("a rate that could not be encoded is refused rather than divided by", () => {
  for (const bad of [0, -30, Number.NaN, Number.POSITIVE_INFINITY]) {
    expect(() => createToolcraftVideoFrameSchedule(6, bad), String(bad)).toThrow(RangeError);
  }

  // And the default is still what this runtime always encoded at, so a caller
  // that does not care gets what it always got.
  expect(TOOLCRAFT_VIDEO_EXPORT_FRAMES_PER_SECOND).toBe(30);
  expect(createToolcraftVideoFrameSchedule(6)).toHaveLength(180);
});

test("the bitrate follows the rate, so twice the frames are not half the picture", () => {
  // The `30` in this formula never looked like a frame rate, which is exactly
  // why it would have been left behind: every sixty-frame export would have
  // carried a thirty-frame budget and come out softer than the file it
  // replaced, with nothing to say why.
  //
  // A size where neither clamp is in the way, so the arithmetic is the thing
  // being tested rather than the floor.
  const wide = { height: 1080, width: 1920 };
  const at = (rate?: number) => getToolcraftVideoExportBitrate(wide.width, wide.height, rate);

  // More, because the extra frames have to be written. Not double, because
  // they are half as far apart and mostly the difference from the last one.
  expect(at(60)).toBeGreaterThan(at(30));
  expect(at(60)).toBeLessThan(at(30) * 2);
  expect(at(60)).toBe(at(30) * 1.5);

  // Thirty is untouched: an export nobody re-configured is the export it was.
  expect(at(30)).toBe(3_110_400);
  expect(at()).toBe(at(30));

  // Both ends still clamp: a tiny canvas is not starved, and a 4K sixty-frame
  // export is what the ceiling exists for.
  expect(getToolcraftVideoExportBitrate(64, 64, 60)).toBe(2_000_000);
  expect(getToolcraftVideoExportBitrate(3840, 2160, 60)).toBe(12_000_000);
});

test("the export resolves the rate the person chose", () => {
  // Sixty by default, because thirty is where a slow move stops travelling and
  // starts stepping, and a default nobody changes is the one that matters.
  expect(resolveToolcraftVideoExportSettings(createToolcraftState(appSchema)).frameRate).toBe(60);
  expect(resolveToolcraftVideoExportSettings(withFrameRate("30")).frameRate).toBe(30);
  expect(resolveToolcraftVideoExportSettings(withFrameRate("60")).frameRate).toBe(60);
});

test("a rate no option could have produced stops the export rather than guessing", () => {
  // A stored workspace is the one place this can arrive wrong, and rounding it
  // would produce a file that runs at the wrong speed. Refusing names the
  // setting instead.
  for (const bad of ["24", "120", "fast", 0, {}]) {
    expect(
      () => resolveToolcraftVideoExportSettings(withStoredFrameRate(bad)),
      JSON.stringify(bad) ?? "undefined",
    ).toThrow(/export\.video\.frameRate/);
  }

  // A workspace saved before this setting existed holds nothing here, and
  // nothing is not a wrong answer — it is the same absence the default is for.
  // Every setting in this runtime reads that way, and a sixty-frame export is
  // the right thing to give a file that predates the choice.
  for (const missing of [undefined, null]) {
    expect(
      resolveToolcraftVideoExportSettings(withStoredFrameRate(missing)).frameRate,
      JSON.stringify(missing) ?? "undefined",
    ).toBe(60);
  }

  // The picker itself cannot produce one: the reducer normalizes a select
  // against its own options, so this is refused before it reaches the export.
  expect(withFrameRate("24").values["export.video.frameRate"]).toBe("60");
});
