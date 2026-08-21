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
import { pickOption, subjectBox, toggleSwitch } from "./mockup-controls";
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
 * How much of an exported frame the device itself takes up, per axis.
 *
 * The same instrument the framing proof uses on a preview frame, pointed at a
 * decoded artifact instead.
 */
async function deviceFill(
  page: Page,
  download: Download,
): Promise<Readonly<{ height: number; width: number }>> {
  const downloadPath = await download.path();
  if (!downloadPath) throw new Error("Playwright did not expose the download path.");
  return subjectBox(page, await fs.readFile(downloadPath));
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
