import { expect } from "@playwright/test";

import { appSchema } from "../src/app/app-schema";
import {
  getToolcraftControlFieldByTarget,
  getToolcraftControlLabelByTarget,
} from "./browser-control-target-helpers";
import { pickOption } from "./mockup-controls";
import { test } from "./toolcraft-product-test";
import {
  COLOR_PART_IDS,
  DEVICE_CATALOG,
  type ColorPartId,
  type DeviceId,
} from "../src/app/product-domain";

// Walking the panel means loading a model and convolving an environment first,
// and the colour proof does it once per product that declares a colour.
test.setTimeout(600_000);

const SECTIONS = appSchema.panels.controls?.sections ?? [];

/** Every control of a type, with the id it would fall back to if unnamed. */
function controlsOfType(type: string): { id: string; target: string }[] {
  return SECTIONS.flatMap((section) =>
    Object.entries(section.controls)
      .filter(([, control]) => control.type === type)
      .map(([id, control]) => ({ id, target: control.target })),
  );
}

function declaredSlots(id: DeviceId): readonly ColorPartId[] {
  return COLOR_PART_IDS.filter(
    (part) => DEVICE_CATALOG[id].colorParts?.[part] !== undefined,
  );
}

/** Every product the model picker offers, with the label it offers it under. */
const MODEL_OPTIONS = (
  SECTIONS.flatMap((section) => Object.values(section.controls)).find(
    (control) => control.target === "device.model",
  )?.options ?? []
) as readonly { label: string; value: string }[];

/**
 * A pad shows whatever name it is handed, and an unnamed control resolves to
 * its own id, so this is what a missing label looks like from outside: the
 * framing pad read "framing" in lowercase under a FRAMING heading and the key
 * light's read "keyDirection", in the panel and in the accessible name both.
 *
 * Read off the schema rather than listed, so a pad added later is covered by
 * this without anyone remembering to add it.
 */
test("browser: every pad is drawn under a name rather than its own variable", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator('[data-slot="toolcraft-runtime-app"]')).toBeVisible();

  const pads = controlsOfType("vector");
  expect(
    pads.length,
    "The schema should declare pads for this to check.",
  ).toBeGreaterThan(0);

  for (const pad of pads) {
    const label = getToolcraftControlLabelByTarget(pad.target);
    expect(
      label,
      `The label for ${pad.target} must not be the control id a missing one falls back to.`,
    ).not.toBe(pad.id);

    const field = await getToolcraftControlFieldByTarget(page, pad.target);

    // The name a screen reader announces.
    await expect(
      field.locator('[aria-label$="X/Y pad"]').first(),
      `The pad for ${pad.target} must be announced by its label.`,
    ).toHaveAttribute("aria-label", `${label} X/Y pad`);

    // And the name printed above it.
    await expect(
      field.locator('[data-slot="field-label"]').first(),
      `The pad for ${pad.target} must be printed under its label.`,
    ).toHaveText(label);
  }
});

/**
 * A section holding nothing but colours is drawn as a bank of swatches with
 * every per-swatch label suppressed, which is how a shirt came to show one
 * anonymous square where the schema said Accent, and a bottle three where it
 * said Product, Trim and Accent. What is asserted here is the thing a person
 * can see: each colour a product declares is printed under its own name.
 *
 * Every product that declares a colour, not a chosen pair. A product with one
 * slot is the case the shirt failed at, and a product with three is the one
 * where the names have to tell siblings apart, and both are in the catalog.
 */
test("browser: every colour a product declares is drawn under its own name", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator('[data-slot="toolcraft-runtime-app"]')).toBeVisible();

  const coloured = MODEL_OPTIONS.filter(
    (option) => declaredSlots(option.value as DeviceId).length > 0,
  );
  const mostSlots = Math.max(
    ...coloured.map((option) => declaredSlots(option.value as DeviceId).length),
  );
  expect(
    mostSlots,
    "Some product must declare sibling colours, or this proves only that one swatch is named.",
  ).toBeGreaterThan(1);

  for (const option of coloured) {
    await pickOption(
      await getToolcraftControlFieldByTarget(page, "device.model"),
      option.label,
    );
    // The panel re-renders on the state change rather than on the model
    // arriving, but the model arriving re-renders it again, so let it land.
    await page.waitForTimeout(6_000);

    for (const slot of declaredSlots(option.value as DeviceId)) {
      const target = `product.color.${slot}`;
      const label = getToolcraftControlLabelByTarget(target);
      const field = await getToolcraftControlFieldByTarget(page, target);

      await expect(
        field.locator('[data-slot="field-label"]').first(),
        `${option.label} must name its ${slot} colour rather than showing a bare swatch.`,
      ).toHaveText(label);
    }
  }
});
