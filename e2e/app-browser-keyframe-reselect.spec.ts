import { expect } from "@playwright/test";

import { openTimeline } from "./mockup-timeline";
import { test } from "./toolcraft-product-test";

test.setTimeout(600_000);

/**
 * Going back to a keyframe has to reopen it, not put it away.
 *
 * The reducer half is in `src/app/app-timeline-keyframe-selection.test.ts`:
 * selecting an already-selected keyframe has always been a plain set. What only
 * a browser can show is the panel that sat on top of it. A plain click used to
 * clear the one selected keyframe — symmetrical with narrowing a larger
 * selection, and wrong in use, because the curve button only exists while
 * something is selected.
 *
 * So the workflow this proves is the one that failed: pick a keyframe, give it
 * a curve, then go back to it to try a different one. That second click used to
 * take the button away, and a third was needed to get back what it removed.
 */
test("browser: clicking a selected keyframe keeps it selected, so its curve can be changed again", async ({
  page,
}) => {
  await page.goto("/");
  await openTimeline(page);

  await page.locator('[data-motion-preset="hero"]').first().click();
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: /Add to timeline/ }).first().click();
  await page.waitForTimeout(3_000);

  const pause = page.getByRole("button", { name: "Pause playback" });
  if (await pause.count()) {
    await pause.first().click();
    await page.waitForTimeout(600);
  }

  const diamond = page.locator('[aria-label="Spin keyframe at 0.00s"]').first();
  const curveButton = page.getByRole("button", { name: /curve/i }).first();
  const selectedLabels = async (): Promise<readonly string[]> =>
    page
      .locator('[data-slot="timeline-keyframe"][data-selected]')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("aria-label") ?? ""));
  const easingOf = async (): Promise<string> =>
    page.evaluate(() => {
      for (const key of Object.keys(localStorage)) {
        try {
          type Timeline = {
            keyframeGroups?: readonly {
              controlId: string;
              keyframes: readonly { easing?: unknown; timeSeconds: number }[];
            }[];
          };
          const stored = JSON.parse(localStorage.getItem(key) ?? "null") as {
            state?: { timeline?: Timeline };
            timeline?: Timeline;
          };
          const timeline = stored?.timeline ?? stored?.state?.timeline;
          const group = timeline?.keyframeGroups?.find(
            (item) => item.controlId === "device.spin",
          );
          const first = group?.keyframes.find((item) => item.timeSeconds === 0);

          if (first) {
            return first.easing ? JSON.stringify(first.easing) : "none";
          }
        } catch {
          // Not the workspace entry.
        }
      }
      return "none";
    });
  const applyEasing = async (kind: string): Promise<void> => {
    await curveButton.click();
    const option = page.locator(`[data-timeline-easing-kind="${kind}"]`).first();
    await option.waitFor({ state: "visible", timeout: 15_000 });
    await option.click();
    await page.waitForTimeout(1_500);
  };

  // One click selects it and the curve button appears.
  await diamond.click();
  await page.waitForTimeout(900);
  await expect(curveButton, "a selected keyframe offers its curve").toBeVisible();

  await applyEasing("linear");
  const afterFirst = await easingOf();

  // The second click on the same keyframe. This is the one that used to clear
  // the selection and take the button with it.
  await diamond.click();
  await page.waitForTimeout(900);

  expect(await selectedLabels(), "it stays selected").toEqual(["Spin keyframe at 0.00s"]);
  await expect(
    curveButton,
    "Going back to a keyframe must reopen its curve rather than deselecting it.",
  ).toBeVisible();

  await applyEasing("hold");
  const afterSecond = await easingOf();

  expect(afterFirst, "the first curve was applied").not.toBe("none");
  expect(afterSecond, "and the second replaced it without an extra click").not.toBe(
    afterFirst,
  );

  // Clearing is still possible; it just is not what a click does.
  await page.evaluate(() => {
    document
      .querySelector<HTMLElement>('[data-slot="timeline-expanded-scrubber"]')
      ?.focus();
  });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(900);

  expect(await selectedLabels(), "Escape still clears the selection").toEqual([]);
});
