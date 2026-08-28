import { expect, test, type Page } from "@playwright/test";

import { openTimeline, scrubToFraction } from "./mockup-timeline";
import { getToolcraftControlFieldByTarget } from "./browser-control-target-helpers";
import { typeSliderValue } from "./mockup-controls";

const readCam = (page: Page) =>
  page.evaluate(() => JSON.stringify((globalThis as unknown as { __cam?: unknown }).__cam ?? null));

test("is the camera identical across the seam", async ({ page }) => {
  test.setTimeout(420_000);
  await page.goto("/");
  await openTimeline(page);

  const spin = await getToolcraftControlFieldByTarget(page, "device.spin");
  await scrubToFraction(page, 0);
  await typeSliderValue(spin, 0);
  await page.getByRole("button", { name: "Add Spin keyframe" }).first().click();
  await page.waitForTimeout(1_500);
  await scrubToFraction(page, 0.99);
  await typeSliderValue(spin, 360);
  await page.waitForTimeout(2_000);

  await scrubToFraction(page, 0.02);
  await page.waitForTimeout(2_000);
  const before = await readCam(page);

  for (const fraction of [0.2, 0.4, 0.6, 0.8, 0.95]) {
    await scrubToFraction(page, fraction);
    await page.waitForTimeout(700);
  }
  await scrubToFraction(page, 0.02);
  await page.waitForTimeout(2_000);
  const after = await readCam(page);

  console.log("CAMERA IDENTICAL:", before === after);
  if (before !== after) {
    const a = JSON.parse(before!) as Record<string, unknown>;
    const b = JSON.parse(after!) as Record<string, unknown>;
    for (const key of Object.keys(a)) {
      const one = JSON.stringify(a[key]);
      const two = JSON.stringify(b[key]);
      if (one !== two) console.log(`CAM DIFF ${key}:`, one, "->", two);
    }
  } else {
    console.log("CAMERA SAMPLE:", before?.slice(0, 220));
  }
  expect(true).toBe(true);
});
