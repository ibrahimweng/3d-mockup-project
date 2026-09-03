import type { Page } from "@playwright/test";

import {
  getToolcraftControlFieldByTarget,
  openPanelTabOwning,
} from "./browser-control-target-helpers";
import { pickOption, pickSegment, readSegments } from "./mockup-controls";
import { expect, test } from "./toolcraft-product-test";

/**
 * Which upload box is on screen, and whether anything says so.
 *
 * The defect this closes: a shirt showed four uploaders, all reading "Click to
 * upload an image" and nothing else, because the runtime hands `FileDrop` no
 * label and wraps it in a bare `contents` div. Four identical squares, and the
 * difference between the second and the fourth was a back panel and a right
 * sleeve.
 *
 * So the assertions are about counts and names rather than pixels: exactly one
 * uploader, and the picker beside it naming which panel it is.
 */
test.setTimeout(600_000);

const uploaders = (page: Page) =>
  page.locator(
    [
      '[data-toolcraft-control-target="artwork.image"]',
      '[data-toolcraft-control-target="artwork.imageBack"]',
      '[data-toolcraft-control-target="artwork.imageLeft"]',
      '[data-toolcraft-control-target="artwork.imageRight"]',
    ].join(", "),
  );

async function choosePanel(page: Page, label: string): Promise<void> {
  await pickSegment(
    await getToolcraftControlFieldByTarget(page, "artwork.zone"),
    label,
  );
}

test("browser: the panel picker names which upload box is on screen", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator('[data-slot="toolcraft-runtime-app"]')).toBeVisible();
  await page.waitForTimeout(8_000);

  const device = await getToolcraftControlFieldByTarget(page, "device.model");
  await pickOption(device, "T-Shirt");
  await page.waitForTimeout(12_000);

  // Every panel in turn, each proving it is the only box on screen. Asserting
  // only that the right one appears would pass on a panel that showed all four.
  for (const [label, target] of [
    ["Front", "artwork.image"],
    ["Back", "artwork.imageBack"],
    ["Left", "artwork.imageLeft"],
    ["Right", "artwork.imageRight"],
  ] as const) {
    await choosePanel(page, label);
    await expect(uploaders(page), `${label} should be the only box`).toHaveCount(1);
    await expect(
      page.locator(`[data-toolcraft-control-target="${target}"]`),
      `${label} should show its own box`,
    ).toHaveCount(1);
  }
});

test("browser: a product with one panel shows one box and no picker", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator('[data-slot="toolcraft-runtime-app"]')).toBeVisible();
  await page.waitForTimeout(8_000);

  const device = await getToolcraftControlFieldByTarget(page, "device.model");
  await pickOption(device, "T-Shirt");
  await page.waitForTimeout(12_000);
  // Leave the shirt on a sleeve, which is the state that used to strand a
  // phone with no uploader at all once the picker went away with it.
  await choosePanel(page, "Right");
  await expect(uploaders(page)).toHaveCount(1);

  await pickOption(
    await getToolcraftControlFieldByTarget(page, "device.model"),
    "Water Bottle",
  );
  await page.waitForTimeout(12_000);

  // Back to the tab the uploaders are on. Choosing a device leaves the panel on
  // Product, and asserting from there would pass on an empty Design tab for the
  // wrong reason -- which is exactly what the first version of this did.
  await openPanelTabOwning(page, "artwork.image");

  await expect(
    page.locator('[data-toolcraft-control-target="artwork.zone"]'),
    "a one-panel product has nothing to pick",
  ).toHaveCount(0);
  await expect(uploaders(page), "and still has its uploader").toHaveCount(1);
  await expect(
    page.locator('[data-toolcraft-control-target="artwork.image"]'),
  ).toHaveCount(1);
});

test("browser: a two-panel product gets a two-panel picker", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('[data-slot="toolcraft-runtime-app"]')).toBeVisible();
  await page.waitForTimeout(8_000);

  await pickOption(
    await getToolcraftControlFieldByTarget(page, "device.model"),
    "ID Card",
  );
  await page.waitForTimeout(12_000);
  await openPanelTabOwning(page, "artwork.image");

  // Two panels, two options. A four-way picker here would offer a left and a
  // right sleeve to a piece of card.
  const picker = await getToolcraftControlFieldByTarget(page, "artwork.zone");
  expect(await readSegments(picker)).toEqual(["Front", "Back"]);

  for (const [label, target] of [
    ["Front", "artwork.image"],
    ["Back", "artwork.imageBack"],
  ] as const) {
    await choosePanel(page, label);
    await expect(uploaders(page), `${label} should be the only box`).toHaveCount(1);
    await expect(
      page.locator(`[data-toolcraft-control-target="${target}"]`),
    ).toHaveCount(1);
  }

  // And the four-panel product still gets four, which is the half of this that
  // a shared value target could quietly break.
  await pickOption(
    await getToolcraftControlFieldByTarget(page, "device.model"),
    "T-Shirt",
  );
  await page.waitForTimeout(14_000);
  await openPanelTabOwning(page, "artwork.image");
  expect(
    await readSegments(await getToolcraftControlFieldByTarget(page, "artwork.zone")),
  ).toEqual(["Front", "Back", "Left", "Right"]);
  await choosePanel(page, "Right");
  await expect(
    page.locator('[data-toolcraft-control-target="artwork.imageRight"]'),
    "a sleeve must still be choosable after a two-panel product",
  ).toHaveCount(1);
});
