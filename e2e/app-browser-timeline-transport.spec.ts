import { expect, test } from "@playwright/test";

import { openTimeline } from "./mockup-timeline";
import { getToolcraftControlFieldByTarget } from "./browser-control-target-helpers";
import { typeSliderValue } from "./mockup-controls";

const readTime = (page: import("@playwright/test").Page) =>
  page.evaluate(() => {
    const el = document.querySelector<HTMLElement>("[data-mockup-timeline]");
    const raw = el?.dataset.mockupTimeline ?? "{}";
    return (JSON.parse(raw) as { timeSeconds?: number }).timeSeconds ?? -1;
  });

/**
 * The transport, driven the way a person drives it.
 *
 * Three of these four were defects rather than missing features, and all three
 * were invisible to a unit test: space dispatched the right command and the
 * playhead did not move, the ruler was not a scrub surface, and the playhead
 * could only be taken hold of by its own two-pixel line. What they have in
 * common is that the state was right and the interaction was not.
 */
test("transport: space plays, the ruler scrubs, step jumps, speed changes", async ({ page }) => {
  test.setTimeout(420_000);
  await page.goto("/");
  await openTimeline(page);

  const spin = await getToolcraftControlFieldByTarget(page, "device.spin");
  await typeSliderValue(spin, 0);
  await page.getByRole("button", { name: "Add Spin keyframe" }).first().click();
  await page.waitForTimeout(1_500);

  // --- the ruler scrubs, from a press nowhere near the playhead ---
  const ruler = page.locator('[data-slot="timeline-expanded-ruler-row"]').first();
  await expect(ruler, "The ruler row should exist as a scrub surface.").toBeVisible();
  const box = (await ruler.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(900);
  const scrubbed = await readTime(page);
  console.log("RULER scrubbed to", scrubbed);
  expect(scrubbed, "A drag on the ruler should move the playhead.").toBeGreaterThan(0.5);

  // --- a second keyframe, then step back to the first ---
  await typeSliderValue(spin, 180);
  await page.waitForTimeout(1_500);
  await page.getByRole("button", { name: "Previous keyframe" }).first().click();
  await page.waitForTimeout(900);
  const stepped = await readTime(page);
  console.log("STEP previous ->", stepped);
  expect(stepped, "Previous keyframe should land on the first keyed time.").toBeLessThan(0.05);

  await page.getByRole("button", { name: "Next keyframe" }).first().click();
  await page.waitForTimeout(900);
  const forward = await readTime(page);
  console.log("STEP next ->", forward);
  expect(forward, "Next keyframe should go forward again.").toBeGreaterThan(stepped);

  // --- speed cycles and is written on the button ---
  const rate = page.locator('[data-slot="timeline-playback-rate"]').first();
  const before = await rate.getAttribute("data-timeline-playback-rate");
  await rate.click();
  await page.waitForTimeout(500);
  const after = await rate.getAttribute("data-timeline-playback-rate");
  console.log("RATE", before, "->", after);
  expect(after, "Pressing the speed control should change the speed.").not.toBe(before);

  // --- space plays, with the pointer resting over the timeline ---
  await page.getByRole("button", { name: "Previous keyframe" }).first().click();
  await page.waitForTimeout(600);
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2);
  await page.locator('[data-slot="timeline-expanded-scrubber"]').first().click({ position: { x: 5, y: 5 } });
  await page.waitForTimeout(400);
  const beforeSpace = await readTime(page);
  await page.keyboard.press("Space");
  await page.waitForTimeout(2_500);
  const afterSpace = await readTime(page);
  console.log("SPACE", beforeSpace, "->", afterSpace);
  expect(
    afterSpace,
    "Space should start playback even with the pointer over the timeline.",
  ).toBeGreaterThan(beforeSpace);
});
