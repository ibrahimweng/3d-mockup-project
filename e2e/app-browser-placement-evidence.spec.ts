import type { Download, Page } from "@playwright/test";

import { createToolcraftBrowserProofSession } from "./browser-proof-session";
import { getToolcraftControlFieldByTarget } from "./browser-control-target-helpers";
import {
  dragCanvasHandle,
  expectExportExcludesCanvasHandles,
} from "./canvas-handle-helpers";
import { inspectToolcraftImageDownload } from "./image-artifact-inspection";
import { setSlider, uploadDesign } from "./mockup-controls";
import { expectToolcraftProductObservableToChange } from "./product-observable-helpers";
import { test } from "./toolcraft-product-test";

test.setTimeout(300_000);

async function exportPng(page: Page): Promise<Download> {
  const button = page.getByRole("button", { name: /^Export (PNG|JPG)$/ }).first();
  await button.scrollIntoViewIfNeeded();
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 240_000 }),
    button.click(),
  ]);
  return download;
}

async function stageCroppedDesign(page: Page): Promise<void> {
  await uploadDesign(await getToolcraftControlFieldByTarget(page, "artwork.image"));
  await page.waitForTimeout(2_500);
  // Nothing to slide until something is cropped on both axes.
  await setSlider(await getToolcraftControlFieldByTarget(page, "artwork.scale"), 180);
  await page.waitForTimeout(1_500);
}

test("browser: dragging on the screen moves the design while dragging the body rotates", async ({
  page,
}) => {
  await page.goto("/");
  const session = await createToolcraftBrowserProofSession(page);
  await stageCroppedDesign(page);

  await expectToolcraftProductObservableToChange(
    session,
    session.targetAction("artwork.offset", async (currentPage) => {
      await dragCanvasHandle(
        currentPage,
        "toolcraft-product-output",
        { x: 70, y: 40 },
        { requirementId: "artwork.placement.drag", target: "artwork.offset" },
      );
    }),
    { requirementId: "artwork.placement.drag", timeoutMs: 45_000 },
  );
});

/**
 * What leaves the app is rendered, not screen-grabbed.
 *
 * Both of these mark the editor's canvas handles as brightly as CSS allows and
 * export again. If anything about the preview's own presentation reached the
 * artifact the signature would move; it does not, because the export builds its
 * own renderer on its own canvas and draws the scene a second time.
 */
test("browser: the exported PNG contains no orientation gizmo", async ({ page }) => {
  await page.goto("/");
  await createToolcraftBrowserProofSession(page);
  await page.waitForTimeout(6_000);

  await expectExportExcludesCanvasHandles(
    page,
    () => exportPng(page),
    async (download) => {
      const { inspection } = await inspectToolcraftImageDownload({
        backgroundRgba: [0, 0, 0, 255],
        download,
        page,
      });
      return inspection;
    },
    { requirementId: "camera.orbit.pose#export-clean", target: "camera.orbit" },
  );
});

test("browser: the exported PNG contains no placement chrome", async ({ page }) => {
  await page.goto("/");
  await createToolcraftBrowserProofSession(page);
  await stageCroppedDesign(page);

  await expectExportExcludesCanvasHandles(
    page,
    () => exportPng(page),
    async (download) => {
      const { inspection } = await inspectToolcraftImageDownload({
        backgroundRgba: [0, 0, 0, 255],
        download,
        page,
      });
      return inspection;
    },
    { requirementId: "artwork.placement.drag", target: "artwork.offset" },
  );
});
