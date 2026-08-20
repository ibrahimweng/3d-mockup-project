import { expectToolcraftReferenceParity } from "./browser-acceptance-outcome-helpers";
import { getToolcraftControlFieldByTarget } from "./browser-control-target-helpers";
import { createToolcraftBrowserProofSession } from "./browser-proof-session";
import {
  pickOption,
  pickSegment,
  readOptions,
  readSegments,
  setSlider,
  uploadDesign,
} from "./mockup-controls";
import { expectToolcraftProductObservableToChange } from "./product-observable-helpers";
import { test } from "./toolcraft-product-test";

test.setTimeout(180_000);

/**
 * The controls carried over from the reference app.
 *
 * Two claims per test, and they are different claims. The observable change
 * proves the control does something to the rendered picture. The parity check
 * proves the port kept the mapping the reference established — the same set of
 * choices, the same range, the same default — which is the part a rebuild
 * silently gets wrong. Neither is a pixel-level comparison against the
 * reference build, and nothing here should be read as one.
 */

test("browser: each device option renders its own model on the canvas", async ({ page }) => {
  await page.goto("/");
  const session = await createToolcraftBrowserProofSession(page);
  await expectToolcraftProductObservableToChange(
    session,
    session.controlAction("device.model", async (field) => {
      await pickOption(field, "iMac");
    }),
    { requirementId: "device.model.selection", timeoutMs: 45_000 },
  );
  await expectToolcraftReferenceParity(
    async () => readOptions(await getToolcraftControlFieldByTarget(page, "device.model")),
    ["iPhone 17 Pro Max", "MacBook", "iMac", "Mac Studio", "Apple Watch Ultra"],
    { requirementId: "device.model.selection", target: "device.model" },
  );
});

test("browser: each environment relights the device and changes its reflections", async ({
  page,
}) => {
  await page.goto("/");
  const session = await createToolcraftBrowserProofSession(page);
  await expectToolcraftProductObservableToChange(
    session,
    session.controlAction("studio.environment", async (field) => {
      await pickOption(field, "Dark rim");
    }),
    { requirementId: "studio.environment.lighting", timeoutMs: 45_000 },
  );
  await expectToolcraftReferenceParity(
    async () => readOptions(await getToolcraftControlFieldByTarget(page, "studio.environment")),
    ["Studio soft", "Hard key", "Dark rim", "Daylight"],
    { requirementId: "studio.environment.lighting", target: "studio.environment" },
  );
});

test("browser: each fit mode changes how the screenshot meets the display", async ({ page }) => {
  await page.goto("/");
  const session = await createToolcraftBrowserProofSession(page);
  await uploadDesign(await getToolcraftControlFieldByTarget(page, "artwork.image"));
  await page.waitForTimeout(2_500);
  await expectToolcraftProductObservableToChange(
    session,
    session.controlAction("artwork.fit", async (field) => {
      await pickSegment(field, "Fit");
    }),
    { requirementId: "artwork.fit.mode", timeoutMs: 45_000 },
  );
  await expectToolcraftReferenceParity(
    async () => readSegments(await getToolcraftControlFieldByTarget(page, "artwork.fit")),
    ["Fit", "Fill", "Stretch"],
    { requirementId: "artwork.fit.mode", target: "artwork.fit" },
  );
});

test("browser: focal length changes perspective while keeping the device framed", async ({
  page,
}) => {
  await page.goto("/");
  const session = await createToolcraftBrowserProofSession(page);
  await expectToolcraftProductObservableToChange(
    session,
    session.controlAction("camera.focalLength", async (field) => {
      await setSlider(field, 200);
    }),
    { requirementId: "camera.focalLength.framing", timeoutMs: 45_000 },
  );
  // The reference drives the camera from a 36mm full-frame equivalent across
  // this range, which is the mapping the port had to keep.
  await expectToolcraftReferenceParity(
    async () => {
      const field = await getToolcraftControlFieldByTarget(page, "camera.focalLength");
      const input = field.locator("input[type=range]").first();
      return {
        max: await input.getAttribute("max"),
        min: await input.getAttribute("min"),
      };
    },
    { max: "200", min: "24" },
    { requirementId: "camera.focalLength.framing", target: "camera.focalLength" },
  );
});

test("browser: screen scale zooms the image on the display", async ({ page }) => {
  await page.goto("/");
  const session = await createToolcraftBrowserProofSession(page);
  await uploadDesign(await getToolcraftControlFieldByTarget(page, "artwork.image"));
  await page.waitForTimeout(2_500);
  await expectToolcraftProductObservableToChange(
    session,
    session.controlAction("artwork.scale", async (field) => {
      await setSlider(field, 180);
    }),
    { requirementId: "artwork.scale.zoom", timeoutMs: 45_000 },
  );
});
