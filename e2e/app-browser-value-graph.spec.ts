import { expect, test } from "./toolcraft-product-test";

import { typeSliderValue } from "./mockup-controls";
import { openTimeline, scrubToFraction } from "./mockup-timeline";
import { getToolcraftControlFieldByTarget } from "./browser-control-target-helpers";

/**
 * The track drawn as what its value does, driven the way a person drives it.
 *
 * The sampling and the axis arithmetic are pinned down against the runtime in
 * `app-timeline-value-graph.test.ts`. This covers the half unit tests cannot
 * see: that the mode is reachable from the timeline header, that the curve and
 * its points are actually drawn, and that dragging a point writes the value
 * back onto the keyframe rather than adding one beside it.
 */
test("the value graph draws a keyed track and a point can be dragged to a new value", async ({
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

  // Three keyframes that rise and fall, so the curve has a shape a straight
  // line between the ends could not be mistaken for.
  await scrubToFraction(page, 0);
  await typeSliderValue(spin, 0);
  await page.getByRole("button", { name: "Add Spin keyframe" }).first().click();
  await page.waitForTimeout(1_500);

  for (const [fraction, value] of [
    [0.35, 120],
    [0.75, 60],
  ] as const) {
    await scrubToFraction(page, fraction);
    await typeSliderValue(spin, value);
    await page.waitForTimeout(1_500);
  }

  const toggle = page.locator('[data-slot="timeline-graph-mode-toggle"] button');
  await expect(
    toggle,
    "The graph should be reachable from the timeline's own header.",
  ).toBeVisible({ timeout: 15_000 });
  await toggle.first().click();
  await page.waitForTimeout(1_000);

  const graph = page.locator('[data-slot="timeline-value-graph"]');
  await expect(graph, "Switching to graph mode should draw the graph.").toBeVisible();

  const curve = page.locator('[data-slot="timeline-value-graph-curve"]');
  const path = await curve.getAttribute("d");
  expect(
    (path ?? "").length,
    "The curve is sampled across the window, so its path is many points rather than three.",
  ).toBeGreaterThan(200);

  const points = page.locator('[data-slot="timeline-value-graph-point"]');
  await expect(points, "Every keyframe on the track gets a point.").toHaveCount(3);

  // The axis fits the keyed values rather than the control's whole range, so a
  // track keyed between 0 and 120 must not be drawn against 0..360.
  const highest = Number(
    (await page.locator('[data-slot="timeline-value-graph-max"]').textContent()) ?? "",
  );
  expect(highest).toBeGreaterThan(120);
  expect(highest).toBeLessThan(200);

  const before = await points.nth(1).getAttribute("aria-label");
  const box = await points.nth(1).boundingBox();

  if (!box) {
    throw new Error("The middle point has no box to drag.");
  }

  // Drag it down the frame. Down is a smaller value, and the label carries the
  // value, so the assertion does not depend on reading the slider — which keeps
  // whatever it was last set to rather than following the keyframes.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 40, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(1_000);

  await expect(
    points,
    "Dragging a point changes a keyframe rather than adding one.",
  ).toHaveCount(3);

  const after = await points.nth(1).getAttribute("aria-label");
  expect(after, `The dragged point should hold a new value: was "${before}".`).not.toBe(before);

  const valueOf = (label: string | null): number =>
    Number(/value (-?[\d.]+)/.exec(label ?? "")?.[1]);
  expect(
    valueOf(after),
    "Dragging down the frame lowers the value, because the axis runs upwards.",
  ).toBeLessThan(valueOf(before));

  // The time did not move: the graph edits value only, and time keeps its home
  // on the diamond row where a drag snaps and can carry a whole selection.
  const timeOf = (label: string | null): string => /at ([\d.]+)s/.exec(label ?? "")?.[1] ?? "";
  expect(timeOf(after), "A value drag must not retime the keyframe.").toBe(timeOf(before));
});
