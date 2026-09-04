import { describe, expect, test } from "vitest";

import { appSchema } from "../app-schema";
import { PANEL_TAB_TARGET } from "../panel-tabs";
import { isTourStepDone, tourSteps } from "./tour-steps";

const SECTIONS = appSchema.panels.controls?.sections ?? [];
const controlsByTarget = new Map(
  SECTIONS.flatMap((section) =>
    Object.values(section.controls).map(
      (control) => [control.target, { control, section }] as const,
    ),
  ),
);

describe("the tour points at controls that exist", () => {
  /**
   * The fault this exists for: a tour step naming a target nothing writes puts
   * a ring around nothing, waits for a value that will never change, and lands
   * on the Next button ten seconds later having taught nobody anything. It
   * fails silently, which is the worst way for a first-run experience to fail.
   */
  test("every step drives a real control", () => {
    const missing = tourSteps
      .filter((step) => step.target !== undefined && !controlsByTarget.has(step.target))
      .map((step) => `${step.action}: nothing in the schema writes "${step.target}"`);

    expect(missing).toEqual([]);
  });

  test("every step's control is reachable from a tab the tour can open", () => {
    for (const step of tourSteps) {
      if (step.target === undefined) continue;
      const found = controlsByTarget.get(step.target);
      const tab = found?.section.visibleWhen;
      // Either the section is on a named tab the tour switches to, or it is on
      // no tab at all and therefore always present. A section gated on
      // something else — a device, a switch — could be absent when the step
      // arrives, and the tour has no way to satisfy that.
      expect(
        tab === undefined || tab.target === PANEL_TAB_TARGET,
        `${step.action}: its section is gated on ${tab?.target}, which the tour cannot open`,
      ).toBe(true);
    }
  });

  /**
   * The canvas step drives the pointer rather than a panel row, so its target
   * is written by dragging the product. It still has to be a real target,
   * because that is what the step waits on.
   */
  test("the step that waits on a drag watches what dragging writes", () => {
    const drag = tourSteps.find((step) => step.spotlight === "canvas");
    expect(drag?.target).toBe("camera.orbit");
    expect(controlsByTarget.get("camera.orbit")?.control.type).toBe("orientationGizmo");
  });
});

describe("knowing when a step is done", () => {
  const step = tourSteps[0];

  test("a value that has not moved is not done", () => {
    const values = { "device.model": "iphone-17-pro-max" };
    expect(isTourStepDone({ current: values, started: values, step })).toBe(false);
  });

  test("a value that has moved is done", () => {
    expect(
      isTourStepDone({
        current: { "device.model": "tshirt" },
        started: { "device.model": "iphone-17-pro-max" },
        step,
      }),
    ).toBe(true);
  });

  /**
   * A file drop stores an object and a pad stores a pair, so "did it change"
   * cannot be an identity check: React hands back a fresh object for the same
   * value on most renders, and every one of those would count as the person
   * having done something.
   */
  test("an equal object is not a change, however it was built", () => {
    const image = { name: "logo.png", url: "blob:abc" };
    expect(
      isTourStepDone({
        current: { "artwork.image": { ...image } },
        started: { "artwork.image": image },
        step: { ...step, target: "artwork.image" },
      }),
    ).toBe(false);
  });

  test("a value arriving where there was none is a change", () => {
    expect(
      isTourStepDone({
        current: { "artwork.image": { url: "blob:abc" } },
        started: {},
        step: { ...step, target: "artwork.image" },
      }),
    ).toBe(true);
  });

  test("the closing step is never done by anything happening in the studio", () => {
    const ask = tourSteps.at(-1);
    expect(ask).toBeDefined();
    expect(
      isTourStepDone({
        current: { "device.model": "tshirt", "artwork.image": { url: "x" } },
        started: {},
        step: ask!,
      }),
    ).toBe(false);
  });
});
