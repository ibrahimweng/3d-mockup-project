import type { Page } from "@playwright/test";

import { expect, test } from "./toolcraft-product-test";
import { countToolcraftControlOwnersByTarget } from "./browser-control-target-helpers";
import { pickOption } from "./mockup-controls";
import { getToolcraftControlFieldByTarget } from "./browser-control-target-helpers";
import { appSchema } from "../src/app/app-schema";

/**
 * Every control the schema declares is still reachable, on whichever tab it
 * sits.
 *
 * Splitting the panel into tabs made a section on another tab absent rather
 * than hidden, and an absent control resolves to zero owners rather than to an
 * invisible one. That is one failure mode with one shape, so it is worth
 * testing directly and exhaustively rather than hoping the two dozen proofs
 * that happen to drive a control between them cover every target. This walks
 * all of them.
 */
test.setTimeout(900_000);

const SECTIONS = appSchema.panels.controls?.sections ?? [];

type Predicate = {
  equals?: unknown;
  notEquals?: unknown;
  notOneOf?: readonly unknown[];
  oneOf?: readonly unknown[];
  target: string;
};

const DEFAULTS: Record<string, unknown> = Object.fromEntries(
  SECTIONS.flatMap((section) =>
    Object.values(section.controls).map((control) => [
      control.target,
      control.defaultValue,
    ]),
  ),
);

function matches(predicate: Predicate, state: Record<string, unknown>): boolean {
  const value = state[predicate.target];

  if ("equals" in predicate) return value === predicate.equals;
  if ("notEquals" in predicate) return value !== predicate.notEquals;
  if ("oneOf" in predicate) return predicate.oneOf?.includes(value) ?? false;
  if ("notOneOf" in predicate) return !predicate.notOneOf?.includes(value);

  return true;
}

/**
 * The targets a product should offer, worked out from the same applicability
 * the panel uses.
 *
 * The state is the schema's own defaults with one device chosen, which is
 * exactly the page this test drives: nothing else has been touched. The orbit
 * gizmo is left out because it is a canvas handle and never renders in the
 * panel at all.
 */
function applicableTargets(device: string): string[] {
  const state = { ...DEFAULTS, "device.model": device };

  return SECTIONS.flatMap((section) =>
    Object.values(section.controls)
      .filter(
        (control) =>
          control.type !== "orientationGizmo" &&
          (control.applicability?.mode !== "conditional" ||
            control.applicability.all.every((predicate) =>
              matches(predicate, state),
            )),
      )
      .map((control) => control.target),
  );
}

async function expectEveryTargetReachable(
  page: Page,
  device: string,
): Promise<void> {
  const targets = applicableTargets(device);
  expect(
    targets.length,
    `${device} should offer controls to reach.`,
  ).toBeGreaterThan(20);

  const unreachable: string[] = [];
  const duplicated: string[] = [];

  for (const target of targets) {
    const owners = await countToolcraftControlOwnersByTarget(page, target);
    if (owners === 0) unreachable.push(target);
    if (owners > 1) duplicated.push(`${target} x${owners}`);
  }

  expect(
    unreachable,
    `${device}: every applicable control must be reachable from some tab.`,
  ).toEqual([]);
  expect(
    duplicated,
    `${device}: no control may render twice across the tabs.`,
  ).toEqual([]);
}

test("browser: every control a product offers is reachable from its tab", async ({
  page,
}) => {
  await page.goto("/");
  await expectEveryTargetReachable(page, "iphone-17-pro-max");

  // A printed product, because it is the half of the catalog whose colour
  // parts, extra uploaders and template sheet are all conditional and none of
  // them appear for a phone.
  const device = await getToolcraftControlFieldByTarget(page, "device.model");
  await pickOption(device, "T-Shirt");
  await expectEveryTargetReachable(page, "tshirt");
});
