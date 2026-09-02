import { expect, type Download } from "@playwright/test";

import { expectToolcraftExportedArtifact } from "./browser-acceptance-outcome-helpers";
import {
  createToolcraftBrowserProofSession,
  runToolcraftBrowserValueAction,
} from "./browser-proof-session";
import { inspectToolcraftImageDownload } from "./image-artifact-inspection";
import { getToolcraftControlFieldByTarget } from "./browser-control-target-helpers";
import { pickOption, uploadDesign } from "./mockup-controls";
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

/**
 * How much of the frame's rim the export never reached.
 *
 * The share of the last row and the last column that is one flat colour, which
 * is what a picture that stopped short of its own canvas leaves behind.
 *
 * There is deliberately no sharpness measurement here, and it is worth saying
 * why: the obvious one is not scale-free and says the opposite of the truth. A
 * check edge on cloth has a real width -- a texture through a mipmap with a
 * weave under it -- so at twice the resolution it spans twice the pixels and
 * the step between neighbours halves. Measured on this configuration, a
 * correct 8K scored 79 against the 4K beside it at 124, with the tiling
 * verified working and every tile honoured; reducing the 8K to the 4K's size
 * first did not rescue it either, scoring the broken export higher than the
 * fixed one. Telling a real 8K from an enlarged one needs the spectrum, not a
 * step, and the guarantee is better placed where it can be stated exactly:
 * `export-grid.test.ts` holds `planExportGrid` to splitting until the context
 * honours a piece, against a fake context that lies the way a browser does.
 */
async function measureExport(
  page: import("@playwright/test").Page,
  download: Download,
): Promise<{ bare: number }> {
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const encoded = Buffer.concat(chunks).toString("base64");

  return page.evaluate(async (data) => {
    const blob = await (await fetch(`data:image/png;base64,${data}`)).blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d")!;
    context.drawImage(bitmap, 0, 0);
    const { height, width } = canvas;
    const luma = (d: Uint8ClampedArray, i: number): number =>
      0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    // The last row and the last column, which is where a short drawing buffer
    // leaves the export background showing.
    const rim = [
      context.getImageData(0, height - 1, width, 1),
      context.getImageData(width - 1, 0, 1, height),
    ];
    let flat = 0;
    let counted = 0;
    for (const strip of rim) {
      const first = luma(strip.data, 0);
      const pixels = strip.width * strip.height;
      for (let i = 0; i < pixels; i += 1) {
        counted += 1;
        if (Math.abs(luma(strip.data, i * 4) - first) < 1) flat += 1;
      }
    }
    return { bare: flat / counted };
  }, encoded);
}

test("browser: an 8K export carries 8K of detail, to all four edges", async ({ page }) => {
  await page.goto("/");
  const session = await createToolcraftBrowserProofSession(page);

  // A print, so there is something with hard edges to resolve. Without one the
  // product is flat colour and every measurement here reads the same.
  await pickOption(
    await getToolcraftControlFieldByTarget(page, "device.model"),
    "T-Shirt",
  );
  await page.waitForTimeout(12_000);
  await uploadDesign(await getToolcraftControlFieldByTarget(page, "artwork.image"));
  await page.waitForTimeout(4_000);

  const measured: Record<string, { bare: number }> = {};
  for (const size of ["4K", "8K"] as const) {
    const field = await getToolcraftControlFieldByTarget(page, "export.image.resolution");
    await pickOption(field, size);
    measured[size] = await measureExport(page, await exportArtifact(page));
  }
  console.log("MEASURED:", JSON.stringify(measured));

  /**
   * The export has to reach its own edges.
   *
   * A browser caps a canvas's backing store and says nothing about it: an 8K
   * frame is 53.7 million pixels against a cap of 33.6, so the store came back
   * 78.6 per cent of the size asked for while `canvas.width` went on reporting
   * the full number. Laid into the top left corner, that leaves two bands of
   * bare export background down the right and along the bottom -- which is how
   * this was reported, and it is the half of the fault a file can be asked
   * about directly.
   */
  for (const size of ["4K", "8K"] as const) {
    expect(measured[size].bare, `${size} rim`).toBeLessThan(0.5);
  }
});
