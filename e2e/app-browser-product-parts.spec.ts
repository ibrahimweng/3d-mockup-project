import type { Page } from "@playwright/test";

import {
  countToolcraftControlOwnersByTarget,
} from "./browser-control-target-helpers";
import { createToolcraftBrowserProofSession } from "./browser-proof-session";
import { pickOption, setColor } from "./mockup-controls";
import {
  expectToolcraftProductObservableToChange,
  getToolcraftProductObservableSnapshot,
} from "./product-observable-helpers";
import { test } from "./toolcraft-product-test";
import {
  COLOR_PART_IDS,
  DEVICE_CATALOG,
  type ColorPartId,
  type DeviceId,
} from "../src/app/product-domain";

/**
 * Which slots a product declares, read from the catalog rather than listed.
 *
 * Listing them here is how this file went stale: it drove a main colour on the
 * shirt for a while after the shirt stopped having one, and asserted the tote
 * had no trim after the tote gained one. Neither showed up until the proof was
 * run, because a hand-written list cannot disagree with itself.
 */
function declaredSlots(id: DeviceId): readonly ColorPartId[] {
  return COLOR_PART_IDS.filter(
    (part) => DEVICE_CATALOG[id].colorParts?.[part] !== undefined,
  );
}

const SLOT_SWATCHES: Readonly<Record<ColorPartId, string>> = {
  accent: "#2b3a8c",
  main: "#c2382f",
  trim: "#1f6f4a",
};

test.setTimeout(600_000);

/**
 * Wait until the picture stops changing on its own.
 *
 * The shirt is the heaviest model this app carries, and loading one is not a
 * single event: the geometry arrives, the environment is convolved onto it,
 * and the adaptive quality policy drops resolution under that load and climbs
 * back once frames are on time again. Every one of those changes the raster.
 * Asserting a colour changed the picture means nothing until the picture has
 * stopped changing by itself, so this settles first rather than reading a
 * baseline out of the middle of it.
 */
async function settleProductOutput(page: Page): Promise<void> {
  let previous = await getToolcraftProductObservableSnapshot(page);
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await page.waitForTimeout(1_500);
    const next = await getToolcraftProductObservableSnapshot(page);
    if (next === previous) return;
    previous = next;
  }
  throw new Error(
    "Product output never settled, so no colour assertion below could be trusted.",
  );
}

/**
 * Merchandise, where the design is printed rather than displayed.
 *
 * The claim under test is that each colour slot reaches its own part. Proving
 * that a control "does something" is not enough here, because three pickers
 * that all painted the whole product would pass that and be useless: the
 * shirt's body, its sleeves and its collar are three separate answers to three
 * separate questions.
 */
test("browser: each part colour repaints its own part of the product", async ({
  page,
}) => {
  await page.goto("/");
  const session = await createToolcraftBrowserProofSession(page);

  await expectToolcraftProductObservableToChange(
    session,
    session.controlAction("device.model", async (field) => {
      await pickOption(field, "T-Shirt");
    }),
    { requirementId: "device.model.selection", timeoutMs: 90_000 },
  );
  await settleProductOutput(page);

  // Each slot the shirt declares, in turn, each proving it changed the picture
  // on its own. A slot that painted nothing, or one that painted a part
  // another slot already owned, leaves the frame it was given unchanged.
  const slots = declaredSlots("tshirt");
  if (slots.length === 0) {
    throw new Error("The shirt declares no colour slots, so this proves nothing.");
  }
  for (const slot of slots) {
    await expectToolcraftProductObservableToChange(
      session,
      session.controlAction(`product.color.${slot}`, async (field) => {
        await setColor(field, SLOT_SWATCHES[slot]);
      }),
      { requirementId: `product.color.${slot}.repaint`, timeoutMs: 90_000 },
    );
    await settleProductOutput(page);
  }
});

/**
 * The colour slots are declared per product, so a product must offer exactly
 * the pickers it names and no others: a picker that paints nothing is worse
 * than an absent one, because it looks like the control is broken.
 */
test("browser: a product offers only the colour parts it declares", async ({
  page,
}) => {
  await page.goto("/");
  const session = await createToolcraftBrowserProofSession(page);

  // Two products with different slot sets, so this cannot pass by finding the
  // same three pickers every time.
  for (const [id, label] of [
    ["tote-bag", "Tote Bag"],
    ["tshirt", "T-Shirt"],
  ] as const) {
    await expectToolcraftProductObservableToChange(
      session,
      session.controlAction("device.model", async (field) => {
        await pickOption(field, label);
      }),
      { requirementId: "device.model.selection", timeoutMs: 90_000 },
    );

    const declared = new Set(declaredSlots(id));
    for (const slot of COLOR_PART_IDS) {
      const owners = await countToolcraftControlOwnersByTarget(
        page,
        `product.color.${slot}`,
      );
      const expected = declared.has(slot) ? 1 : 0;
      if (owners !== expected) {
        throw new Error(
          `${label} declares ${[...declared].join(", ") || "no slots"}, so ${slot} should have ${expected} picker and has ${owners}.`,
        );
      }
    }
  }
});
