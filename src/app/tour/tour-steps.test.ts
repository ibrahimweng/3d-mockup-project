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
  const nothingYet = { mediaCount: 0, values: {} };

  test("a value that has not moved is not done", () => {
    const seen = { mediaCount: 0, values: { "device.model": "iphone-17-pro-max" } };
    expect(isTourStepDone({ current: seen, started: seen, step })).toBe(false);
  });

  test("a value that has moved is done", () => {
    expect(
      isTourStepDone({
        current: { mediaCount: 0, values: { "device.model": "tshirt" } },
        started: { mediaCount: 0, values: { "device.model": "iphone-17-pro-max" } },
        step,
      }),
    ).toBe(true);
  });

  /**
   * A pad stores a pair and a preset writes a dozen values at once, so "did it
   * change" cannot be an identity check: React hands back a fresh object for
   * the same value on most renders, and every one of those would count as the
   * person having done something.
   */
  test("an equal object is not a change, however it was built", () => {
    const offset = { x: 0.2, y: -0.4 };
    expect(
      isTourStepDone({
        current: { mediaCount: 0, values: { "camera.framing": { ...offset } } },
        started: { mediaCount: 0, values: { "camera.framing": offset } },
        step: { ...step, target: "camera.framing" },
      }),
    ).toBe(false);
  });

  /**
   * The upload step, which is the one that cannot watch a value at all.
   * Measured in the browser: an upload leaves `values` untouched — the file
   * drop's target is not a key in it before or after — and shows up in
   * `state.mediaAssets` four to nine seconds later, once the image is decoded.
   */
  describe("the step that asks for a design", () => {
    const upload = tourSteps.find((candidate) => candidate.watch === "media");

    test("there is one, and it is the design step", () => {
      expect(upload?.target).toBe("artwork.image");
    });

    test("an empty studio is not done", () => {
      expect(
        isTourStepDone({ current: nothingYet, started: nothingYet, step: upload! }),
      ).toBe(false);
    });

    test("a design arriving is done", () => {
      expect(
        isTourStepDone({
          current: { mediaCount: 1, values: {} },
          started: nothingYet,
          step: upload!,
        }),
      ).toBe(true);
    });

    /**
     * And it counts up rather than comparing, so a value moving elsewhere in
     * the studio while the image is still decoding does not skip the step.
     */
    test("something else changing does not stand in for a design", () => {
      expect(
        isTourStepDone({
          current: { mediaCount: 0, values: { "device.spin": 40 } },
          started: nothingYet,
          step: upload!,
        }),
      ).toBe(false);
    });
  });

  /**
   * The canvas step, which teaches that the picture answers the pointer. This
   * canvas has more than one gesture on it and the step counts any of them,
   * because a person who found a different one from the one the copy named has
   * still learned the thing.
   */
  describe("the step that asks for a drag", () => {
    const drag = tourSteps.find((candidate) => candidate.spotlight === "canvas");

    test("turning the product counts", () => {
      expect(
        isTourStepDone({
          current: { mediaCount: 0, values: { "camera.orbit": { position: [1, 0, 0] } } },
          started: { mediaCount: 0, values: { "camera.orbit": { position: [0, 0, 1] } } },
          step: drag!,
        }),
      ).toBe(true);
    });

    /**
     * Measured on a tote: a drag through the middle of the picture lands on
     * the printed face and moves the design rather than turning the product —
     * and the middle is where someone told to drag the product will grab it.
     */
    test("moving the design counts too", () => {
      expect(
        isTourStepDone({
          current: { mediaCount: 0, values: { "artwork.offset": { x: 0.2, y: 0 } } },
          started: { mediaCount: 0, values: { "artwork.offset": { x: 0, y: 0 } } },
          step: drag!,
        }),
      ).toBe(true);
    });

    test("a panel control moving does not", () => {
      expect(
        isTourStepDone({
          current: { mediaCount: 0, values: { "device.spin": 40 } },
          started: { mediaCount: 0, values: { "device.spin": 0 } },
          step: drag!,
        }),
      ).toBe(false);
    });
  });

  test("the closing step is never done by anything happening in the studio", () => {
    const ask = tourSteps.at(-1);
    expect(ask).toBeDefined();
    expect(
      isTourStepDone({
        current: { mediaCount: 3, values: { "device.model": "tshirt" } },
        started: nothingYet,
        step: ask!,
      }),
    ).toBe(false);
  });
});
