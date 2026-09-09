import { type Locator, type Page } from "@playwright/test";

import { expect, test } from "./toolcraft-product-test";

import { typeSliderValue } from "./mockup-controls";
import { openTimeline, scrubToFraction } from "./mockup-timeline";
import { getToolcraftControlFieldByTarget } from "./browser-control-target-helpers";

/**
 * Editing several keyframes at once, driven the way a person drives them.
 *
 * The arithmetic — what a shifted selection lands on, what a paste replaces —
 * is pinned down against the reducer in `app-timeline-keyframe-selection.test.ts`.
 * This covers the half unit tests cannot see: that a shift-click reaches the
 * reducer as an additive selection, that a drag on one diamond of a selection
 * moves the rest, and that the clipboard keys are bound at all.
 *
 * Every reading is taken from the diamonds' own labels rather than from a
 * snapshot of locators. A keyframe's id is its control and its time, so every
 * operation here re-mints the elements it touches and a held locator goes
 * stale mid-assertion.
 */
type TimelineKeyframe = {
  readonly box: { height: number; width: number; x: number; y: number };
  readonly selected: boolean;
  readonly timeSeconds: number;
};

async function readKeyframes(page: Page): Promise<TimelineKeyframe[]> {
  return page
    .locator('[data-slot="timeline-keyframe"]')
    .evaluateAll((elements) =>
      elements
        .map((element) => {
          const { height, width, x, y } = element.getBoundingClientRect();

          return {
            box: { height, width, x, y },
            selected: element.getAttribute("data-selected") === "true",
            timeSeconds: Number(
              /at ([\d.]+)s/.exec(element.getAttribute("aria-label") ?? "")?.[1],
            ),
          };
        })
        .sort((first, second) => first.timeSeconds - second.timeSeconds),
    );
}

async function clickKeyframe(page: Page, index: number, shift = false): Promise<void> {
  const keyframe = (await readKeyframes(page))[index];

  if (!keyframe) {
    throw new Error(`No keyframe at index ${index}`);
  }

  if (shift) {
    await page.keyboard.down("Shift");
  }

  await page.mouse.click(
    keyframe.box.x + keyframe.box.width / 2,
    keyframe.box.y + keyframe.box.height / 2,
  );

  if (shift) {
    await page.keyboard.up("Shift");
  }

  await page.waitForTimeout(400);
}

/** Three keyframes on Spin, at the start, the middle and near the end. */
async function keySpin(page: Page, spin: Locator): Promise<void> {
  const clear = page.getByRole("button", { name: "Disable Spin keyframes" });

  if (await clear.count()) {
    await clear.first().click();
    await page.waitForTimeout(1_000);
  }

  await scrubToFraction(page, 0);
  await typeSliderValue(spin, 0);
  await page.getByRole("button", { name: "Add Spin keyframe" }).first().click();
  await page.waitForTimeout(1_500);

  for (const [fraction, value] of [
    [0.4, 90],
    [0.7, 180],
  ] as const) {
    await scrubToFraction(page, fraction);
    await typeSliderValue(spin, value);
    await page.waitForTimeout(1_500);
  }
}

test("a shift-click selects a second keyframe and a drag moves both", async ({ page }) => {
  test.setTimeout(420_000);
  await page.goto("/");
  await openTimeline(page);

  const spin = await getToolcraftControlFieldByTarget(page, "device.spin");
  await keySpin(page, spin);

  const built = await readKeyframes(page);
  expect(built.length, "Three edits at three times should leave three keyframes.").toBe(3);

  await clickKeyframe(page, 0);
  expect(
    (await readKeyframes(page)).filter((keyframe) => keyframe.selected),
    "A plain click selects exactly one keyframe.",
  ).toHaveLength(1);

  await clickKeyframe(page, 1, true);
  const selected = (await readKeyframes(page)).filter((keyframe) => keyframe.selected);
  expect(
    selected,
    "Shift-clicking a second keyframe should add it to the selection rather than replace it.",
  ).toHaveLength(2);

  // Drag the first of the two. The second has to come with it, and the gap
  // between them has to survive: a selection that collapses on the way is
  // worse than no selection, because it silently destroys timing that was
  // already right.
  const before = await readKeyframes(page);
  const gapBefore = Number((before[1].timeSeconds - before[0].timeSeconds).toFixed(2));
  await page.mouse.move(
    before[0].box.x + before[0].box.width / 2,
    before[0].box.y + before[0].box.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    before[0].box.x + before[0].box.width / 2 + 90,
    before[0].box.y + before[0].box.height / 2,
    { steps: 14 },
  );
  await page.mouse.up();
  await page.waitForTimeout(900);

  const after = await readKeyframes(page);
  expect(after, "Dragging a selection must not add or lose keyframes.").toHaveLength(3);
  expect(
    Number((after[1].timeSeconds - after[0].timeSeconds).toFixed(2)),
    "Both selected keyframes move by the same amount, so their spacing is unchanged.",
  ).toBe(gapBefore);
  expect(
    after[0].timeSeconds,
    "The dragged selection actually moved.",
  ).toBeGreaterThan(before[0].timeSeconds);
  expect(
    after[2].timeSeconds,
    "The keyframe that was not selected stayed exactly where it was.",
  ).toBe(before[2].timeSeconds);
});

test("the keyboard works on a keyframe picked with the mouse", async ({ page }) => {
  // The way anybody would do it: click the diamond, press the key. Every
  // timeline shortcut lives on the scrubber strip, which is focusable but was
  // never focused by the press that selects a keyframe — the press has to
  // prevent its default for the drag to work, and that is also what stops the
  // button taking focus. So the whole keyboard toolkit was dead unless you
  // happened to tab onto a strip nobody knows is focusable.
  //
  // Nothing caught it because nothing tested it: the reducer had unit tests and
  // the browser covered selection through the mouse, so the mechanism was
  // proven and its reachability never was. This test takes the ordinary route
  // and focuses nothing by hand.
  test.setTimeout(420_000);
  await page.goto("/");
  await openTimeline(page);

  const spin = await getToolcraftControlFieldByTarget(page, "device.spin");
  await keySpin(page, spin);

  const before = (await readKeyframes(page)).map((keyframe) => keyframe.timeSeconds);
  expect(before.length, "three keyframes to work on").toBe(3);

  await clickKeyframe(page, 1);
  expect(
    await page.locator('[data-slot="timeline-keyframe"][data-selected="true"]').count(),
    "clicking a diamond selects it",
  ).toBe(1);

  // Nudge it later, then back, and the row has to follow both times.
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(1_200);
  const nudged = (await readKeyframes(page)).map((keyframe) => keyframe.timeSeconds);

  expect(
    nudged[1],
    `A keyframe picked with the mouse must answer the keyboard: ${before} then ${nudged}.`,
  ).toBeGreaterThan(before[1]!);

  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(1_200);
  expect((await readKeyframes(page)).map((keyframe) => keyframe.timeSeconds)).toEqual(before);

  // And Delete, which is the most obvious thing anyone would press. No second
  // click first: the nudges kept the selection, and clicking the one selected
  // keyframe is how a selection is cleared.
  await page.keyboard.press("Delete");
  await page.waitForTimeout(1_200);

  const remaining = (await readKeyframes(page)).map((keyframe) => keyframe.timeSeconds);
  expect(remaining, "Delete takes the selected keyframe off the row").toEqual([
    before[0]!,
    before[2]!,
  ]);
});

test("a dragged keyframe lands exactly on the playhead", async ({ page }) => {
  test.setTimeout(420_000);
  await page.goto("/");
  await openTimeline(page);

  const spin = await getToolcraftControlFieldByTarget(page, "device.spin");
  await keySpin(page, spin);

  // Park the playhead somewhere no keyframe is, then drop a keyframe near it.
  // Landing on it exactly is the point: at a hundredth of a second, hitting a
  // particular frame by hand is luck, and a loop whose last keyframe misses
  // the end by 0.03s does not stitch.
  await scrubToFraction(page, 0.9);
  await page.waitForTimeout(500);

  const playheadSeconds = await page.evaluate(() => {
    const raw = document
      .querySelector("[data-mockup-timeline]")
      ?.getAttribute("data-mockup-timeline");
    if (!raw) throw new Error("The canvas published no timeline observation.");
    return (JSON.parse(raw) as { timeSeconds?: number }).timeSeconds ?? Number.NaN;
  });
  expect(Number.isFinite(playheadSeconds)).toBe(true);

  // Where a time sits on screen, read off two keyframes whose times are known.
  // Aiming with the ruler's own box instead was wrong: the ruler and the
  // keyframe track carry different left and right insets, so the same fraction
  // of each is a different second.
  const keyframes = await readKeyframes(page);
  const [first, , last] = keyframes;
  const centre = (keyframe: TimelineKeyframe): number => keyframe.box.x + keyframe.box.width / 2;
  const pixelsPerSecond =
    (centre(last) - centre(first)) / (last.timeSeconds - first.timeSeconds);
  // A few pixels short of the playhead, comfortably inside the snap distance.
  const targetX =
    centre(first) + (playheadSeconds - first.timeSeconds) * pixelsPerSecond - 5;

  await page.mouse.move(last.box.x + last.box.width / 2, last.box.y + last.box.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetX, last.box.y + last.box.height / 2, { steps: 14 });
  await page.mouse.up();
  await page.waitForTimeout(900);

  const landed = (await readKeyframes(page)).map((keyframe) => keyframe.timeSeconds);
  expect(
    landed,
    `A keyframe dropped within reach of the playhead at ${playheadSeconds}s should land on it.`,
  ).toContain(Number(playheadSeconds.toFixed(2)));
});
