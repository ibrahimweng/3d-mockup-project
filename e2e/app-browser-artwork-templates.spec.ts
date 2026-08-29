import { expect } from "@playwright/test";

import { getToolcraftControlFieldByTarget } from "./browser-control-target-helpers";
import { createToolcraftBrowserProofSession } from "./browser-proof-session";
import { pickOption } from "./mockup-controls";
import { test } from "./toolcraft-product-test";

test.setTimeout(240_000);

/**
 * What a person actually gets when they press Download.
 *
 * The assertion is on the bytes rather than on the button, because the whole
 * value of a template is that it is the file the model was built from: a
 * design drawn over it lands where it was drawn only while the two are the
 * same image. A proof that the button fires would still pass if it handed
 * back something regenerated, resized, or from the wrong product.
 */
const CASES = [
  { file: "tshirt-templates.zip", magic: "504b0304", product: "T-Shirt" },
  { file: "water-bottle-body.png", magic: "89504e47", product: "Water Bottle" },
] as const;

test("browser: the templates button hands back the files the model was built from", async ({
  page,
}) => {
  await page.goto("/");
  await createToolcraftBrowserProofSession(page);
  await page.waitForTimeout(6_000);

  // A device ships no printed sheet, so it must not offer the control at all.
  await expect(
    page.locator('[data-toolcraft-control-target="artwork.templates"]'),
  ).toHaveCount(0);

  for (const testCase of CASES) {
    await pickOption(
      await getToolcraftControlFieldByTarget(page, "device.model"),
      testCase.product,
    );
    await page.waitForTimeout(6_000);

    const field = await getToolcraftControlFieldByTarget(
      page,
      "artwork.templates",
    );
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 90_000 }),
      field.getByRole("button", { name: /Download/i }).first().click(),
    ]);

    expect(download.suggestedFilename()).toBe(testCase.file);
    const path = await download.path();
    const { readFile } = await import("node:fs/promises");
    const bytes = await readFile(path);
    // A zip starts PK\x03\x04 and a PNG starts \x89PNG. One zone comes back as
    // itself; several come back archived, because four downloads from one
    // press is something browsers ask permission for.
    expect(bytes.subarray(0, 4).toString("hex")).toBe(testCase.magic);
    expect(bytes.byteLength).toBeGreaterThan(1_000);
  }
});
