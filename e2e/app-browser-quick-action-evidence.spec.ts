import { expect, type Download, type Locator, type Page } from "@playwright/test";

import { appAcceptance } from "../src/app/app-acceptance-data";
import { expectToolcraftAcceptanceOutcome } from "./browser-acceptance-outcome-helpers";
import { createToolcraftBrowserProofSession } from "./browser-proof-session";
import { getToolcraftControlFieldByTarget } from "./browser-control-target-helpers";
import { readOption } from "./mockup-controls";
import { test } from "./toolcraft-product-test";

test.setTimeout(600_000);

/**
 * The palette, proven the way everything else here is: by the requirement it
 * answers rather than by a name written twice. A test whose name has drifted
 * from its acceptance row passes while satisfying nothing, which is the one
 * failure mode a green suite cannot show you.
 */
function browserTestNameFor(requirementId: string): string {
  const entry = appAcceptance.find((row) => row.id === requirementId);

  if (!entry?.browserTestName) {
    throw new Error(
      `No acceptance row declares a browser test for "${requirementId}", so no test can satisfy it.`,
    );
  }

  return entry.browserTestName;
}

const paletteSelector = '[data-slot="quick-action-palette"]';

function palette(page: Page): Locator {
  return page.locator(paletteSelector);
}

async function openPalette(page: Page, key: string): Promise<void> {
  await page.keyboard.press(key);
  await expect(palette(page)).toBeVisible({ timeout: 15_000 });
}

async function describeOutcome(page: Page, text: string): Promise<string> {
  await palette(page).locator("input").fill(text);
  // cmdk re-ranks on the next tick; reading the row before it does reads the
  // previous query's answer, which is how a search test passes while wrong.
  await expect
    .poll(async () => palette(page).locator("[data-quick-action-id]").count(), {
      timeout: 10_000,
    })
    .toBeGreaterThan(0);
  await page.waitForTimeout(250);
  return (
    (await palette(page)
      .locator("[data-quick-action-id]")
      .first()
      .getAttribute("data-quick-action-id")) ?? ""
  );
}

test(browserTestNameFor("quick-actions.describe"), async ({ page }) => {
  await page.goto("/");
  await createToolcraftBrowserProofSession(page);
  await page.waitForTimeout(6_000);

  const finish = await getToolcraftControlFieldByTarget(page, "device.finish");
  expect(await readOption(finish)).toBe("Natural");

  // Opening and dismissing must be free: a palette that changes the scene just
  // by being opened is one people stop opening.
  await openPalette(page, "Meta+k");
  await page.keyboard.press("Escape");
  await expect(palette(page)).toBeHidden({ timeout: 10_000 });
  expect(await readOption(finish)).toBe("Natural");

  await expectToolcraftAcceptanceOutcome(
    async () => readOption(finish),
    async () => {
      await openPalette(page, "Control+k");
      // "gold" is a finish; "make it" is how a person asks for one. Neither the
      // control's label nor its description contains the word.
      const topRow = await describeOutcome(page, "make it gold");
      expect(topRow).toBe("value:device:finish:gold");
      await page.keyboard.press("Enter");
      await expect(palette(page)).toBeHidden({ timeout: 10_000 });
    },
    {
      evidenceType: "command-side-effect",
      requirementId: "quick-actions.describe",
      timeoutMs: 60_000,
    },
  );

  expect(await readOption(finish)).toBe("Gold");

  // The control the palette answered with is left ready to adjust by hand.
  await openPalette(page, "Control+k");
  const softnessRow = await describeOutcome(page, "the shadow is too harsh");
  expect(softnessRow).toBe("control:lights:shadowSoftness");
  await page.keyboard.press("Enter");
  await expect(palette(page)).toBeHidden({ timeout: 10_000 });
  await expect
    .poll(
      async () =>
        page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? ""),
      { timeout: 10_000 },
    )
    .toBe("Shadow softness");
});

test(browserTestNameFor("quick-actions.reach"), async ({ page }) => {
  await page.goto("/");
  await createToolcraftBrowserProofSession(page);
  await page.waitForTimeout(6_000);

  const downloads: Download[] = [];
  page.on("download", (artifact) => downloads.push(artifact));

  await expectToolcraftAcceptanceOutcome(
    async () => downloads.length,
    async () => {
      await openPalette(page, "Control+k");
      // Neither "save" nor "picture" appears on the button; only the concept
      // map connects them to it.
      const topRow = await describeOutcome(page, "save it as a picture");
      expect(topRow).toBe("action:runtime.export:footer:export-png");
      await Promise.all([
        page.waitForEvent("download", { timeout: 300_000 }),
        page.keyboard.press("Enter"),
      ]);
    },
    {
      evidenceType: "command-side-effect",
      requirementId: "quick-actions.reach",
      timeoutMs: 300_000,
    },
  );

  // The palette presses the Deliver button rather than exporting itself, so the
  // artifact is the same one that button produces — including its name.
  expect(downloads).toHaveLength(1);
  expect(downloads[0].suggestedFilename()).toBe("mockup.png");
});
