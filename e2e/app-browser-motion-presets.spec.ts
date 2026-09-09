import { type Page } from "@playwright/test";

import { expect, test } from "./toolcraft-product-test";

import { getToolcraftControlFieldByTarget } from "./browser-control-target-helpers";
import { pickOption } from "./mockup-controls";
import { openTimeline, scrubToFraction, settlePicture } from "./mockup-timeline";

test.setTimeout(900_000);

/**
 * The sample animations, driven the way somebody would.
 *
 * What each move is made of is pinned down against the reducer in
 * `motion-presets.test.ts` and `apply-motion-preset.test.ts` — the loop closing,
 * the easing on each keyframe, the one command and the one undo. None of that
 * proves the feature exists on screen.
 *
 * This does the part only a browser can: that the picker and its button are
 * reachable where somebody would look for them, that a press fills the timeline
 * with rows a person can then edit, that the picture actually changes across
 * the loop and comes back to itself at the seam, and that two moves compose
 * rather than replacing each other.
 */
async function timelineRows(page: Page): Promise<Record<string, number[]>> {
  return page.evaluate(() =>
    [...document.querySelectorAll('[data-slot="timeline-keyframe"]')]
      .map((node) => node.getAttribute("aria-label") ?? "")
      .reduce<Record<string, number[]>>((all, label) => {
        const match = /^(.+) keyframe at ([0-9.]+)s/.exec(label);

        if (match) {
          (all[match[1]!] ??= []).push(Number(match[2]));
        }

        return all;
      }, {}),
  );
}

/**
 * The value on the first and last diamond of every row.
 *
 * Read from the diamonds' own tooltips, which is the only place the runtime
 * publishes what a keyframe holds — and it is what a person hovering the row
 * would see, so a wrong reading here is a wrong reading they would get too.
 */
async function rowEnds(page: Page): Promise<Record<string, [string, string]>> {
  return page.evaluate(() => {
    const byRow = [...document.querySelectorAll('[data-slot="timeline-keyframe"]')]
      .flatMap((node) => {
        const match = /^(.+) keyframe at ([0-9.]+)s/.exec(node.getAttribute("aria-label") ?? "");

        return match
          ? [{ row: match[1]!, title: node.getAttribute("title") ?? "", at: Number(match[2]) }]
          : [];
      })
      .reduce<Record<string, { at: number; title: string }[]>>((all, item) => {
        (all[item.row] ??= []).push(item);
        return all;
      }, {});

    return Object.fromEntries(
      Object.entries(byRow).map(([row, items]) => {
        const sorted = [...items].sort((first, second) => first.at - second.at);

        return [row, [sorted[0]!.title, sorted[sorted.length - 1]!.title]];
      }),
    );
  });
}

async function pauseIfPlaying(page: Page): Promise<void> {
  const pause = page.getByRole("button", { name: "Pause playback" });

  if (await pause.count()) {
    await pause.first().click();
    await page.waitForTimeout(600);
  }
}

async function applyMotion(page: Page, label: string): Promise<void> {
  await pickOption(await getToolcraftControlFieldByTarget(page, "motion.preset"), label);
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "Add to timeline" }).first().click();
  await page.waitForTimeout(2_000);
  await pauseIfPlaying(page);
}

/** The picture at a moment in the loop, once it has stopped changing. */
async function frameAt(page: Page, fraction: number): Promise<string> {
  await scrubToFraction(page, fraction);
  return settlePicture(page);
}

test("browser: a motion preset lays down keyframes that loop and can then be edited", async ({
  page,
}) => {
  await page.setViewportSize({ height: 2000, width: 2600 });
  await page.goto("/");
  await page
    .locator("[data-toolcraft-product-output]")
    .first()
    .waitFor({ state: "visible", timeout: 120_000 });
  await page.waitForTimeout(3_000);
  await openTimeline(page);

  const picker = await getToolcraftControlFieldByTarget(page, "motion.preset");
  await expect(
    picker,
    "The moves are chosen on the Product tab, beside the product they are chosen for.",
  ).toBeVisible();

  // Nothing is keyed until the button is pressed. Choosing a move must not
  // write anything: browsing the list would otherwise destroy an animation
  // somebody had built, which is the whole reason applying is a press.
  await pickOption(picker, "Sway");
  await page.waitForTimeout(1_200);
  expect(
    await timelineRows(page),
    "Choosing a move writes nothing; the press is what applies it.",
  ).toEqual({});

  // The move this product was given.
  await applyMotion(page, "Hero");
  const hero = await timelineRows(page);

  expect(
    Object.keys(hero).length,
    "A hero is more than one move, so it fills more than one row.",
  ).toBeGreaterThan(1);
  for (const [row, times] of Object.entries(hero)) {
    expect(times.length, `${row} has keyframes to animate between`).toBeGreaterThan(1);
    expect(Math.min(...times), `${row} starts at the top of the loop`).toBe(0);
  }

  // It animates: the picture genuinely differs across the loop.
  const start = await frameAt(page, 0);
  const middle = await frameAt(page, 0.5);
  expect(
    middle,
    "A move that leaves every frame identical is not a move.",
  ).not.toBe(start);

  // And it loops. Not measured as pixels: the scrubber cannot be dragged to the
  // last frame — it stops a fraction short — so comparing pictures there would
  // compare two genuinely different moments and fail on a loop that closes
  // perfectly. What closing means is that every row ends on the value it began
  // on, and the diamonds publish their values in their tooltips.
  for (const [row, [first, last]] of Object.entries(await rowEnds(page))) {
    if (row === "Spin") {
      // The one row allowed to end elsewhere: a whole revolution on is the same
      // direction, which is what a turn has to do to arrive back where it left.
      expect(Number(last) - Number(first), "a turn is exactly one revolution").toBe(360);
      continue;
    }

    expect(last, `${row} has to end on the value it started at, or the loop hitches`).toBe(
      first,
    );
  }

  // A second move adds to the first rather than replacing it, which is what
  // makes the list a vocabulary instead of nine things you can only have one of.
  await applyMotion(page, "Camera arc");
  const composed = await timelineRows(page);

  expect(composed).toHaveProperty("Camera");
  for (const row of Object.keys(hero)) {
    expect(
      composed[row],
      `Adding a camera move must leave ${row} exactly as it was.`,
    ).toEqual(hero[row]);
  }

  // One press of undo takes off exactly the move that was just added.
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(1_800);
  expect(
    await timelineRows(page),
    "One press is one move, so undo gives back the timeline before it.",
  ).toEqual(hero);

  // And None takes the preset's tracks off again.
  await applyMotion(page, "None");
  expect(
    await timelineRows(page),
    "None clears the tracks a preset owns.",
  ).toEqual({});
});

test("browser: each product is given the move that suits it", async ({ page }) => {
  // The claim the tuning table makes, and the one that cannot be checked
  // anywhere but here: Hero is a different animation for different products,
  // and it reaches the timeline as different rows.
  await page.setViewportSize({ height: 2000, width: 2600 });
  await page.goto("/");
  await page
    .locator("[data-toolcraft-product-output]")
    .first()
    .waitFor({ state: "visible", timeout: 120_000 });
  await page.waitForTimeout(3_000);
  await openTimeline(page);

  const rowsFor = async (product: string): Promise<string[]> => {
    await pickOption(await getToolcraftControlFieldByTarget(page, "device.model"), product);
    // A different product is a different model to fetch and frame.
    await page.waitForTimeout(6_000);
    await applyMotion(page, "None");
    await applyMotion(page, "Hero");
    return Object.keys(await timelineRows(page)).sort();
  };

  // A wrap-printed bottle has no front, so the only way to read it is to turn
  // the whole way round.
  const bottle = await rowsFor("Water Bottle");
  expect(bottle).toContain("Spin");

  // An iMac is furniture. It does not turn and it does not fly; the shot comes
  // to it. Whatever else its hero does, it must not be a turn.
  const imac = await rowsFor("iMac");
  expect(
    imac,
    "Nobody turns an iMac around to look at its back, so its hero does not spin it.",
  ).not.toContain("Spin");
  expect(imac).toContain("Zoom");

  expect(
    bottle,
    "Two products given the same rows would mean one of them had not been thought about.",
  ).not.toEqual(imac);
});
