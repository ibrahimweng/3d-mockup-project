import { type Page } from "@playwright/test";

import { expect, test } from "./toolcraft-product-test";

import { openTimeline, scrubToFraction } from "./mockup-timeline";

test.setTimeout(900_000);

/**
 * Animating where the camera stands.
 *
 * The maths of a swept pose is pinned down against the evaluator in
 * `camera-orbit-keyframes.test.ts`, and where a turn goes — into the value or
 * into a keyframe — is pinned down there too. This is the half that only a
 * browser can answer: that the gesture people actually use reaches the track.
 *
 * It did not, and unit tests could not have caught it. Keying the camera made
 * a row of diamonds, and then dragging the product moved nothing and added
 * nothing, because the drag wrote `state.values` while the renderer had
 * already started reading the timeline instead.
 *
 * The sweep is measured rather than eyeballed. Interpolating a pose component
 * by component pulls the camera towards the product in the middle of a turn —
 * for the turn this test makes, to about four fifths of its distance — so the
 * distance at the midpoint separates a camera going round the product from one
 * cutting across it, and the test computes both and compares.
 */
type Pose = { position: number[]; up: number[] };

/**
 * The pose the renderer drew with, published by the preview onto its canvas.
 *
 * Read from there rather than from the gizmo, because the gizmo shows what the
 * panel holds and the question here is what the picture was drawn from.
 */
async function readPose(page: Page): Promise<Pose> {
  const pose = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>(
      "[data-toolcraft-product-output]",
    );
    const raw = canvas?.dataset.mockupOrientation;

    return raw ? ((JSON.parse(raw) as { pose?: Pose }).pose ?? null) : null;
  });

  if (!pose) {
    throw new Error("The preview published no camera pose to read.");
  }

  return pose;
}

/** The times on the camera's own row, from the diamonds' own labels. */
function readCameraKeyframes(page: Page): Promise<number[]> {
  return page
    .locator('[data-slot="timeline-keyframe"]')
    .evaluateAll((elements) =>
      elements
        .map((element) => element.getAttribute("aria-label") ?? "")
        .filter((label) => label.startsWith("Camera keyframe at "))
        .map((label) => Number(/at ([0-9.]+)s/.exec(label)?.[1] ?? Number.NaN))
        .sort((first, second) => first - second),
    );
}

const distance = (pose: Pose): number =>
  Math.hypot(pose.position[0]!, pose.position[1]!, pose.position[2]!);

/** Where interpolating the numbers straight would have put the camera. */
const halfwayIfLerped = (from: Pose, to: Pose): number =>
  Math.hypot(
    ...[0, 1, 2].map((axis) => (from.position[axis]! + to.position[axis]!) / 2),
  );

async function dragTheProduct(page: Page, pixels: number): Promise<void> {
  const box = await page.locator("[data-toolcraft-product-output]").first().boundingBox();

  if (!box) throw new Error("The product canvas has no box to drag on.");

  // Beside the device rather than on it: the phone's face belongs to the design
  // drag, and the empty space is what this product turns from.
  const startX = box.x + box.width * 0.15;
  const y = box.y + box.height * 0.5;
  await page.mouse.move(startX, y);
  await page.mouse.down();
  for (let step = 1; step <= 12; step += 1) {
    await page.mouse.move(startX + (pixels * step) / 12, y, { steps: 2 });
    await page.waitForTimeout(30);
  }
  await page.mouse.up();
  await page.waitForTimeout(1_800);
}

test("browser: keying the camera makes a drag animate it, and the turn goes round the product", async ({
  page,
}) => {
  // Room for the artboard and the panel at once, as the orbit proof needs.
  await page.setViewportSize({ height: 2000, width: 2600 });
  await page.goto("/");
  await page
    .locator("[data-toolcraft-product-output]")
    .first()
    .waitFor({ state: "visible", timeout: 120_000 });
  await page.waitForTimeout(3_000);
  await openTimeline(page);

  const scene = page.getByRole("tab", { name: /Scene/ });
  if (await scene.count()) {
    await scene.first().click();
    await page.waitForTimeout(800);
  }

  // The camera has no label of its own, so its diamond is on the section
  // header and is named for the section.
  const add = page.getByRole("button", { name: "Add Camera keyframe" });
  await expect(
    add.first(),
    "The Camera section should offer a keyframe diamond, which is what makes the pose animatable at all.",
  ).toBeVisible();

  await scrubToFraction(page, 0);
  await add.first().click();
  await page.waitForTimeout(1_500);

  const start = await readPose(page);
  expect(
    await readCameraKeyframes(page),
    "Keying the camera should put one keyframe on a Camera row.",
  ).toHaveLength(1);

  // Three quarters along, and turn the product by hand.
  await scrubToFraction(page, 0.75);
  await page.waitForTimeout(1_000);
  const beforeDrag = await readPose(page);
  expect(
    distance(beforeDrag),
    "A single keyframe holds, so the pose three quarters along is the one that was keyed.",
  ).toBeCloseTo(distance(start), 6);

  await dragTheProduct(page, 180);

  const end = await readPose(page);
  const times = await readCameraKeyframes(page);

  expect(
    times,
    "Dragging the product while the camera is keyed should key the frame the playhead is on.",
  ).toHaveLength(2);
  expect(times[1]! - times[0]!, "The second keyframe belongs at the playhead.").toBeGreaterThan(4);
  expect(
    Math.hypot(...[0, 1, 2].map((axis) => end.position[axis]! - start.position[axis]!)),
    "The drag has to have moved the camera. It used to move nothing at all, because the value it wrote was not the one being drawn.",
  ).toBeGreaterThan(0.5);

  // Back to the start: the first keyframe still owns its own frame.
  await scrubToFraction(page, 0);
  await page.waitForTimeout(1_200);
  const returned = await readPose(page);
  for (const axis of [0, 1, 2]) {
    expect(returned.position[axis], `axis ${axis}`).toBeCloseTo(start.position[axis]!, 4);
  }

  // And the sweep itself. Halfway between the two keyframes the camera must
  // still be as far from the product as it is at both ends.
  await scrubToFraction(page, (times[0]! + times[1]!) / 2 / 6);
  await page.waitForTimeout(1_200);
  const midpoint = await readPose(page);
  const lerped = halfwayIfLerped(start, end);

  expect(
    distance(midpoint),
    `Going round the product holds the distance: ends ${distance(start)}, midpoint ${distance(midpoint)}.`,
  ).toBeCloseTo(distance(start), 2);
  expect(
    lerped,
    "This turn is wide enough that cutting across it would be visible, which is what makes the previous assertion mean something.",
  ).toBeLessThan(distance(start) * 0.95);
  expect(
    distance(midpoint) - lerped,
    `Interpolating the numbers straight would have put the camera at ${lerped} instead of ${distance(midpoint)}.`,
  ).toBeGreaterThan(0.05);

  // One drag, one undo. Every animation frame of that drag wrote a keyframe,
  // and if each were its own entry a single press would leave the camera at
  // some instant it was only passing through.
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(1_500);
  expect(
    await readCameraKeyframes(page),
    "Undo should take back the whole gesture, leaving the keyframe that was there before it.",
  ).toHaveLength(1);
});
