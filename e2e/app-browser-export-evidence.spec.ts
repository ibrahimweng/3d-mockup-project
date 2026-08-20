import { expect, type Download } from "@playwright/test";

import { expectToolcraftExportedArtifact } from "./browser-acceptance-outcome-helpers";
import {
  createToolcraftBrowserProofSession,
  runToolcraftBrowserValueAction,
} from "./browser-proof-session";
import { inspectToolcraftImageDownload } from "./image-artifact-inspection";
import { pickOption } from "./mockup-controls";
import { test } from "./toolcraft-product-test";

test.setTimeout(900_000);

/** Press the export button and hand back whatever it downloaded. */
async function exportArtifact(page: import("@playwright/test").Page): Promise<Download> {
  const button = page.getByRole("button", { name: /^Export (PNG|JPG)$/ }).first();
  await button.scrollIntoViewIfNeeded();
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 600_000 }),
    button.click(),
  ]);
  return download;
}

test("browser: PNG and JPG exports decode as their selected file type", async ({ page }) => {
  await page.goto("/");
  const session = await createToolcraftBrowserProofSession(page);
  const decoded: string[] = [];

  await expectToolcraftExportedArtifact(
    session.controlAction("export.image.format", async (field, currentPage) => {
      await pickOption(field, "PNG");
      return exportArtifact(currentPage);
    }),
    async (download) => {
      const { inspection } = await inspectToolcraftImageDownload({
        backgroundRgba: [0, 0, 0, 255],
        download,
        page,
      });
      decoded.push(inspection.mediaType);
      return inspection;
    },
    { requirementId: "image-export.format.choice" },
  );

  const jpg = await runToolcraftBrowserValueAction(
    session.controlAction("export.image.format", async (field, currentPage) => {
      await pickOption(field, "JPG");
      return exportArtifact(currentPage);
    }),
  );
  const { inspection } = await inspectToolcraftImageDownload({
    backgroundRgba: [0, 0, 0, 255],
    download: jpg,
    page,
  });
  decoded.push(inspection.mediaType);
  expect(decoded).toEqual(["image/png", "image/jpeg"]);
});

test("browser: 2K and 8K exports decode with their selected pixel dimensions", async ({
  page,
}) => {
  await page.goto("/");
  const session = await createToolcraftBrowserProofSession(page);
  const widths: number[] = [];

  for (const size of ["2K", "8K"] as const) {
    await expectToolcraftExportedArtifact(
      session.controlAction("export.image.resolution", async (field, currentPage) => {
        await pickOption(field, size);
        return exportArtifact(currentPage);
      }),
      async (download) => {
        const { inspection } = await inspectToolcraftImageDownload({
          backgroundRgba: [0, 0, 0, 255],
          download,
          page,
        });
        widths.push(inspection.width);
        return inspection;
      },
      { requirementId: "image-export.resolution.choice" },
    );
  }

  // The names are a long edge, so 8K must come back four times the 2K width.
  expect(widths[1]).toBeGreaterThan(widths[0]);
  expect(widths[1] / widths[0]).toBeCloseTo(4, 1);
});
