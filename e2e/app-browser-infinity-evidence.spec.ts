import type { Download, Page } from "@playwright/test";
import fs from "node:fs/promises";

import { createToolcraftBrowserProofSession } from "./browser-proof-session";
import {
  expectToolcraftInfinityCanvasImageExportEvidence,
  expectToolcraftInfinityCanvasModeEvidence,
  observeInfinityCanvas,
} from "./browser-infinity-canvas-evidence";
import { inspectToolcraftImageDownload } from "./image-artifact-inspection";
import { toggleSwitch } from "./mockup-controls";
import { test } from "./toolcraft-product-test";

test.setTimeout(600_000);

async function settled(page: Page): Promise<void> {
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

test("browser: infinite-mode PNG export crops to the product scene bounds union", async ({
  page,
}) => {
  await page.goto("/");
  await createToolcraftBrowserProofSession(page);
  await settled(page);

  const shoot = async (): Promise<{ byteLength: number; height: number; width: number }> => {
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
    return { byteLength, height: inspection.height, width: inspection.width };
  };

  const finite = await shoot();
  await toggleSwitch(page, "canvas.infinity");
  await settled(page);
  const infinite = await shoot();

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
