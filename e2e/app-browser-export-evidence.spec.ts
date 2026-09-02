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
 * What a file measures, as opposed to what its header claims.
 *
 * Two numbers, both taken off the decoded pixels. `edge` is the steepest step
 * between two neighbouring pixels anywhere over the product, which is what
 * resolution means once the header has stopped talking: a picture enlarged
 * from fewer pixels than it claims cannot produce a step a picture drawn at
 * that size produces. `bare` is the share of the frame's last row and column
 * that is one flat colour, which is what an export that did not reach its own
 * edges leaves behind.
 */
async function measureExport(
  page: import("@playwright/test").Page,
  download: Download,
): Promise<{ bare: number; edge: number }> {
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

    // Over the product, where a print gives hard edges to resolve.
    const crop = context.getImageData(
      Math.round(width * 0.35), Math.round(height * 0.4),
      Math.round(width * 0.3), Math.round(height * 0.2),
    );
    let edge = 0;
    for (let y = 0; y < crop.height; y += 3) {
      for (let x = 1; x < crop.width; x += 1) {
        const at = (y * crop.width + x) * 4;
        edge = Math.max(edge, Math.abs(luma(crop.data, at) - luma(crop.data, at - 4)));
      }
    }

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
    return { bare: flat / counted, edge };
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

  const measured: Record<string, { bare: number; edge: number }> = {};
  for (const size of ["4K", "8K"] as const) {
    const field = await getToolcraftControlFieldByTarget(page, "export.image.resolution");
    await pickOption(field, size);
    measured[size] = await measureExport(page, await exportArtifact(page));
  }
  console.log("MEASURED:", JSON.stringify(measured));

  /**
   * A check edge has to arrive as an edge.
   *
   * The design is a checkerboard of saturated colour, so every boundary in it
   * is a step of well over 170 of the 255 the luma scale has, and a picture
   * that resolves its own pixels reproduces very nearly all of it. Anything
   * that resamples the frame on its way into the file spreads that step over
   * two pixels and halves it, and there is no other way to tell: the header
   * still says 8192 and the picture still looks like a shirt.
   *
   * Measured on this configuration, before and after the export stopped
   * resampling itself: 4K 133 -> 197, 8K 140 -> 205. If a driver moves these,
   * move the threshold with evidence rather than lowering it to fit -- the
   * value it is guarding is the gap between a resolved edge and a blurred one,
   * which is most of the range.
   */
  for (const size of ["4K", "8K"] as const) {
    expect(measured[size].edge, `${size} edge`).toBeGreaterThan(170);
  }

  /**
   * And more pixels must not mean less picture.
   *
   * A browser caps a canvas's backing store and says nothing about it: an 8K
   * frame is 53.7 million pixels against a cap of 33.6, so the store came back
   * 78.6 per cent of the size asked for while `canvas.width` went on reporting
   * the full number. What that costs depends on how the platform presents the
   * short buffer -- stretched, so the file is soft, or laid into the top left
   * corner, so the file carries two bands of bare background down the right
   * and along the bottom. The rim is measured for the second, because it is
   * the same fault and a machine shows one or the other.
   */
  expect(measured["8K"].edge).toBeGreaterThan(measured["4K"].edge * 0.8);
  for (const size of ["4K", "8K"] as const) {
    expect(measured[size].bare, `${size} rim`).toBeLessThan(0.5);
  }
});
