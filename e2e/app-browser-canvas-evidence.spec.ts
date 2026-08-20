import { expect } from "@playwright/test";

import { expectToolcraftReferenceParity } from "./browser-acceptance-outcome-helpers";
import { getToolcraftControlFieldByTarget } from "./browser-control-target-helpers";
import { createToolcraftBrowserProofSession } from "./browser-proof-session";
import { expectToolcraftCanvasRenderScaleEvidence } from "./browser-render-scale-evidence";
import { setSlider } from "./mockup-controls";
import { expectToolcraftProductObservableToChange } from "./product-observable-helpers";
import { test } from "./toolcraft-product-test";

test.setTimeout(180_000);

const productCanvas = "[data-toolcraft-product-output]";

test("browser: editing canvas width and height resizes the rendered output", async ({ page }) => {
  await page.goto("/");
  const session = await createToolcraftBrowserProofSession(page);

  // The reference shot a portrait frame at this size, which is what the
  // artboard has to open at for a port to be a port.
  await expectToolcraftReferenceParity(
    async () => {
      const canvas = page.locator(productCanvas).first();
      const box = await canvas.boundingBox();
      if (!box) throw new Error("The product canvas has no box.");
      return Math.round((box.width / box.height) * 100) / 100;
    },
    0.8,
    { requirementId: "canvas.sizing.editable-output", target: "canvas.size.width" },
  );

  await expectToolcraftProductObservableToChange(
    session,
    session.controlAction("canvas.size.width", async (field) => {
      const input = field.locator("input").first();
      await input.scrollIntoViewIfNeeded();
      await input.fill("1600");
      await input.press("Enter");
    }),
    { requirementId: "canvas.sizing.editable-output", timeoutMs: 45_000 },
  );

  const box = await page.locator(productCanvas).first().boundingBox();
  expect(box, "The canvas should still be on screen after a resize.").not.toBeNull();
});

test("browser: the WebGL backing follows the selected scale up to the preview ceiling", async ({
  page,
}) => {
  await page.goto("/");
  await createToolcraftBrowserProofSession(page);
  const scaleField = await getToolcraftControlFieldByTarget(page, "canvas.renderScale");
  const selectedScale = await setSlider(scaleField, 2);
  await page.waitForTimeout(2_500);

  await expectToolcraftCanvasRenderScaleEvidence(page, {
    canvasSelector: productCanvas,
    requirementId: "canvas.render-scale.backing",
    selectedScale,
    stateTransitions: [
      {
        run: async () => {
          // Mid-interaction: a drag on the device used to drop the backing.
          const canvas = page.locator(productCanvas).first();
          const box = await canvas.boundingBox();
          if (!box) throw new Error("The product canvas has no box.");
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.mouse.down();
          await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 20, {
            steps: 8,
          });
        },
        state: "interaction",
      },
      {
        run: async () => {
          await page.mouse.up();
          await page.waitForTimeout(2_500);
        },
        state: "steady",
      },
    ],
    target: "canvas.renderScale",
  });
});
