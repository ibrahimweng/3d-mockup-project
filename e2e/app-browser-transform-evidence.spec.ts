import { expect, type Locator, type Page } from "@playwright/test";

import { getToolcraftControlApplicabilityCases } from "../src/app/acceptance/control-applicability-cases";
import {
  getToolcraftApplicabilityRequirementId,
  type ToolcraftControlApplicabilityCase,
} from "../src/app/app-acceptance";
import { appAcceptance, appControlSectionInventory } from "../src/app/app-acceptance-data";
import { appSchema } from "../src/app/app-schema";
import { expectToolcraftControlApplicabilityState } from "./browser-control-applicability-evidence";
import { createToolcraftBrowserProofSession } from "./browser-proof-session";
import { pickOption, settleProductRaster, typeSliderValue } from "./mockup-controls";
import {
  clearControlKeyframes,
  openTimeline,
  proveControlKeyframes,
} from "./mockup-timeline";
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
function browserTestNameFor(requirementId: string): string {
  const entry = appAcceptance.find((row) => row.id === requirementId);

  if (!entry?.browserTestName) {
    throw new Error(
      `No acceptance row declares a browser test for "${requirementId}", so no test can satisfy it.`,
    );
  }

  return entry.browserTestName;
}

type TransformProof = {
  baseRequirementId: string;
  keyframeValue: number;
  label: string;
  reason: string;
  resetValue: number;
  target: string;
  value: number;
};

const transformProofs: readonly TransformProof[] = [
  {
    baseRequirementId: "device.tilt.lean",
    keyframeValue: 60,
    label: "Tilt",
    reason: "Tilt should pitch the device and redraw the frame.",
    resetValue: 0,
    target: "device.tilt",
    value: 45,
  },
  {
    baseRequirementId: "device.roll.cant",
    keyframeValue: 45,
    label: "Roll",
    reason: "Roll should cant the device and redraw the frame.",
    resetValue: 0,
    target: "device.roll",
    value: 30,
  },
  {
    baseRequirementId: "device.position-x.slide",
    keyframeValue: 120,
    label: "Position X",
    reason: "Position X should slide the device across the set.",
    resetValue: 0,
    target: "device.positionX",
    value: 75,
  },
  {
    baseRequirementId: "device.position-y.lift",
    keyframeValue: 120,
    label: "Position Y",
    reason: "Position Y should lift the device off the floor.",
    resetValue: 0,
    target: "device.positionY",
    value: 75,
  },
  {
    baseRequirementId: "device.position-z.depth",
    keyframeValue: 120,
    label: "Position Z",
    reason: "Position Z should move the device through the set.",
    resetValue: 0,
    target: "device.positionZ",
    value: 75,
  },
  {
    baseRequirementId: "device.scale.resize",
    keyframeValue: 250,
    label: "Scale",
    reason: "Scale should resize the device in frame.",
    resetValue: 100,
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

  test(browserTestNameFor(proof.baseRequirementId), async ({ page }) => {
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

      // Start each branch from the product's own default rather than from
      // wherever the previous branch left the control keyframed.
      await clearControlKeyframes(page, proof.label);
      await typeSliderValue(
        page.locator(`[data-toolcraft-control-target="${proof.target}"]`).first(),
        proof.resetValue,
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

      // Switching branches can swap the model, and the frame takes five or six
      // seconds to arrive afterwards — longer than the fixed wait the branch
      // selection ends on, and longer than the timeline's own signature takes
      // to stop changing. The next check needs a baseline that holds still, so
      // it waits on the same whole-canvas picture that check reads.
      await settleProductRaster(page);

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
          await typeSliderValue(control, proof.resetValue);
        },
        setValue: async (control) => {
          await typeSliderValue(control, proof.keyframeValue);
        },
        target: proof.target,
      });
    }
  });
}
