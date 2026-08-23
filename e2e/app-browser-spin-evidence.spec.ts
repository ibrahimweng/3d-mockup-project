import { expect, type Locator, type Page } from "@playwright/test";

import { getToolcraftControlApplicabilityCases } from "../src/app/acceptance/control-applicability-cases";
import {
  getToolcraftApplicabilityRequirementId,
  type ToolcraftControlApplicabilityCase,
} from "../src/app/app-acceptance";
import { appControlSectionInventory } from "../src/app/app-acceptance-data";
import { appSchema } from "../src/app/app-schema";
import { expectToolcraftControlApplicabilityState } from "./browser-control-applicability-evidence";
import { createToolcraftBrowserProofSession } from "./browser-proof-session";
import { pickOption, setSlider } from "./mockup-controls";
import { openTimeline, proveControlKeyframes } from "./mockup-timeline";
import { expectToolcraftProductObservableToChange } from "./product-observable-helpers";
import { test } from "./toolcraft-product-test";

test.setTimeout(1_800_000);

/**
 * Spin sits in the Device section, so it inherits that section's branches.
 *
 * Model and finish both gate controls there, which makes Spin's proof a matrix
 * rather than a single case: it has to stay on screen, keep driving the picture
 * and keep keyframing under every device and every colourway, not only the one
 * the app happens to open on.
 */
const spinCases = getToolcraftControlApplicabilityCases({
  schema: appSchema,
  sectionInventory: appControlSectionInventory,
  target: "device.spin",
});

async function selectBranch(
  page: Page,
  applicabilityCase: ToolcraftControlApplicabilityCase,
  control: Locator,
): Promise<void> {
  const label =
    applicabilityCase.selectorOptionLabel ?? String(applicabilityCase.selectorValue);
  if (applicabilityCase.selectorControlType === "select") {
    await pickOption(control, label);
    return;
  }
  await control.getByRole("button", { name: label }).first().click();
  await page.waitForTimeout(1_500);
}

/**
 * Turning the device, as opposed to walking around it.
 *
 * Orbit moves the camera; spin moves the subject. The two look alike in a still
 * frame, so what separates them is the light: orbiting carries the lit side
 * with the camera, while spinning leaves the light where it is and drags the
 * lit side around the device. The camera pose is published by the product, so
 * "the camera held still" is read rather than assumed.
 */
test("browser: spin turns the device on the spot and the camera holds still", async ({
  page,
}) => {
  await page.goto("/");
  const session = await createToolcraftBrowserProofSession(page);
  await page.waitForTimeout(4_000);
  await openTimeline(page);

  const readPose = () =>
    page.evaluate(() => {
      const raw =
        document
          .querySelector("[data-mockup-orientation]")
          ?.getAttribute("data-mockup-orientation") ?? "{}";
      return JSON.stringify((JSON.parse(raw) as { pose?: unknown }).pose ?? null);
    });

  expect(
    spinCases.length,
    "Spin should inherit the Device section's branches.",
  ).toBeGreaterThan(0);

  for (const applicabilityCase of spinCases) {
    const scoped = getToolcraftApplicabilityRequirementId(
      "device.spin.turn",
      applicabilityCase,
    );

    await expectToolcraftControlApplicabilityState(
      session,
      session.targetAction(applicabilityCase.selectorTarget, async (current) => {
        await selectBranch(
          current,
          applicabilityCase,
          current
            .locator(`[data-toolcraft-control-target="${applicabilityCase.selectorTarget}"]`)
            .first(),
        );
        await current.waitForTimeout(3_000);
      }),
      applicabilityCase,
      { baseRequirementId: "device.spin.turn", timeoutMs: 30_000 },
    );

    const poseBefore = await readPose();
    await expectToolcraftProductObservableToChange(
      session,
      session.controlAction("device.spin", async (control) => {
        await setSlider(control, 90);
      }),
      { requirementId: scoped, timeoutMs: 60_000 },
    );
    expect(
      await readPose(),
      "Spinning the device must not move the camera that is looking at it.",
    ).toBe(poseBefore);

    await proveControlKeyframes(page, session, {
      name: "Spin",
      requirementId: scoped,
      reset: async (control) => {
        await setSlider(control, 0);
      },
      setValue: async (control) => {
        await setSlider(control, 180);
      },
      target: "device.spin",
    });
  }
});
