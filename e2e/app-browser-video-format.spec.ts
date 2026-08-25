import { expect } from "@playwright/test";

import { getToolcraftControlFieldByTarget } from "./browser-control-target-helpers";
import { pickOption, typeSliderValue } from "./mockup-controls";
import { openTimeline } from "./mockup-timeline";
import { test } from "./toolcraft-product-test";

test.setTimeout(1_500_000);

/**
 * Asking for MP4 has to produce an MP4.
 *
 * This browser has no H.264 encoder — `VideoEncoder.isConfigSupported` refuses
 * every AVC profile — and the runtime used to offer only H.264 for the MP4
 * container, so choosing MP4 quietly produced a WebM instead. The person chose
 * a container and got a different one, with nothing said about it. Most Linux
 * Chromium builds are in exactly that position.
 *
 * The job is deliberately small: software rendering is the cost here, not the
 * encoder, and thirty frames prove a container and a codec just as well as a
 * hundred and eighty.
 */
test("browser: asking for MP4 produces an MP4, whichever codec the browser has", async ({ page }) => {
  await page.goto("/");
  await page.waitForTimeout(8_000);

  // Make the job small enough to finish: software rendering is the cost, not
  // the encoder, and a full six-second 1080x1350 export at 2x does not finish
  // in ten minutes here.
  await typeSliderValue(await getToolcraftControlFieldByTarget(page, "canvas.renderScale"), 1);
  await page.waitForTimeout(1_000);

  await pickOption(await getToolcraftControlFieldByTarget(page, "export.video.format"), "MP4");
  await page.waitForTimeout(500);

  // Something to encode.
  await openTimeline(page);
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: /Turntable/ }).first().click();
  await page.waitForTimeout(2_000);

  // One second rather than six. Thirty frames is enough to prove a container
  // and a codec, and a hundred and eighty is only enough to prove patience.
  const durationEdit = page.getByRole("button", { name: "Edit timeline duration" }).first();
  if ((await durationEdit.count()) > 0) {
    await durationEdit.click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type("1");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(1_500);
  }

  const started = Date.now();
  const button = page.getByRole("button", { name: /^Export Video$/ }).first();
  await button.scrollIntoViewIfNeeded();
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 1_400_000 }),
    button.click(),
  ]);
  const path = await download.path();
  const { readFileSync, statSync } = await import("node:fs");
  const head = readFileSync(path!).subarray(0, 16);
  const brand = head.subarray(4, 8).toString("ascii");

  console.log(`TOOK ${((Date.now() - started) / 1000).toFixed(0)}s`);
  console.log("FILENAME:", download.suggestedFilename());
  console.log("BYTES:", statSync(path!).size);
  console.log("BOX AT OFFSET 4:", JSON.stringify(brand));
  console.log("MAJOR BRAND:", JSON.stringify(head.subarray(8, 12).toString("ascii")));

  // Which codec actually ended up inside it. This browser has no H.264
  // encoder at all, so an MP4 here can only be AV1 — which is the whole point
  // of the fallback, and the thing that used to silently become a WebM.
  const bytes = readFileSync(path!);
  const codecs = ["av01", "avc1", "vp09", "vp08"].filter(
    (fourcc) => bytes.indexOf(Buffer.from(fourcc, "ascii")) !== -1,
  );
  console.log("CODEC BOXES PRESENT:", JSON.stringify(codecs));

  expect(download.suggestedFilename()).toMatch(/\.mp4$/);
  // An MP4 begins with a size field then the ASCII "ftyp" box type.
  expect(brand).toBe("ftyp");
  expect(codecs).toContain("av01");
});
