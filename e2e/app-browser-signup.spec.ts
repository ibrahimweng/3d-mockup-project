import type { Page } from "@playwright/test";

import { expect, test } from "./toolcraft-product-test";

/**
 * The gate between a press of Export and the file.
 *
 * It hides from automated sessions, because every proof opens a fresh profile
 * and would otherwise meet a modal in front of every export assertion in the
 * suite. That guard is worked around here rather than removed:
 * `navigator.webdriver` is overridden for this file alone, so the gate behaves
 * as it does for a person while every other proof still never meets it.
 *
 * The endpoint is stubbed. What is under test is the gate — that it holds the
 * export, that skipping is only offered after the wait, that a refused signup
 * still lets the file through, and that a successful one never asks again.
 */
test.setTimeout(600_000);

const gate = (page: Page) => page.locator('[data-slot="mockup-signup"]');
const skip = (page: Page) => page.locator('[data-slot="mockup-signup-skip"]');

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

async function openStudio(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator('[data-slot="toolcraft-runtime-app"]')).toBeVisible();
  await page.waitForTimeout(8_000);
}

test("browser: pressing export asks first, and skipping waits out the read", async ({
  page,
}) => {
  await openAsAPerson(page);
  await stubSubscribe(page, 200, { status: "added" });
  await openStudio(page);

  await page.getByRole("button", { name: "Export PNG" }).click();
  await expect(gate(page)).toBeVisible({ timeout: 30_000 });

  // Refusing is a choice that has to be arrived at, so it is not offered for
  // the first eight seconds.
  await expect(skip(page)).toBeDisabled();
  await expect(skip(page)).toContainText(/Skip in \d+s/u);
  await page.waitForTimeout(9_500);
  await expect(skip(page)).toBeEnabled();
  await expect(skip(page)).toContainText("Skip and export");

  await skip(page).click();
  await expect(gate(page)).toHaveCount(0);
});

test("browser: the keyboard shortcut is gated too", async ({ page }) => {
  await openAsAPerson(page);
  await stubSubscribe(page, 200, { status: "added" });
  await openStudio(page);

  // A gate the keyboard walks around is a gate anyone finds by accident.
  await page.keyboard.press("Control+e");
  await expect(gate(page)).toBeVisible({ timeout: 30_000 });
});

test("browser: giving an address exports, and is never asked for again", async ({
  page,
}) => {
  await openAsAPerson(page);
  await stubSubscribe(page, 200, { status: "added" });
  await openStudio(page);

  await page.getByRole("button", { name: "Export PNG" }).click();
  await expect(gate(page)).toBeVisible({ timeout: 30_000 });
  await gate(page).getByLabel("Email address").fill("sam@example.com");
  await gate(page).getByRole("button", { name: "Continue to export" }).click();
  await expect(gate(page)).toHaveCount(0, { timeout: 20_000 });

  // Never again, in this sitting or the next.
  await page.getByRole("button", { name: "Export PNG" }).click();
  await page.waitForTimeout(4_000);
  await expect(gate(page), "asked twice").toHaveCount(0);

  await page.reload();
  await page.waitForTimeout(8_000);
  await page.getByRole("button", { name: "Export PNG" }).click();
  await page.waitForTimeout(4_000);
  await expect(gate(page), "asked again after a reload").toHaveCount(0);
});

test("browser: a refused signup still lets the export through", async ({ page }) => {
  await openAsAPerson(page);
  // What an unconfigured deployment answers today. Withholding someone's
  // picture because a database is missing is the one failure worth avoiding
  // more than a missed signup.
  await stubSubscribe(page, 503, { error: "Signup is not configured." });
  await openStudio(page);

  await page.getByRole("button", { name: "Export PNG" }).click();
  await expect(gate(page)).toBeVisible({ timeout: 30_000 });
  await gate(page).getByLabel("Email address").fill("sam@example.com");
  await gate(page).getByRole("button", { name: "Continue to export" }).click();

  await expect(gate(page).getByRole("alert")).toContainText("Signup is not configured.");
  await expect(gate(page), "the gate must let go on its own").toHaveCount(0, {
    timeout: 20_000,
  });
});
