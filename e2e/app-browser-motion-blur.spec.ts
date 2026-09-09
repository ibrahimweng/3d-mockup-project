import type { Download, Page } from "@playwright/test";

import { expect, test } from "./toolcraft-product-test";
import { getToolcraftControlFieldByTarget } from "./browser-control-target-helpers";
import { pickOption, typeSliderValue } from "./mockup-controls";
import { openTimeline, scrubToFraction } from "./mockup-timeline";

test.setTimeout(900_000);

/**
 * A frame that covers the time it stands for.
 *
 * The arithmetic — where the samples sit, how they are weighted so they average
 * rather than trail — is pinned down in `motion-blur.test.ts`. What only a
 * browser can show is whether any of it reaches the file: motion blur changes
 * nothing about the preview, so the exported artifact is the only place the
 * feature is visible at all.
 *
 * Measured as edge sharpness rather than by comparing pixels. Two exports of a
 * turning product are different pictures whether or not anything is blurred, so
 * "they differ" proves nothing. What blur does is specific and measurable: it
 * spreads each edge over more pixels, which lowers the mean gradient across the
 * image. A sharp frame and a blurred one of the same instant differ in that
 * number in one direction only.
 */
async function exportPng(page: Page): Promise<Download> {
  const button = page.getByRole("button", { name: /^Export PNG$/ }).first();
  await button.scrollIntoViewIfNeeded();
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 600_000 }),
    button.click(),
  ]);
  return download;
}

/**
 * The mean absolute luminance step between neighbouring pixels.
 *
 * High where edges are crisp, low where they are smeared. Sampled on a grid
 * rather than over every pixel because a 2K export is four million of them and
 * the statistic converges long before that.
 */
async function measureSharpness(page: Page, download: Download): Promise<number> {
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];

  for await (const chunk of stream) {
    chunks.push(chunk as Buffer);
  }

  return page.evaluate(async (data) => {
    const blob = await (await fetch(`data:image/png;base64,${data}`)).blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("No 2D context to measure the export in.");
    }

    context.drawImage(bitmap, 0, 0);
    const { data: pixels, height, width } = context.getImageData(0, 0, canvas.width, canvas.height);
    const luma = (index: number): number =>
      0.299 * pixels[index] + 0.587 * pixels[index + 1] + 0.114 * pixels[index + 2];

    let total = 0;
    let counted = 0;

    for (let y = 1; y < height - 1; y += 2) {
      for (let x = 1; x < width - 1; x += 2) {
        const here = (y * width + x) * 4;
        total +=
          Math.abs(luma(here) - luma(here + 4)) + Math.abs(luma(here) - luma(here + width * 4));
        counted += 1;
      }
    }

    return counted === 0 ? 0 : total / counted;
  }, Buffer.concat(chunks).toString("base64"));
}

test("browser: motion blur softens a frame that is moving and leaves a still one sharp", async ({
  page,
}) => {
  await page.goto("/");
  await openTimeline(page);

  // 2K rather than the 4K default: this exports four times, and the statistic
  // being measured does not need the pixels.
  await pickOption(
    await getToolcraftControlFieldByTarget(page, "export.image.resolution"),
    "2K",
  );

  // A full turn packed into the first fifth of the loop, so the product is
  // moving fast enough at the sampled moment that a shutter's worth of it is a
  // visible smear rather than a sub-pixel one.
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
  await scrubToFraction(page, 0.2);
  await typeSliderValue(spin, 359);
  await page.waitForTimeout(1_500);

  // Mid-turn, where the motion is quickest.
  await scrubToFraction(page, 0.1);
  await page.waitForTimeout(1_000);

  const sharp = await measureSharpness(page, await exportPng(page));

  const motionBlur = await getToolcraftControlFieldByTarget(page, "export.video.motionBlur");
  const toggle = motionBlur.locator('[role="switch"]').first();
  await expect(
    toggle,
    "Motion blur starts off, so a sharp export is what you get without asking.",
  ).toHaveAttribute("aria-checked", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await page.waitForTimeout(500);

  // The shutter only exists once the blur does.
  const shutter = await getToolcraftControlFieldByTarget(page, "export.video.shutterAngle");
  await expect(
    shutter,
    "Shutter angle has nothing to describe until motion blur is on, and appears with it.",
  ).toBeVisible();
  await pickOption(shutter, "360°");
  await page.waitForTimeout(500);

  const blurred = await measureSharpness(page, await exportPng(page));

  expect(
    blurred,
    `A frame smeared across its whole shutter must have softer edges than the same instant drawn sharp: sharp ${sharp}, blurred ${blurred}.`,
  ).toBeLessThan(sharp);

  // Not merely different -- meaningfully softer. A rounding difference between
  // two renders of the same instant would not move this by a twentieth.
  expect(blurred).toBeLessThan(sharp * 0.95);

  // And a frame where nothing is moving is left alone. Past the last keyframe
  // the turn is over and holding, so the shutter has nothing to spread.
  await scrubToFraction(page, 0.8);
  await page.waitForTimeout(1_000);
  const heldBlurred = await measureSharpness(page, await exportPng(page));

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await page.waitForTimeout(500);
  const heldSharp = await measureSharpness(page, await exportPng(page));

  expect(
    Math.abs(heldBlurred - heldSharp),
    `A still frame is the same picture either way: with blur ${heldBlurred}, without ${heldSharp}.`,
  ).toBeLessThan(heldSharp * 0.02);
});
