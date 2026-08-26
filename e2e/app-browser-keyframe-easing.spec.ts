import { expect, test, type Page } from "@playwright/test";

import { typeSliderValue } from "./mockup-controls";
import { openTimeline, scrubToFraction } from "./mockup-timeline";
import { getToolcraftControlFieldByTarget } from "./browser-control-target-helpers";

/**
 * Continuous keyframes, driven the way a person drives them.
 *
 * The maths is pinned down by unit tests against the reducer. This covers the
 * half those cannot see: that the control is reachable, that pressing it
 * changes the keyframe, and that the change reaches the frame being drawn.
 *
 * Two instruments were tried before this one and both were wrong, which is
 * worth knowing before changing it. The slider reads the value the control was
 * last set to, not the value the timeline evaluated, so it sat at 180 the whole
 * way through. And the published pixel signature is sensitive enough that five
 * samples came back five-distinct under an easing that barely moves, so it
 * cannot separate "creeping" from "turning". The device transform the canvas
 * publishes is a number, and it is the number this is about.
 */
/**
 * The spin the product says it drew, at a given point in the loop.
 *
 * Not the slider: a keyed control keeps the value it was last set to, while the
 * frame follows the keyframes. The canvas publishes the device transform it
 * actually drew with, which is the only readout that tells those two apart in
 * a number rather than a hash.
 */
async function readSpinAt(page: Page, fraction: number): Promise<number> {
  await scrubToFraction(page, fraction);
  await page.waitForTimeout(700);

  return page.evaluate(() => {
    const el = document.querySelector<HTMLElement>("[data-mockup-orientation]");
    const raw = el?.dataset.mockupOrientation;
    if (!raw) throw new Error("The canvas published no observation to read.");
    const spin = (JSON.parse(raw) as { deviceTransform?: { spin?: number } }).deviceTransform
      ?.spin;
    if (typeof spin !== "number") {
      throw new Error(`No spin in the published transform: ${raw.slice(0, 300)}`);
    }
    return spin;
  });
}

test("continuous keyframes are reachable and carry the value through the joint", async ({
  page,
}) => {
  test.setTimeout(420_000);
  await page.goto("/");
  await openTimeline(page);

  const spin = await getToolcraftControlFieldByTarget(page, "device.spin");
  const clear = page.getByRole("button", { name: "Disable Spin keyframes" });
  if (await clear.count()) {
    await clear.first().click();
    await page.waitForTimeout(1_000);
  }

  // Three keyframes at an even climb: 0, 90, 180. With the default easing both
  // segments rest at the shared keyframe, so the value barely moves around it.
  await scrubToFraction(page, 0);
  await typeSliderValue(spin, 0);
  await page.getByRole("button", { name: "Add Spin keyframe" }).first().click();
  await page.waitForTimeout(1_500);
  await scrubToFraction(page, 0.5);
  await typeSliderValue(spin, 90);
  await page.waitForTimeout(1_500);
  await scrubToFraction(page, 0.99);
  await typeSliderValue(spin, 180);
  await page.waitForTimeout(1_500);

  const diamonds = page.locator('[data-slot="timeline-keyframe"]');
  await expect(diamonds, "Three keyed times should leave three diamonds.").toHaveCount(3);

  const smoothLow = await readSpinAt(page, 0.42);
  const smoothHigh = await readSpinAt(page, 0.58);
  const smoothSpan = Math.abs(smoothHigh - smoothLow);

  // Select the middle keyframe so its easing control appears.
  await diamonds.nth(1).click();
  await page.waitForTimeout(800);
  const easingButton = page.getByRole("button", { name: "Edit Spin keyframe curve" }).first();
  await expect(
    easingButton,
    "Selecting a keyframe should reveal its easing control on the row.",
  ).toBeVisible({ timeout: 10_000 });
  await easingButton.click();
  await page.waitForTimeout(800);

  // The six named shapes are present, in the words people use for them.
  const kinds = page.locator('[data-slot="timeline-easing-kind"]');
  await expect(kinds, "The popover should offer six named keyframe shapes.").toHaveCount(6);
  for (const label of ["Linear", "Ease In", "Ease Out", "Smooth", "Continuous", "Hold"]) {
    await expect(
      kinds.filter({ hasText: label }),
      `"${label}" should be one of the named shapes.`,
    ).toHaveCount(1);
  }

  await page.locator('[data-timeline-easing-kind="continuous"]').first().click();
  await page.waitForTimeout(1_000);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(800);

  const continuousLow = await readSpinAt(page, 0.42);
  const continuousHigh = await readSpinAt(page, 0.58);
  const continuousSpan = Math.abs(continuousHigh - continuousLow);

  console.log(
    `SPAN smooth=${smoothSpan.toFixed(2)}deg [${smoothLow}..${smoothHigh}] ` +
      `continuous=${continuousSpan.toFixed(2)}deg [${continuousLow}..${continuousHigh}]`,
  );

  // The joint rests under the default easing and carries through under
  // continuous, so the same sixteen per cent of the loop covers much more turn.
  expect(
    continuousSpan,
    "A continuous keyframe should carry the turn through the joint, not rest at it.",
  ).toBeGreaterThan(smoothSpan * 3);

  // And the choice sticks: reopening the popover shows Continuous as the one
  // that is on.
  await diamonds.nth(1).click();
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: "Edit Spin keyframe curve" }).first().click();
  await page.waitForTimeout(800);
  await expect(
    page.locator('[data-slot="timeline-easing-continuous-line"]'),
    "The curve editor should show the continuous line rather than a draggable curve.",
  ).toBeVisible({ timeout: 10_000 });
});
