import type { Page } from "@playwright/test";

import { expect, test } from "./toolcraft-product-test";
import { getToolcraftControlFieldByTarget } from "./browser-control-target-helpers";
import { pickOption, uploadDesign } from "./mockup-controls";
import { tourSteps } from "../src/app/tour/tour-steps";

/**
 * The tour a first-time visitor is walked through, ending at the ask.
 *
 * It hides from automated sessions for the same reason the export gate does —
 * every proof opens a fresh profile, so every proof would be a first visit, and
 * a tour standing over the control a proof came to drive breaks the suite. That
 * guard is worked around here rather than removed: `navigator.webdriver` is
 * overridden for this file alone, so the tour behaves as it does for a person
 * while every other proof still never meets it.
 *
 * The endpoint is stubbed. What is under test is the tour: that it appears for
 * someone new, that each step advances on the real action rather than on time
 * passing, that it ends on the ask, and that it does not come back.
 */
test.setTimeout(600_000);

const card = (page: Page) => page.locator('[data-slot="mockup-tour"]');
const emailForm = (page: Page) => page.locator('[data-slot="mockup-tour-email"]');

async function openAsAPerson(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
  });
  await page.route("**/api/subscribe", async (route) => {
    await route.fulfill({
      body: JSON.stringify({ status: "added" }),
      contentType: "application/json",
      status: 200,
    });
  });
}

async function openStudio(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator('[data-slot="toolcraft-runtime-app"]')).toBeVisible();
  await page.waitForTimeout(8_000);
}

const stepNumber = async (page: Page): Promise<string | null> =>
  card(page).getAttribute("data-tour-step");

test("browser: a first-time visitor is walked to the ask, one real action at a time", async ({
  page,
}) => {
  await openAsAPerson(page);
  await openStudio(page);

  await expect(card(page), "A browser that has not been here gets the tour.").toBeVisible({
    timeout: 30_000,
  });
  expect(await stepNumber(page)).toBe("1");
  expect(await card(page).getAttribute("data-tour-total")).toBe(String(tourSteps.length));

  // Step one: pick a product. The spotlight has to leave the control usable —
  // this is the whole design of it, and a dim overlay laid over the top would
  // pass every visual check and fail exactly here.
  await pickOption(await getToolcraftControlFieldByTarget(page, "device.model"), "Tote Bag");
  await expect
    .poll(() => stepNumber(page), { timeout: 30_000 })
    .toBe("2");

  // Step two is on another tab, so the tour has to have taken the panel there.
  // A tab does not hide its sections, it unmounts them, so a tour that did not
  // switch would be pointing at nothing at all.
  await expect(
    page.locator('[data-toolcraft-control-target="artwork.image"]'),
    "The tour must open the tab holding the step's control.",
  ).toBeVisible({ timeout: 15_000 });

  await uploadDesign(await getToolcraftControlFieldByTarget(page, "artwork.image"));
  await expect.poll(() => stepNumber(page), { timeout: 60_000 }).toBe("3");

  // Step three is a drag on the product itself, which is the gesture nobody
  // finds on their own and the reason the tour exists.
  const box = await page.locator("canvas").first().boundingBox();
  if (!box) throw new Error("The studio drew no canvas to drag.");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2 + 20, {
    steps: 12,
  });
  await page.mouse.up();
  await expect.poll(() => stepNumber(page), { timeout: 60_000 }).toBe("4");

  // And the last step is the ask.
  await expect(emailForm(page)).toBeVisible({ timeout: 15_000 });
  await emailForm(page).locator("input[type=email]").fill("tour@example.com");
  await emailForm(page).locator("button[type=submit]").click();

  await expect(card(page)).toBeHidden({ timeout: 20_000 });

  // Reloading is the test of "once". The flag is site data, so a reload keeps
  // it and a person who has been walked through is not walked through again.
  await page.reload();
  await expect(page.locator('[data-slot="toolcraft-runtime-app"]')).toBeVisible();
  await page.waitForTimeout(6_000);
  await expect(card(page), "The tour is a first run, not every run.").toBeHidden();

  // And having given an address, the export gate never asks either.
  await page.getByRole("button", { name: "Export PNG" }).click();
  await page.waitForTimeout(3_000);
  await expect(page.locator('[data-slot="mockup-signup"]')).toBeHidden();
});

test("browser: skipping the tour leaves the studio alone, and the gate still asks", async ({
  page,
}) => {
  await openAsAPerson(page);
  await openStudio(page);
  await expect(card(page)).toBeVisible({ timeout: 30_000 });

  await page.locator('[data-slot="mockup-tour-skip"]').click();
  await expect(card(page)).toBeHidden({ timeout: 10_000 });

  // Nothing of the tour is left over the studio: a spotlight that outlived its
  // card would dim the whole app with no way to dismiss it.
  await expect(page.locator('[data-slot="mockup-tour-spotlight"]')).toHaveCount(0);

  // Skipping is not a way to never be asked. The gate is the backstop, and it
  // is the reason skipping can be offered at all.
  await page.getByRole("button", { name: "Export PNG" }).click();
  await expect(page.locator('[data-slot="mockup-signup"]')).toBeVisible({
    timeout: 30_000,
  });
});

/**
 * The guard that keeps the rest of the suite alive. If the tour ever stopped
 * standing down for automation, every proof in this suite would meet it — so
 * the claim is asserted here rather than discovered as eighty timeouts.
 */
test("browser: an automated session is not a first-time visitor", async ({ page }) => {
  await openStudio(page);
  await expect(card(page)).toHaveCount(0);
});
