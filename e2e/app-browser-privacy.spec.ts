import type { Page } from "@playwright/test";

import { expect, test } from "./toolcraft-product-test";

/**
 * The privacy note, and the two ways to reach it.
 *
 * Worth a proof mostly for the routing: it is a client-side route on a static
 * host, so `/privacy` typed straight into the address bar only works because
 * `vercel.json` rewrites everything outside `/api/` to the app. That is exactly
 * the kind of thing that works in development and 404s in production.
 */
test.setTimeout(600_000);

async function openAsAPerson(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
  });
}

test("browser: the privacy note answers the questions it exists to answer", async ({
  page,
}) => {
  await page.goto("/privacy");

  const main = page.locator("main");
  await expect(main).toBeVisible();
  // The claim that matters most, and the one the source is held to by
  // `privacy-claims.test.ts`.
  await expect(main).toContainText("never leave your browser");
  // What is collected, and how to stop.
  await expect(main).toContainText("email address");
  await expect(
    main.getByRole("link", { name: /@/u }),
    "there has to be somewhere to write to",
  ).toBeVisible();
  // And the negative claims, which are the ones people actually want.
  await expect(main).toContainText(/no analytics/iu);
});

test("browser: the note is reachable from the ask and from the help screen", async ({
  page,
}) => {
  await openAsAPerson(page);
  await page.route("**/api/subscribe", async (route) =>
    route.fulfill({
      body: JSON.stringify({ status: "added" }),
      contentType: "application/json",
      status: 200,
    }),
  );
  await page.goto("/");
  await expect(page.locator('[data-slot="toolcraft-runtime-app"]')).toBeVisible();
  await page.waitForTimeout(8_000);

  // Where the promise is made.
  await page.getByRole("button", { name: "Export PNG" }).click();
  const gate = page.locator('[data-slot="mockup-signup"]');
  await expect(gate).toBeVisible({ timeout: 30_000 });
  const fromGate = gate.getByRole("link", { name: "What we do with it" });
  await expect(fromGate).toHaveAttribute("href", "/privacy");
  // A new tab, so a half-typed address and a held export both survive it.
  await expect(fromGate).toHaveAttribute("target", "_blank");

  await page.waitForTimeout(9_500);
  await page.locator('[data-slot="mockup-signup-skip"]').click();
  await expect(gate).toHaveCount(0);

  // And where someone who never presses Export can still find it.
  await page.getByRole("button", { name: "How to use this" }).click();
  const help = page.getByRole("dialog");
  await expect(help).toBeVisible();
  await expect(help.getByRole("link", { name: "Privacy" })).toHaveAttribute(
    "href",
    "/privacy",
  );
});
