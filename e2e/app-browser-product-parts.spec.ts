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

  // Each slot in turn, each proving it changed the picture on its own. A slot
  // that painted nothing, or one that painted a part another slot already
  // owned, leaves the frame it was given unchanged.
  for (const [target, requirementId, hex] of [
    ["product.color.main", "product.color.main.repaint", "#c2382f"],
    ["product.color.trim", "product.color.trim.repaint", "#1f6f4a"],
    ["product.color.accent", "product.color.accent.repaint", "#2b3a8c"],
  ] as const) {
    await expectToolcraftProductObservableToChange(
      session,
      session.controlAction(target, async (field) => {
        await setColor(field, hex);
      }),
      { requirementId, timeoutMs: 90_000 },
    );
    await settleProductOutput(page);
  }
});

/**
 * The colour slots are declared per product, so a product that has no trim
 * must not offer a trim picker that paints nothing.
 */
test("browser: a product offers only the colour parts it declares", async ({
  page,
}) => {
  await page.goto("/");
  const session = await createToolcraftBrowserProofSession(page);

  await expectToolcraftProductObservableToChange(
    session,
    session.controlAction("device.model", async (field) => {
      await pickOption(field, "Tote Bag");
    }),
    { requirementId: "device.model.selection", timeoutMs: 90_000 },
  );

  // The bag is one material: body and handles are the same surface, so it
  // declares a main colour and nothing else.
  const main = await countToolcraftControlOwnersByTarget(page, "product.color.main");
  const trim = await countToolcraftControlOwnersByTarget(page, "product.color.trim");
  const accent = await countToolcraftControlOwnersByTarget(
    page,
    "product.color.accent",
  );
  if (main !== 1 || trim !== 0 || accent !== 0) {
    throw new Error(
      `Tote Bag is one material, so it declares a main colour and nothing else: main=${main} trim=${trim} accent=${accent}.`,
    );
  }
});
