import { expect, type Download, type Page } from "@playwright/test";
import fs from "node:fs/promises";

import { getToolcraftControlFieldByTarget } from "./browser-control-target-helpers";
import { createToolcraftBrowserProofSession } from "./browser-proof-session";
import {
  expectToolcraftInfinityCanvasImageExportEvidence,
  expectToolcraftInfinityCanvasModeEvidence,
  observeInfinityCanvas,
} from "./browser-infinity-canvas-evidence";
import { inspectToolcraftImageDownload } from "./image-artifact-inspection";
import { pickOption, toggleSwitch } from "./mockup-controls";
import { test } from "./toolcraft-product-test";

test.setTimeout(600_000);

/**
 * Wait for the product to be on screen and holding still.
 *
 * The canvas wait is not decoration. A fixed pause after `page.reload` can
 * return while the previous document is still being torn down, and the next
 * `page.evaluate` then lands in a context that no longer exists — which fails
 * as a destroyed execution context rather than as anything to do with the
 * product. Waiting for the new document's own canvas cannot resolve early.
 */
async function settled(page: Page): Promise<void> {
  await page
    .locator("[data-toolcraft-product-output]")
    .first()
    .waitFor({ state: "visible", timeout: 120_000 });
  await page.waitForTimeout(2_500);
}

/**
 * Pan the workspace with the middle button.
 *
 * Not the primary one: a primary drag anywhere on this canvas rotates the
 * device, deliberately, so that there is nothing to aim at. The board moves on
 * the middle button, the way it does in every tool that puts a model on a
 * canvas.
 */
async function panWorkspace(page: Page): Promise<void> {
  const canvas = page.locator("[data-toolcraft-product-output]").first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("The product canvas has no box.");
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(startX + 120, startY + 80, { steps: 12 });
  await page.mouse.up({ button: "middle" });
  await settled(page);
}

test("browser: enabling Infinity canvas removes the artboard and disabling restores the finite size", async ({
  page,
}) => {
  await page.goto("/");
  await createToolcraftBrowserProofSession(page);
  await settled(page);

  const before = await observeInfinityCanvas(page);
  await toggleSwitch(page, "canvas.infinity");
  await settled(page);
  const enabled = await observeInfinityCanvas(page);
  if (!enabled.sceneRect) throw new Error("Infinite mode reported no scene rect.");
  const expectedSceneRect = enabled.sceneRect;

  await panWorkspace(page);
  const afterPan = await observeInfinityCanvas(page);

  await page.reload({ waitUntil: "load" });
  await settled(page);
  await settled(page);
  const afterReload = await observeInfinityCanvas(page);

  await toggleSwitch(page, "canvas.infinity");
  await settled(page);
  const restored = await observeInfinityCanvas(page);

  await page.keyboard.press("Control+z");
  await settled(page);
  const undone = await observeInfinityCanvas(page);

  await page.keyboard.press("Control+Shift+z");
  await settled(page);
  const redone = await observeInfinityCanvas(page);

  await expectToolcraftInfinityCanvasModeEvidence(
    { afterPan, afterReload, before, enabled, redone, restored, undone },
    {
      expectedSceneRect,
      requirementId: "canvas.infinity.mode-restoration",
      target: "canvas.infinity",
    },
  );
});

/**
 * How much of a frame the device itself takes up, per axis.
 *
 * A luma threshold rather than a background colour match, because the set
 * wears the background colour and returns it shaded: the backdrop in this
 * scene runs from 0 to 20 and reaches every edge of every frame, so counting
 * pixels by distance from the background colour classifies the whole picture
 * as content and measures nothing. The device sits well clear of that — the
 * box it reports is unchanged anywhere from a threshold of 32 up to 128 — so
 * 32 is the gap between the two rather than a tuned number.
 *
 * Measured at the artifact's own resolution rather than on the 64-pixel sample
 * the runtime's inspector resamples to. That sample is nearest-neighbour, and
 * a MacBook's lid is a hairline of aluminium around a black screen: sampling
 * every twentieth row steps straight over it and reports the laptop as a tenth
 * shorter than it is. The instrument has to be finer than the thinnest edge it
 * is asked to find.
 */
async function deviceFill(
  page: Page,
  download: Download,
): Promise<Readonly<{ height: number; width: number }>> {
  const downloadPath = await download.path();
  if (!downloadPath) throw new Error("Playwright did not expose the download path.");
  const base64 = (await fs.readFile(downloadPath)).toString("base64");
  const measured = await page.evaluate(async (encoded) => {
    const binary = atob(encoded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
    // Read once and held: closing a bitmap sets its width and height to zero,
    // and dividing by that afterwards reports every frame as filled infinitely
    // rather than failing, which is a measurement that cannot be believed and
    // does not look wrong.
    const { height, width } = bitmap;
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No 2D context to decode the artifact into.");
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    const { data } = context.getImageData(0, 0, width, height);
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4;
        const luma =
          0.299 * data[offset] +
          0.587 * data[offset + 1] +
          0.114 * data[offset + 2];
        if (luma <= 32) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    return maxX < 0
      ? null
      : { height: (maxY - minY + 1) / height, width: (maxX - minX + 1) / width };
  }, base64);
  if (!measured) throw new Error("The exported frame holds no device pixels.");
  // A fraction of a frame cannot exceed the frame. Checked rather than assumed
  // because a broken instrument that reports a number is worse than one that
  // reports nothing: every assertion below it would pass.
  for (const [axis, value] of Object.entries(measured)) {
    if (!(value > 0 && value <= 1)) {
      throw new Error(`Measured ${axis} fill of ${value} is not a fraction of a frame.`);
    }
  }
  return measured;
}

test("browser: infinite-mode PNG export crops to the product scene bounds union", async ({
  page,
}) => {
  await page.goto("/");
  await createToolcraftBrowserProofSession(page);
  await settled(page);

  const shoot = async (): Promise<
    Readonly<{
      byteLength: number;
      fill: Readonly<{ height: number; width: number }>;
      height: number;
      width: number;
    }>
  > => {
    const button = page.getByRole("button", { name: /^Export (PNG|JPG)$/ }).first();
    await button.scrollIntoViewIfNeeded();
    const [download]: [Download] = await Promise.all([
      page.waitForEvent("download", { timeout: 300_000 }),
      button.click(),
    ]);
    const { inspection } = await inspectToolcraftImageDownload({
      backgroundRgba: [0, 0, 0, 255],
      download,
      page,
    });
    const downloadPath = await download.path();
    const byteLength = downloadPath ? (await fs.stat(downloadPath)).size : inspection.byteLength;
    return {
      byteLength,
      fill: await deviceFill(page, download),
      height: inspection.height,
      width: inspection.width,
    };
  };

  const finite = await shoot();
  await toggleSwitch(page, "canvas.infinity");
  await settled(page);

  // The runtime's own reading of the frame it resolved from the provider, not
  // an app selector: this is the rectangle the export has to land on.
  const sceneRect = (await observeInfinityCanvas(page)).sceneRect;
  if (!sceneRect) throw new Error("Infinite mode reported no scene rect.");
  const infinite = await shoot();

  // The artifact is that rectangle, at whatever ratio the runtime exports it
  // at — read from the width rather than restated, so the proof is that both
  // axes came from one rectangle and not that the ratio is any given number.
  const ratio = infinite.width / sceneRect.width;
  expect(ratio).toBeGreaterThanOrEqual(2);
  expect(infinite.height).toBe(Math.ceil(sceneRect.height * ratio));
  expect(infinite.width).toBe(Math.ceil(sceneRect.width * ratio));

  // And it is a crop, not just a different rectangle: the same device fills
  // more of both axes than it does inside the artboard, and nearly all of them.
  expect(infinite.fill.width).toBeGreaterThan(finite.fill.width);
  expect(infinite.fill.height).toBeGreaterThan(finite.fill.height);
  expect(infinite.fill.width).toBeGreaterThan(0.8);
  expect(infinite.fill.height).toBeGreaterThan(0.8);

  // The union follows what is in the scene rather than being a fixed shape: a
  // laptop is wider than it is tall and has to come back the other way up.
  await pickOption(
    await getToolcraftControlFieldByTarget(page, "device.model"),
    "MacBook",
  );
  await settled(page);
  const laptopRect = (await observeInfinityCanvas(page)).sceneRect;
  if (!laptopRect) throw new Error("Infinite mode reported no scene rect.");
  expect(sceneRect.height / sceneRect.width).toBeGreaterThan(1);
  expect(laptopRect.height / laptopRect.width).toBeLessThan(1);

  const laptop = await shoot();
  expect(laptop.width).toBe(Math.ceil(laptopRect.width * ratio));
  expect(laptop.height).toBe(Math.ceil(laptopRect.height * ratio));
  expect(laptop.fill.width).toBeGreaterThan(0.8);
  expect(laptop.fill.height).toBeGreaterThan(0.75);

  await expectToolcraftInfinityCanvasImageExportEvidence(
    { finite, infinite },
    {
      expectedFiniteSize: { height: finite.height, width: finite.width },
      expectedInfiniteSize: { height: infinite.height, width: infinite.width },
      requirementId: "canvas.infinity.scene-export",
      target: "canvas.infinity",
    },
  );
});
