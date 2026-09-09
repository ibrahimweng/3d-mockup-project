import { type Page } from "@playwright/test";

import { expect, test } from "./toolcraft-product-test";

import { typeSliderValue } from "./mockup-controls";
import { openTimeline, scrubToFraction } from "./mockup-timeline";
import { getToolcraftControlFieldByTarget } from "./browser-control-target-helpers";

/**
 * Shaping how motion arrives at a keyframe, driven the way a person drives it.
 *
 * The curve arithmetic is pinned down against the reducer in
 * `app-timeline-keyframe-ease-in.test.ts`. This covers the half unit tests
 * cannot see: that the two sides are reachable in the popover, that the side
 * showing decides which handle a preset writes, and that picking one reaches
 * the frame the canvas actually draws.
 *
 * The spin is read from the transform the canvas publishes rather than from the
 * slider. A keyed control keeps whatever value it was last set to while the
 * frame follows the keyframes, so the slider cannot tell a changed curve from
 * an unchanged one.
 */
async function readSpinAt(page: Page, fraction: number): Promise<number> {
  await scrubToFraction(page, fraction);
  await page.waitForTimeout(700);

  return page.evaluate(() => {
    const raw = document.querySelector<HTMLElement>("[data-mockup-orientation]")?.dataset
      .mockupOrientation;

    if (!raw) {
      throw new Error("The canvas published no observation to read.");
    }

    const spin = (JSON.parse(raw) as { deviceTransform?: { spin?: number } }).deviceTransform
      ?.spin;

    if (typeof spin !== "number") {
      throw new Error(`No spin in the published transform: ${raw.slice(0, 300)}`);
    }

    return spin;
  });
}

/**
 * Put the selection back on a keyframe.
 *
 * Scrubbing clears it — the panel drops the selection on any press that is not
 * on a keyframe — so a reading taken by moving the playhead has to be followed
 * by re-selecting whatever is about to be edited. Read from the diamonds' own
 * labels rather than from held locators, because a keyframe's id is its
 * control and its time and every edit re-mints the elements it touches.
 */
async function selectLastKeyframe(page: Page): Promise<void> {
  const box = await page
    .locator('[data-slot="timeline-keyframe"]')
    .evaluateAll((elements) => {
      const last = elements
        .map((element) => ({
          element,
          timeSeconds: Number(
            /at ([\d.]+)s/.exec(element.getAttribute("aria-label") ?? "")?.[1],
          ),
        }))
        .sort((first, second) => first.timeSeconds - second.timeSeconds)
        .at(-1);
      if (!last) return null;
      const { height, width, x, y } = last.element.getBoundingClientRect();
      return { height, width, x, y };
    });

  if (!box) {
    throw new Error("No keyframe on the track to select.");
  }

  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(500);
}

test("the arriving side of a keyframe curve is reachable and changes the frame", async ({
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

  // Two keyframes, so there is exactly one segment and exactly one arrival to
  // shape. The second is the one something arrives at.
  await scrubToFraction(page, 0);
  await typeSliderValue(spin, 0);
  await page.getByRole("button", { name: "Add Spin keyframe" }).first().click();
  await page.waitForTimeout(1_500);
  await scrubToFraction(page, 0.8);
  await typeSliderValue(spin, 180);
  await page.waitForTimeout(1_500);

  // Three quarters of the way along the segment, under the default curve that
  // settles into its keyframe.
  const restedSpin = await readSpinAt(page, 0.6);

  // That reading moved the playhead, which cleared the selection, and the curve
  // control only exists while a keyframe on the row is selected.
  await selectLastKeyframe(page);

  const curve = page.getByRole("button", { name: /Edit .* keyframe curve/ });
  await expect(
    curve.first(),
    "Selecting a keyframe is what puts its curve control on the row.",
  ).toBeVisible({ timeout: 15_000 });
  await curve.first().click();
  await page.waitForTimeout(800);

  const leaving = page.locator('[data-timeline-easing-side="leaving"]');
  const arriving = page.locator('[data-timeline-easing-side="arriving"]');
  await expect(leaving, "Both sides of the curve should be on offer.").toBeVisible();
  await expect(
    leaving,
    "Leaving is the side shown first, because it is the one that existed before.",
  ).toHaveAttribute("aria-pressed", "true");

  await arriving.click();
  await page.waitForTimeout(500);
  await expect(arriving).toHaveAttribute("aria-pressed", "true");

  // Continuous and Hold describe a whole segment rather than one end of one, so
  // neither is offered while a single handle is being edited.
  await expect(
    page.locator('[data-timeline-easing-kind="continuous"]'),
    "Continuous cannot describe one handle, so it is withheld here.",
  ).toHaveCount(0);
  await expect(page.locator('[data-timeline-easing-kind="hold"]')).toHaveCount(0);
  await expect(
    page.locator("[data-timeline-easing-clear-ease-in]"),
    "Nothing is set yet, so the arrival is still the default.",
  ).toHaveText("Arrival is default");

  // Linear as the arriving handle means the motion runs into the keyframe
  // instead of settling into it, so it covers less ground earlier.
  await page.locator('[data-timeline-easing-kind="linear"]').click();
  await page.waitForTimeout(800);
  await expect(
    page.locator("[data-timeline-easing-clear-ease-in]"),
    "Picking a curve on the arriving side should leave something to clear.",
  ).toHaveText("Default arrival");

  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);

  const chargingSpin = await readSpinAt(page, 0.6);
  expect(
    Math.abs(chargingSpin - restedSpin),
    `The frame at this time should move when the arrival is reshaped: was ${restedSpin}, now ${chargingSpin}.`,
  ).toBeGreaterThan(1);
});
