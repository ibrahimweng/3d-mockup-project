import { expect } from "@playwright/test";

import { getToolcraftControlFieldByTarget } from "./browser-control-target-helpers";
import { createToolcraftBrowserProofSession } from "./browser-proof-session";
import { setSlider } from "./mockup-controls";
import { settlePicture } from "./mockup-timeline";
import { expectToolcraftProductObservableToChange } from "./product-observable-helpers";
import { test } from "./toolcraft-product-test";

test.setTimeout(120_000);

/**
 * The switch that stops the camera answering the product.
 *
 * Two claims, and they are different in kind, which is why this is not one of
 * the generic "the picture changed" rows in `app-browser-set-evidence`.
 *
 * The first is a claim that nothing happens: switching Auto frame off must
 * leave the picture exactly as it was. That is the promise the switch makes —
 * the camera stops on the frame you were looking at rather than jumping to
 * some neutral one — and the only way to show it is to compare the frame
 * across the toggle and find it unchanged.
 *
 * The second is a claim that something does: with the camera stopped, Size
 * moves the product inside the frame rather than being answered by a camera
 * backing away from it. That one is measured through the protected helper, so
 * it lands as evidence for the requirement.
 */
test("browser: auto frame off holds the frame while the product moves inside it", async ({
  page,
}) => {
  await page.goto("/");
  const session = await createToolcraftBrowserProofSession(page);
  await page.waitForTimeout(6_000);

  const control = await getToolcraftControlFieldByTarget(page, "camera.autoFrame");
  await expect(
    control,
    "Auto frame should be on screen in the Camera section.",
  ).toBeVisible();

  const toggle = control.locator('[role="switch"]').first();
  await expect(
    toggle,
    "Auto frame starts on, which is what makes off a deliberate choice.",
  ).toHaveAttribute("aria-checked", "true");

  // Drawn once and thrown away before measuring, for the same reason the
  // keyframe proof does it: the first frame at a size the renderer has not
  // used before is a warm-up rather than the frame it settles on.
  await settlePicture(page);
  const framed = await settlePicture(page);

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  const held = await settlePicture(page);

  expect(
    held,
    "Switching Auto frame off must hold the frame it was showing, not move to another one.",
  ).toBe(framed);

  // And now the product moves inside that frame. With Auto frame on the camera
  // would back away from a bigger product and largely cancel this.
  await expectToolcraftProductObservableToChange(
    session,
    session.controlAction("device.scale", async (field) => {
      await setSlider(field, 250);
    }),
    { requirementId: "camera.autoFrame.hold", timeoutMs: 30_000 },
  );
});
