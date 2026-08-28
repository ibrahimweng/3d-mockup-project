import { expect, test, type Page } from "@playwright/test";

import { openTimeline, scrubToFraction } from "./mockup-timeline";
import { getToolcraftControlFieldByTarget } from "./browser-control-target-helpers";
import { typeSliderValue } from "./mockup-controls";

async function shot(page: Page): Promise<Buffer> {
  return page.locator("[data-toolcraft-product-output]").first().screenshot();
}

async function diff(page: Page, a: Buffer, b: Buffer) {
  return page.evaluate(
    async ([first, second]) => {
      const decode = async (base64: string) => {
        const image = new Image();
        image.src = `data:image/png;base64,${base64}`;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext("2d")!;
        context.drawImage(image, 0, 0);
        return context.getImageData(0, 0, canvas.width, canvas.height);
      };
      const one = await decode(first!);
      const two = await decode(second!);
      let differing = 0, maxDelta = 0, sumDelta = 0;
      for (let index = 0; index < one.data.length; index += 4) {
        let delta = 0;
        for (let channel = 0; channel < 3; channel += 1) {
          delta = Math.max(delta, Math.abs(one.data[index + channel]! - two.data[index + channel]!));
        }
        if (delta === 0) continue;
        differing += 1; sumDelta += delta;
        if (delta > maxDelta) maxDelta = delta;
      }
      return { differing, maxDelta, meanDelta: Number((differing ? sumDelta / differing : 0).toFixed(2)) };
    },
    [a.toString("base64"), b.toString("base64")],
  );
}

test("does the frame come back to itself now", async ({ page }) => {
  test.setTimeout(540_000);
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
  const baseline = await shot(page);

  for (const fraction of [0.2, 0.4, 0.6, 0.8, 0.95]) {
    await scrubToFraction(page, fraction);
    await page.waitForTimeout(700);
  }
  await scrubToFraction(page, 0.02);
  await page.waitForTimeout(2_000);
  console.log("AFTER SCRUBBING:", JSON.stringify(await diff(page, baseline, await shot(page))));

  await page.getByRole("button", { name: "Play playback" }).first().click();
  await page.waitForTimeout(20_000);
  const pause = page.getByRole("button", { name: "Pause playback" }).first();
  if (await pause.count()) await pause.click();
  await page.waitForTimeout(1_500);
  await scrubToFraction(page, 0.02);
  await page.waitForTimeout(2_000);
  console.log("AFTER PLAYING  :", JSON.stringify(await diff(page, baseline, await shot(page))));

  expect(true).toBe(true);
});
