import type { Download, Page } from "@playwright/test";

import { expectToolcraftReferenceParity } from "./browser-acceptance-outcome-helpers";
import { expectToolcraftImageExportArtifact } from "./browser-media-export-evidence";
import { createToolcraftBrowserProofSession } from "./browser-proof-session";
import { test } from "./toolcraft-product-test";

test.setTimeout(300_000);

async function exportPng(page: Page): Promise<Download> {
  const button = page.getByRole("button", { name: /^Export PNG$/ }).first();
  await button.scrollIntoViewIfNeeded();
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 240_000 }),
    button.click(),
  ]);
  return download;
}

test("browser: Export PNG downloads an artifact matching the previewed frame", async ({
  page,
}) => {
  await page.goto("/");
  const session = await createToolcraftBrowserProofSession(page);
  await page.waitForTimeout(9_000);

  await expectToolcraftImageExportArtifact(
    session.action((currentPage) => exportPng(currentPage)),
    {
      backgroundRgba: [0, 0, 0, 255],
      // The device and its shadow, decoded from the artifact rather than
      // asserted about the preview: at the default canvas the subject fills
      // three quarters of the frame and sits below the top quarter, which is
      // the framing the fit settles on.
      expectedBounds: { height: 0.75, width: 0.78125, x: 0, y: 0.21875 },
      expectedHeight: 4096,
      expectedMediaType: "image/png",
      expectedPixels: [
        // The lit body, well clear of the black background the Void studio
        // paints behind it.
        { rgba: [26, 26, 26, 255], xRatio: 0.5, yRatio: 0.5 },
      ],
      expectedWidth: 3277,
      page,
      requirementId: "deliver.actions.export",
    },
  );

  // The reference delivered one PNG per press at the artboard's own size, and
  // the port kept that: no scaling step between the frame and the file.
  await expectToolcraftReferenceParity(
    async () => {
      const width = await page
        .locator('[data-toolcraft-control-target="canvas.size.width"] input')
        .first()
        .inputValue();
      const height = await page
        .locator('[data-toolcraft-control-target="canvas.size.height"] input')
        .first()
        .inputValue();
      return { height: Number(height), width: Number(width) };
    },
    { height: 1350, width: 1080 },
    { requirementId: "deliver.actions.export", target: "panel.actions" },
  );
});
