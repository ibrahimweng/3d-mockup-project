import { expect } from "@playwright/test";

import { getToolcraftControlFieldByTarget } from "./browser-control-target-helpers";
import { readSlider } from "./mockup-controls";
import { openTimeline } from "./mockup-timeline";
import { test } from "./toolcraft-product-test";

test.setTimeout(600_000);

/**
 * A paste must not rewrite keyframes it was never pointed at.
 *
 * The arithmetic is pinned down in `src/app/timeline-paste-fit.test.ts`. What
 * only a browser can show is that this was reachable by pressing keys nobody
 * would think twice about — select all, copy, paste — and that when it happened
 * there was nothing to see. Every diamond stayed exactly where it was, because
 * only the values behind them had changed.
 *
 * So the proof is read where a person would read it: the control panel shows
 * the value at the playhead, so parking the playhead on the keyframe that used
 * to be overwritten and reading Zoom before and after the paste is the same
 * look somebody would take themselves.
 */
test("browser: pasting a copy longer than the loop leaves the rest of the animation alone", async ({
  page,
}) => {
  await page.goto("/");
  await openTimeline(page);

  // A move with a shape worth losing: the hero's camera breathe goes out to a
  // wider zoom halfway through the loop and comes back, so the middle keyframe
  // differs from both ends and a flattened track is obvious in one number.
  await page.locator('[data-motion-preset="hero"]').first().click();
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: /Add to timeline/ }).first().click();
  await page.waitForTimeout(3_000);

  const pause = page.getByRole("button", { name: "Pause playback" });
  if (await pause.count()) {
    await pause.first().click();
    await page.waitForTimeout(600);
  }

  const setTime = async (seconds: number): Promise<void> => {
    await page.getByRole("button", { name: "Edit current time" }).first().click();
    await page.waitForTimeout(300);
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type(String(seconds));
    await page.keyboard.press("Enter");
    await page.waitForTimeout(1_200);
  };
  const focusStrip = async (): Promise<void> => {
    await page.evaluate(() => {
      document
        .querySelector<HTMLElement>('[data-slot="timeline-expanded-scrubber"]')
        ?.focus();
    });
    await page.waitForTimeout(300);
  };
  const zoomAtPlayhead = async (): Promise<number> =>
    readSlider(await getToolcraftControlFieldByTarget(page, "camera.zoom"));

  // Shorten the loop, which this app allows on purpose: the keyframes past the
  // new end stay where they are and are counted at the right of their row.
  await page.getByRole("button", { name: "Edit timeline duration" }).first().click();
  await page.waitForTimeout(300);
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("3");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(2_000);

  await expect(
    page.locator('[data-slot="timeline-keyframes-past-end"]').first(),
    "Shortening the loop should strand keyframes past its end and say so.",
  ).toBeVisible();

  // The value about to be overwritten, read at the loop's new end.
  await setTime(3);
  const before = await zoomAtPlayhead();

  expect(before, "the top of the breathe is a wider zoom than either end").toBeGreaterThan(
    100,
  );

  const diamondsBefore = await page
    .locator('[data-slot="timeline-keyframe"]')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("aria-label")));

  // Select all, copy, paste -- three ordinary presses. The copy now spans six
  // seconds and the loop is three, so there is no start at which it fits.
  await focusStrip();
  await page.keyboard.press("ControlOrMeta+a");
  await page.waitForTimeout(600);
  await page.keyboard.press("ControlOrMeta+c");
  await page.waitForTimeout(600);
  await setTime(1);
  await focusStrip();
  await page.keyboard.press("ControlOrMeta+v");
  await page.waitForTimeout(2_000);

  await setTime(3);
  const after = await zoomAtPlayhead();

  expect(
    after,
    `The keyframe at the loop's end was not part of what the paste was asked to place, so it must still hold ${before}. It read ${after}, which is what an overhanging keyframe clamped onto the last frame does.`,
  ).toBe(before);

  // And the paste did place what fits, so this is not passing by refusing to
  // paste at all.
  const diamondsAfter = await page
    .locator('[data-slot="timeline-keyframe"]')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("aria-label")));

  expect(
    diamondsAfter.length,
    "the head of the copy is placed at the playhead, inside the loop",
  ).toBeGreaterThan(diamondsBefore.length);
  expect(diamondsAfter, "starting where it was asked to").toContain(
    "Zoom keyframe at 1.00s",
  );
});
