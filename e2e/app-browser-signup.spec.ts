import type { Page } from "@playwright/test";

import { expect, test } from "./toolcraft-product-test";

/**
 * The one time the studio asks for an email address.
 *
 * The card deliberately hides from automated sessions — every proof opens a
 * fresh profile, so every proof is a first export, and a card sitting over the
 * canvas would break whichever assertion came next. That guard is the thing
 * being worked around here rather than removed: `navigator.webdriver` is
 * overridden for this file alone, so the card behaves as it does for a person
 * while every other proof in the suite still never meets it.
 *
 * The endpoint is stubbed. What is under test is the card — when it appears,
 * that it appears once, and that it never claims to have saved an address the
 * server refused. Whether Redis stores a row is the endpoint's own concern and
 * is covered where the endpoint is, without a browser.
 */
test.setTimeout(600_000);

async function openAsAPerson(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
  });
}

async function stubSubscribe(page: Page, status: number, body: unknown): Promise<void> {
  await page.route("**/api/subscribe", async (route) => {
    await route.fulfill({
      body: JSON.stringify(body),
      contentType: "application/json",
      status,
    });
  });
}

/** Press the export the panel already owns, the way the palette does. */
async function exportOnce(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Export PNG" }).click();
}

const card = (page: Page) => page.locator('[data-slot="mockup-signup"]');

test("browser: the studio asks for an email after the first export, and only then", async ({
  page,
}) => {
  await openAsAPerson(page);
  await stubSubscribe(page, 200, { status: "added" });
  await page.goto("/");
  await expect(page.locator('[data-slot="toolcraft-runtime-app"]')).toBeVisible();
  await page.waitForTimeout(8_000);

  // Nothing before an export: the card is a thank-you, not a toll gate.
  await expect(card(page)).toHaveCount(0);

  await exportOnce(page);
  await expect(card(page)).toBeVisible({ timeout: 60_000 });

  await card(page).getByLabel("Email address").fill("sam@example.com");
  await card(page).getByRole("button", { name: "Keep me posted" }).click();
  await expect(card(page).getByText(/on the list/u)).toBeVisible({ timeout: 15_000 });
});

test("browser: the studio asks once, and a second export does not ask again", async ({
  page,
}) => {
  await openAsAPerson(page);
  await stubSubscribe(page, 200, { status: "added" });
  await page.goto("/");
  await expect(page.locator('[data-slot="toolcraft-runtime-app"]')).toBeVisible();
  await page.waitForTimeout(8_000);

  await exportOnce(page);
  await expect(card(page)).toBeVisible({ timeout: 60_000 });
  // Dismissed without answering, which still counts as having been asked.
  await card(page).getByRole("button", { name: "Not now" }).click();
  await expect(card(page)).toHaveCount(0);

  await exportOnce(page);
  await page.waitForTimeout(6_000);
  await expect(card(page), "asked twice").toHaveCount(0);

  // And still not after a reload, which is what the promise "only once"
  // actually means to someone who comes back tomorrow.
  await page.reload();
  await page.waitForTimeout(8_000);
  await exportOnce(page);
  await page.waitForTimeout(6_000);
  await expect(card(page)).toHaveCount(0);
});

test("browser: a refused address is reported rather than thanked", async ({ page }) => {
  await openAsAPerson(page);
  // What an unconfigured deployment answers. Showing "you're on the list" here
  // would be the worst failure this feature has: a promise made to someone
  // whose address reached nothing.
  await stubSubscribe(page, 503, { error: "Signup is not configured." });
  await page.goto("/");
  await expect(page.locator('[data-slot="toolcraft-runtime-app"]')).toBeVisible();
  await page.waitForTimeout(8_000);

  await exportOnce(page);
  await expect(card(page)).toBeVisible({ timeout: 60_000 });
  await card(page).getByLabel("Email address").fill("sam@example.com");
  await card(page).getByRole("button", { name: "Keep me posted" }).click();

  await expect(card(page).getByRole("alert")).toHaveText("Signup is not configured.");
  await expect(card(page).getByText(/on the list/u)).toHaveCount(0);
});
