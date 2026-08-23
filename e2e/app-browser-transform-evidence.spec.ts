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
import { pickOption, typeSliderValue } from "./mockup-controls";
import { openTimeline, proveControlKeyframes, settlePicture } from "./mockup-timeline";
import { expectToolcraftProductObservableToChange } from "./product-observable-helpers";
import { test } from "./toolcraft-product-test";

test.setTimeout(1_800_000);

/**
 * The six controls that place the device, proven the way Spin is.
 *
 * They sit in the Device section beside the model and the finish, both of
 * which gate what is on screen, so each of these inherits the same branches:
 * the proof has to hold under every device and every colourway rather than
 * only the one the app happens to open on.
 */
type TransformProof = {
  baseRequirementId: string;
  keyframeValue: number;
  label: string;
  reason: string;
  target: string;
  value: number;
};

const transformProofs: readonly TransformProof[] = [
  {
    baseRequirementId: "device.tilt.lean",
    keyframeValue: 60,
    label: "Tilt",
    reason: "Tilt should pitch the device and redraw the frame.",
    target: "device.tilt",
    value: 45,
  },
  {
    baseRequirementId: "device.roll.cant",
    keyframeValue: 45,
    label: "Roll",
    reason: "Roll should cant the device and redraw the frame.",
    target: "device.roll",
    value: 30,
  },
  {
    baseRequirementId: "device.position-x.slide",
    keyframeValue: 120,
    label: "Position X",
    reason: "Position X should slide the device across the set.",
    target: "device.positionX",
    value: 75,
  },
  {
    baseRequirementId: "device.position-y.lift",
    keyframeValue: 120,
    label: "Position Y",
    reason: "Position Y should lift the device off the floor.",
    target: "device.positionY",
    value: 75,
  },
  {
    baseRequirementId: "device.position-z.depth",
    keyframeValue: 120,
    label: "Position Z",
    reason: "Position Z should move the device through the set.",
    target: "device.positionZ",
    value: 75,
  },
  {
    baseRequirementId: "device.scale.resize",
    keyframeValue: 250,
    label: "Scale",
    reason: "Scale should resize the device in frame.",
    target: "device.scale",
    value: 200,
  },
];

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

for (const proof of transformProofs) {
  const cases = getToolcraftControlApplicabilityCases({
    schema: appSchema,
    sectionInventory: appControlSectionInventory,
    target: proof.target,
  });

  test(`browser: ${proof.label} places the device and keyframes with it`, async ({ page }) => {
    await page.goto("/");
    const session = await createToolcraftBrowserProofSession(page);
    await page.waitForTimeout(4_000);
    await openTimeline(page);

    expect(
      cases.length,
      `${proof.label} should inherit the Device section's branches.`,
    ).toBeGreaterThan(0);

    for (const applicabilityCase of cases) {
      const scoped = getToolcraftApplicabilityRequirementId(
        proof.baseRequirementId,
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
        { baseRequirementId: proof.baseRequirementId, timeoutMs: 30_000 },
      );

      // Switching branches can swap the model, and parsing twenty megabytes of
      // geometry outlasts any fixed wait. The next check asks for a baseline
      // that holds still before the action, so it has to start from a frame
      // that has stopped changing rather than one still arriving.
      await settlePicture(page);

      await expectToolcraftProductObservableToChange(
        session,
        session.controlAction(proof.target, async (control) => {
          await typeSliderValue(control, proof.value);
        }),
        { requirementId: scoped, timeoutMs: 60_000 },
      );

      await proveControlKeyframes(page, session, {
        name: proof.label,
        requirementId: scoped,
        reset: async (control) => {
          await typeSliderValue(control, proof.target === "device.scale" ? 100 : 0);
        },
        setValue: async (control) => {
          await typeSliderValue(control, proof.keyframeValue);
        },
        target: proof.target,
      });
    }
  });
}
