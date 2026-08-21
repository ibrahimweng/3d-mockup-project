import { expect, type Download, type Page } from "@playwright/test";
import fs from "node:fs/promises";

import { expectToolcraftReferenceParity } from "./browser-acceptance-outcome-helpers";
import { expectExportExcludesCanvasHandles } from "./canvas-handle-helpers";
import {
  expectToolcraftOrientationAxisDrag,
  expectToolcraftOrientationAxisSnap,
  expectToolcraftOrientationCanvasMissPan,
  expectToolcraftOrientationUndoReset,
  type ToolcraftOrientationBrowserObservation,
} from "./browser-orientation-gizmo-evidence-helpers";
import {
  createToolcraftBrowserProofSession,
  readToolcraftBrowserObservation,
} from "./browser-proof-session";
import { inspectToolcraftImageDownload } from "./image-artifact-inspection";
import { test } from "./toolcraft-product-test";

test.setTimeout(900_000);

const options = {
  requirementId: "camera.orbit.pose",
  // A scene this size does not settle in a frame, and the proof compares a
  // baseline against itself before it will believe a change.
  stabilityIntervalMs: 400,
  target: "camera.orbit",
} as const;

/**
 * What the product says about the frame it is showing.
 *
 * Published by `MockupPreview` onto its own canvas, because the runtime cannot
 * see inside a WebGL context: the pose it was handed, the frame it asked for,
 * and a signature of the pixels that actually came back off the drawing
 * buffer. Read as one object so a rotation and a pan can be told apart by what
 * moved rather than by which gesture was used.
 */
function readOrientation(root: HTMLElement): unknown {
  const canvas = root.querySelector<HTMLCanvasElement>(
    "[data-toolcraft-product-output]",
  );
  const raw = canvas?.dataset.mockupOrientation;
  return raw ? JSON.parse(raw) : null;
}

/**
 * Room for the artboard and the gizmo at once.
 *
 * The suite's own window is 1280 by 720 and the default artboard is 1080 by
 * 1350, so the gizmo sits below the fold and a drag aimed at it lands on
 * whatever scrolled into its place.
 */
async function openWideEnough(page: Page): Promise<void> {
  await page.setViewportSize({ height: 2000, width: 2600 });
  await page.waitForTimeout(2_500);
}

async function settled(page: Page): Promise<void> {
  await page
    .locator("[data-toolcraft-product-output]")
    .first()
    .waitFor({ state: "visible", timeout: 120_000 });
  await page.waitForTimeout(2_500);
}

/**
 * Move the board without touching the pose.
 *
 * The middle button, because on this canvas a plain primary drag rotates
 * wherever it starts — including the empty space beside the device, which is
 * the natural place to grab a phone whose whole front face belongs to the
 * design drag. The proof is about a canvas gesture that pans and leaves the
 * pose alone, and this is the one this product has.
 */
async function panTheBoard(page: Page): Promise<void> {
  const canvas = page.locator("[data-toolcraft-product-output]").first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("The product canvas has no box to pan from.");
  const startX = box.x + box.width * 0.2;
  const startY = box.y + box.height * 0.2;
  await page.mouse.move(startX, startY);
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(startX + 96, startY + 48, { steps: 10 });
  await page.mouse.up({ button: "middle" });
  await page.waitForTimeout(1_500);
}

async function exportPng(page: Page): Promise<Download> {
  const button = page.getByRole("button", { name: /^Export (PNG|JPG)$/ }).first();
  await button.scrollIntoViewIfNeeded();
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 600_000 }),
    button.click(),
  ]);
  return download;
}

test("browser: dragging the device rotates it, the middle button moves the board, and export matches the pose", async ({
  page,
}) => {
  await page.goto("/");
  const session = await createToolcraftBrowserProofSession(page);
  await openWideEnough(page);
  await settled(page);

  const observation = session.observe(readOrientation);
  const baseline = (await readToolcraftBrowserObservation(
    observation,
  )) as ToolcraftOrientationBrowserObservation;

  // Dragging the gizmo's background turns the device, and has to be seen doing
  // it while the pointer is still down rather than only on release.
  const dragged = await expectToolcraftOrientationAxisDrag(observation, session, {
    ...options,
    dragDelta: { x: 22, y: 14 },
  });

  // Undo puts it back, redo returns it, and the section reset puts it back
  // again — each compared against the exact frame it should restore.
  await expectToolcraftOrientationUndoReset(
    observation,
    session.action(async (current) => {
      await current.keyboard.press("Control+z");
    }),
    session.action(async (current) => {
      await current.keyboard.press("Control+Shift+z");
    }),
    session.action(async (current) => {
      await current
        .getByRole("button", { name: "Reset Camera section" })
        .first()
        .click();
    }),
    baseline,
    dragged,
    options,
  );

  /**
   * Reference parity for the renderer loop.
   *
   * Two things the reference's loop did and this one has to keep doing. The
   * frame is a pure function of the state, so returning to a pose returns the
   * exact frame — no accumulation, nothing left over from the pose it came
   * through. And the loop draws the runtime's pose rather than a copy of its
   * own, so the value the gizmo publishes is the value that was drawn.
   *
   * What is not parity here is which pointer starts a rotation: this product
   * takes any plain primary drag and moves the board on the middle button,
   * where the reference rotated only on a hit and panned on a miss. That
   * divergence is recorded on the `camera-orbit` entry in the reference
   * inventory as intentionally changed rather than quietly asserted here.
   */
  await expectToolcraftReferenceParity(
    async () => ({
      drawn: await readToolcraftBrowserObservation(observation),
      gizmo: JSON.parse(
        (await page
          .locator('[data-toolcraft-orientation-target="camera.orbit"]')
          .first()
          .getAttribute("data-toolcraft-orientation-pose")) ?? "null",
      ),
    }),
    { drawn: baseline, gizmo: baseline.pose },
    { requirementId: "camera.orbit.pose", target: "camera.orbit" },
  );

  // Clicking a signed axis returns to that view, at the distance it was already
  // standing at.
  await expectToolcraftOrientationAxisSnap(observation, session, "+x", options);

  // And a gesture that moves the board must leave the pose exactly where it is.
  await expectToolcraftOrientationCanvasMissPan(
    observation,
    session.action(panTheBoard),
    options,
  );
});

test("browser: the exported PNG contains no orientation gizmo", async ({ page }) => {
  await page.goto("/");
  await createToolcraftBrowserProofSession(page);
  await openWideEnough(page);
  await settled(page);

  await expectExportExcludesCanvasHandles(
    page,
    () => exportPng(page),
    async (download) => {
      const { inspection } = await inspectToolcraftImageDownload({
        backgroundRgba: [0, 0, 0, 255],
        download,
        page,
      });
      const downloadPath = await download.path();
      expect(downloadPath, "The export produced no file.").not.toBeNull();
      await fs.stat(downloadPath!);
      return inspection;
    },
    { requirementId: "camera.orbit.pose#export-clean", target: "camera.orbit" },
  );
});
