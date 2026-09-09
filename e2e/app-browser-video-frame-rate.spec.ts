import { statSync } from "node:fs";

import { expect } from "@playwright/test";

import { getToolcraftControlFieldByTarget } from "./browser-control-target-helpers";
import { pickOption, typeSliderValue } from "./mockup-controls";
import { openTimeline, scrubToFraction } from "./mockup-timeline";
import { test } from "./toolcraft-product-test";

test.setTimeout(1_500_000);

/**
 * The rate the person chose has to be the rate in the file.
 *
 * Thirty was a literal in four places across three files — the schedule that
 * lays the frames out, the encoder that declares the rate, the bitrate formula
 * where it did not look like a rate at all, and the motion blur's idea of how
 * long a frame is — with nothing making them agree. `video-frame-rate.test.ts`
 * pins the arithmetic of each. What only a browser can show is whether the
 * whole chain carries one number end to end, because the only place that is
 * observable is the encoded file.
 *
 * And the failure it guards against is silent rather than loud. With the rate
 * taken out of the schedule — which is what this code was before — choosing
 * sixty still exports, still plays, and is still a second long; it just holds
 * thirty pictures. Half the smoothness that was asked for and paid for in
 * render time, with nothing anywhere to say so. So the two things measured are
 * the count and the length: twice the frames, same seconds.
 */
type EncodedVideoFacts = Readonly<{
  bytes: number;
  durationSeconds: number;
  frameCount: number;
  framesPerSecond: number;
}>;

/**
 * What is actually in the file, read by demuxing it.
 *
 * Not by trusting the container's declared frame rate, which is a hint a
 * player may ignore: `computePacketStats` counts the packets and derives the
 * rate from their own timestamps, so this is the file's real cadence rather
 * than its claim about itself.
 */
async function readEncodedVideo(path: string): Promise<EncodedVideoFacts> {
  const { ALL_FORMATS, FilePathSource, Input } = await import("mediabunny");
  const input = new Input({ formats: ALL_FORMATS, source: new FilePathSource(path) });

  try {
    const track = await input.getPrimaryVideoTrack();

    if (!track) {
      throw new Error(`No video track in the export at ${path}.`);
    }

    const stats = await track.computePacketStats();

    return {
      bytes: statSync(path).size,
      durationSeconds: await track.computeDuration(),
      frameCount: stats.packetCount,
      framesPerSecond: stats.averagePacketRate,
    };
  } finally {
    input.dispose();
  }
}

test("browser: sixty frames a second writes twice the frames and holds the loop's length", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForTimeout(8_000);

  // Software rendering is the cost here, not the encoder, so the job is made
  // small in every dimension that is not the one under test: canvas scale, and
  // a one-second loop. Thirty frames against sixty proves the coupling exactly
  // as well as a hundred and eighty against three hundred and sixty.
  await typeSliderValue(await getToolcraftControlFieldByTarget(page, "canvas.renderScale"), 1);
  await page.waitForTimeout(1_000);

  await openTimeline(page);

  const durationEdit = page.getByRole("button", { name: "Edit timeline duration" }).first();
  await durationEdit.click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("1");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1_500);

  // Something that moves, so the frames differ from one another and the count
  // is a count of pictures rather than of copies. Keyed by hand rather than by
  // preset, because what is being tested is the export and a hand-keyed turn
  // is the fixture with the fewest moving parts.
  const spin = await getToolcraftControlFieldByTarget(page, "device.spin");
  const clear = page.getByRole("button", { name: "Disable Spin keyframes" });

  if (await clear.count()) {
    await clear.first().click();
    await page.waitForTimeout(1_000);
  }

  await scrubToFraction(page, 0);
  await typeSliderValue(spin, 0);
  await page.getByRole("button", { name: "Add Spin keyframe" }).first().click();
  await page.waitForTimeout(1_500);
  await scrubToFraction(page, 0.95);
  await typeSliderValue(spin, 300);
  await page.waitForTimeout(1_500);

  const frameRate = await getToolcraftControlFieldByTarget(page, "export.video.frameRate");

  async function exportAt(option: "30 fps" | "60 fps"): Promise<EncodedVideoFacts> {
    await pickOption(frameRate, option);
    await page.waitForTimeout(800);

    const button = page.getByRole("button", { name: /^Export Video$/ }).first();
    await button.scrollIntoViewIfNeeded();
    const started = Date.now();
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 700_000 }),
      button.click(),
    ]);
    const path = await download.path();

    if (!path) {
      throw new Error(`The ${option} export produced no file.`);
    }

    const facts = await readEncodedVideo(path);
    console.log(
      `${option}: ${facts.frameCount} frames, ${facts.durationSeconds.toFixed(4)}s, ` +
        `${facts.framesPerSecond.toFixed(2)} fps, ${facts.bytes} bytes, ` +
        `took ${((Date.now() - started) / 1000).toFixed(0)}s`,
    );

    return facts;
  }

  const slow = await exportAt("30 fps");
  const fast = await exportAt("60 fps");

  // A one-second loop is thirty frames or sixty, and nothing in between. This
  // is the setting reaching the schedule at all: it has to travel from a
  // select, through the resolved export settings, into the frame schedule, and
  // a break anywhere along it leaves both files holding thirty. Verified by
  // making that break: with the rate dropped from the schedule call, the
  // sixty-frame export came back with thirty frames and this line caught it.
  expect(slow.frameCount, "a second at thirty").toBe(30);
  expect(fast.frameCount, "a second at sixty").toBe(60);
  expect(fast.frameCount).toBe(slow.frameCount * 2);

  // The other half of one rate: the frames have to be spaced by the same rate
  // that decided how many there are. A count from one rate with a spacing from
  // another is a loop that runs at half or double its length — the version of
  // this bug that would be visible, where the count alone is the version that
  // would not. Both files are the loop somebody built, and it is one second.
  expect(slow.durationSeconds, "thirty frames still last a second").toBeCloseTo(1, 2);
  expect(fast.durationSeconds, "sixty frames still last a second").toBeCloseTo(1, 2);

  // Read back from the packets' own timestamps rather than from the container's
  // declared rate, so this is the cadence a player would actually see.
  expect(slow.framesPerSecond, "the file's own rate at thirty").toBeCloseTo(30, 0);
  expect(fast.framesPerSecond, "the file's own rate at sixty").toBeCloseTo(60, 0);

  // Twice the pictures in the same second is more to write, which is the cost
  // the setting's description promises and the reason thirty is still offered.
  expect(
    fast.bytes,
    `Sixty frames of the same turn should not be smaller than thirty: ${fast.bytes} against ${slow.bytes}.`,
  ).toBeGreaterThan(slow.bytes);
});
