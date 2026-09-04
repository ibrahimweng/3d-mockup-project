import type { Page } from "@playwright/test";

import { expect, test } from "./toolcraft-product-test";
import { uploadDesign } from "./mockup-controls";
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

/**
 * The step's control, reached the way the person in front of it reaches it.
 *
 * Deliberately not `getToolcraftControlFieldByTarget`, which opens every
 * collapsed section before it looks. That helper is right for every other
 * proof and wrong here: the tour dims the panel outside the one control it is
 * pointing at, so a press on some other section's header does not land — which
 * is the whole point of a spotlight, and which this proof discovered by hanging
 * on one for ten minutes. The tour opens the section its own step needs.
 */
const spotlit = (page: Page, target: string) =>
  page.locator(`[data-toolcraft-control-target="${target}"]`);

/**
 * Choose from the spotlit select, and do not look back at it.
 *
 * Deliberately not `pickOption`, whose last line waits for the trigger to show
 * what was chosen. That is the right check everywhere else and cannot hold
 * here: measured, the tour is on the next step and the panel is on the next tab
 * within 200ms of the choice, so the select this would read is already
 * unmounted. What the choice did is asserted by the step advancing, which is
 * the thing actually worth knowing.
 */
async function pickFromSpotlight(
  page: Page,
  target: string,
  label: string,
): Promise<void> {
  await spotlit(page, target).locator("[role=combobox]").first().click();
  await page
    .locator("[role=listbox]:visible [role=option]", {
      hasText: new RegExp(`^${label}$`),
    })
    .first()
    .click();
}

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
  await pickFromSpotlight(page, "device.model", "Tote Bag");
  await expect
    .poll(() => stepNumber(page), { timeout: 30_000 })
    .toBe("2");

  // Step two is on another tab, so the tour has to have taken the panel there.
  // A tab does not hide its sections, it unmounts them, so a tour that did not
  // switch would be pointing at nothing at all.
  await expect(
    spotlit(page, "artwork.image"),
    "The tour must open the tab holding the step's control.",
  ).toBeVisible({ timeout: 15_000 });

  await uploadDesign(spotlit(page, "artwork.image"));
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

  // And the panel is fully usable again — the same header that could not be
  // pressed a moment ago now can. This is the other half of the claim above:
  // the spotlight really does hold the rest of the studio back while it is up,
  // and really does let go of it afterwards.
  const setupHeader = page
    .locator('[data-slot="control-section-header"] [data-control-section-collapse-button]')
    .first();
  await setupHeader.click({ timeout: 10_000 });

  // Skipping is not a way to never be asked. The gate is the backstop, and it
  // is the reason skipping can be offered at all.
  await page.getByRole("button", { name: "Export PNG" }).click();
  await expect(page.locator('[data-slot="mockup-signup"]')).toBeVisible({
    timeout: 30_000,
  });
});

/**
 * What the spotlight is for, stated rather than discovered.
 *
 * The dim is four rectangles around the step's control, so the control is
 * pressable and nothing else is. That is intentional — it is what keeps someone
 * on the step — but it is also the reason this file cannot use the shared
 * control helper, and it cost ten minutes of a hanging click to work out. So it
 * is asserted here: while the tour is up, a control it is not pointing at does
 * not take a press.
 */
test("browser: the spotlight holds back everything it is not pointing at", async ({
  page,
}) => {
  await openAsAPerson(page);
  await openStudio(page);
  await expect(card(page)).toBeVisible({ timeout: 30_000 });

  // The Setup section's header, which is nowhere near step one's control.
  const setupHeader = page
    .locator('[data-slot="control-section-header"] [data-control-section-collapse-button]')
    .first();
  await expect(setupHeader).toBeVisible();
  let pressLanded = true;
  try {
    await setupHeader.click({ timeout: 4_000 });
  } catch {
    pressLanded = false;
  }
  expect(
    pressLanded,
    "A control outside the spotlight must not take a press while the tour is up.",
  ).toBe(false);

  /*
   * And the step's own control must take one, which is the half that makes the
   * tour work at all.
   *
   * Asserted as a hit test rather than by clicking, because a click that lands
   * is the same observation twice over and a click that does not just times
   * out with no explanation. This says which element is actually on top: the
   * panel marks each control with a `display: contents` wrapper, whose box is
   * `0 × 0 at (0, 0)`, and a hole cut from that box left the dim covering the
   * whole panel. Every step's own control was unpressable and the only way on
   * was Skip. `toBeEnabled` and `toBeVisible` both passed throughout.
   */
  const onTop = await page.evaluate((target) => {
    const boundary = document.querySelector(`[data-toolcraft-control-target="${target}"]`);
    const control = boundary?.querySelector("[role=combobox]");
    const box = control?.getBoundingClientRect();
    if (!control || !box) return "no control";
    const hit = document.elementFromPoint(
      box.left + box.width / 2,
      box.top + box.height / 2,
    );
    return hit === null || !control.contains(hit) ? "covered" : "reachable";
  }, "device.model");
  expect(
    onTop,
    "The control the tour is pointing at must be the thing under the pointer.",
  ).toBe("reachable");

  await pickFromSpotlight(page, "device.model", "Tote Bag");
  await expect.poll(() => stepNumber(page), { timeout: 30_000 }).toBe("2");
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
