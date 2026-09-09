import { expect } from "@playwright/test";

import { openTimeline } from "./mockup-timeline";
import { test } from "./toolcraft-product-test";

test.setTimeout(600_000);

/**
 * A duration you cannot read is not a duration.
 *
 * The reducer half is pinned down in `src/app/timeline-duration-edit.test.ts`.
 * What only a browser can show is the half that caused it: the duration field
 * is a contenteditable span, and what it hands over is whatever was typed. The
 * panel used to pass that straight through `Number.parseFloat` into a clamp
 * that answers a `NaN` with the runtime's default of eight seconds — so the
 * edit did not fail, it silently relocated the end of the loop.
 *
 * Proved on a twenty-second loop, because that is where it costs something:
 * eight seconds leaves more than half the move past the end, where the
 * stranded-keyframe markers appear and nothing plays.
 */
test("browser: a duration that cannot be read leaves the loop alone", async ({ page }) => {
  await page.goto("/");
  await openTimeline(page);

  const typeDuration = async (text: string): Promise<void> => {
    await page.getByRole("button", { name: "Edit timeline duration" }).first().click();
    await page.waitForTimeout(400);
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type(text);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(2_000);
  };
  const durationLabel = async (): Promise<string> =>
    (
      await page.getByRole("button", { name: "Edit timeline duration" }).first().textContent()
    )?.trim() ?? "";
  const keyframeTimes = async (): Promise<readonly string[]> =>
    page
      .locator('[data-slot="timeline-keyframe"]')
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("aria-label") ?? "").filter(Boolean),
      );

  // A long loop with a move built to fill it.
  await typeDuration("20");
  await expect
    .poll(durationLabel, { timeout: 20_000 })
    .toBe("20s");

  await page.locator('[data-motion-preset="hero"]').first().click();
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: /Add to timeline/ }).first().click();
  await page.waitForTimeout(3_000);

  const pause = page.getByRole("button", { name: "Pause playback" });
  if (await pause.count()) {
    await pause.first().click();
    await page.waitForTimeout(600);
  }

  const before = await keyframeTimes();

  expect(before.length, "the hero fills the loop").toBeGreaterThan(4);
  await expect(
    page.locator('[data-slot="timeline-keyframes-past-end"]'),
    "nothing is stranded before the typo",
  ).toHaveCount(0);

  // The typo. Anything that does not begin with a digit reaches the same path;
  // a word is the version somebody would actually type.
  await typeDuration("twenty");

  expect(
    await durationLabel(),
    "An unreadable duration must leave the loop the length it was, not set it to the runtime's own default of eight.",
  ).toBe("20s");
  await expect(
    page.locator('[data-slot="timeline-keyframes-past-end"]'),
    "and nothing may be stranded past an end that never moved",
  ).toHaveCount(0);
  expect(await keyframeTimes(), "with every keyframe still where it was").toEqual(before);

  // And a duration that can be read still works, so this is not passing by
  // refusing every edit.
  await typeDuration("9");
  expect(await durationLabel(), "a real number is still honoured").toBe("9s");
});
