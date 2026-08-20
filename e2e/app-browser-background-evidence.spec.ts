import type { Download, Page } from "@playwright/test";

import { expectToolcraftReferenceParity } from "./browser-acceptance-outcome-helpers";
import { expectToolcraftBackgroundOutputSemantics } from "./browser-background-output-evidence";
import { createToolcraftBrowserProofSession } from "./browser-proof-session";
import { inspectToolcraftImageDownload } from "./image-artifact-inspection";
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

/**
 * Whether the set is in the picture, and one thing downstream of it.
 *
 * The signature is the presence of the controls that only mean anything with a
 * background — the sweep and the table both hang off it — rather than a hash of
 * the pixels, which cannot be predicted ahead of the action. The pixel claim is
 * carried by the exported artifact below, where it is decoded rather than
 * inferred: with the background excluded the corner of the PNG is transparent.
 */
function readBackgroundPreview(root: HTMLElement): {
  backgroundVisible: boolean;
  outputSignature: string;
} {
  const toggle = [...root.querySelectorAll('[role="switch"]')].find(
    (node) => (node.getAttribute("aria-label") ?? "").trim() === "Background",
  );
  const backdrop = root.querySelectorAll(
    '[data-toolcraft-control-target="backdrop.height"]',
  ).length;
  return {
    backgroundVisible: toggle?.getAttribute("aria-checked") === "true",
    outputSignature: `backdrop-controls:${backdrop}`,
  };
}

test("browser: turning Background off leaves only the device and its shadow, and makes PNG export transparent", async ({
  page,
}) => {
  await page.goto("/");
  const session = await createToolcraftBrowserProofSession(page);
  await page.waitForTimeout(6_000);

  // The reference shipped this as an on-by-default inclusion, which is what
  // makes "off" a deliberate choice rather than the resting state.
  await expectToolcraftReferenceParity(
    () =>
      page.evaluate(() => {
        const toggle = [...document.querySelectorAll('[role="switch"]')].find(
          (node) => (node.getAttribute("aria-label") ?? "").trim() === "Background",
        );
        return toggle?.getAttribute("aria-checked") === "true";
      }),
    true,
    { requirementId: "background.include.toggle", target: "export.includeBackground" },
  );

  const preview = session.observe(readBackgroundPreview);

  await expectToolcraftBackgroundOutputSemantics(
    preview,
    session.controlAction("export.includeBackground", async (field) => {
      await field.locator('[role="switch"]').first().click();
    }),
    { backgroundVisible: false, outputSignature: "backdrop-controls:0" },
    session.action((currentPage) => exportPng(currentPage)),
    async (download) => {
      const inspected = await inspectToolcraftImageDownload({
        backgroundRgba: [0, 0, 0, 0],
        download,
        page,
      });
      return {
        backgroundAlpha: inspected.observation.normalizedPixels[3] ?? 255,
        byteLength: inspected.inspection.byteLength,
        height: inspected.inspection.height,
        mediaType: inspected.inspection.mediaType,
        width: inspected.inspection.width,
      };
    },
    { requirementId: "background.include.toggle" },
  );
});
