import { getToolcraftControlFieldByTarget } from "./browser-control-target-helpers";
import { createToolcraftBrowserProofSession } from "./browser-proof-session";
import { setColor, setSlider } from "./mockup-controls";
import { expectToolcraftProductObservableToChange } from "./product-observable-helpers";
import { test } from "./toolcraft-product-test";

test.setTimeout(120_000);

/**
 * The room around the device.
 *
 * Some of these cannot show what they do on their own — floor roughness has
 * nothing to sharpen until the floor is reflecting something, and backdrop
 * light has nothing to graduate until there is a backdrop. Those are staged
 * first, outside the measured action, so the evidence still belongs to exactly
 * one control.
 */
const set = [
  {
    name: "browser: raising sweep height puts a lit backdrop behind the device",
    requirementId: "backdrop.height.raises",
    target: "backdrop.height",
    to: 70,
  },
  {
    name: "browser: widening sweep curve moves the bend and softens the graduation",
    requirementId: "backdrop.curve.bend",
    stage: { target: "backdrop.height", to: 70 },
    target: "backdrop.curve",
    to: 95,
  },
  {
    name: "browser: raising backdrop light graduates the backdrop instead of leaving it flat",
    requirementId: "backdrop.light.graduates",
    stage: { target: "backdrop.height", to: 70 },
    target: "backdrop.light",
    to: 85,
  },
  {
    name: "browser: raising floor reflection puts the device's reflection under it",
    requirementId: "floor.reflection.mirrors",
    target: "floor.reflection",
    to: 90,
  },
  {
    name: "browser: lowering floor roughness sharpens what the floor returns",
    requirementId: "floor.roughness.finish",
    stage: { target: "floor.reflection", to: 90 },
    target: "floor.roughness",
    to: 6,
  },
  {
    name: "browser: lowering floor room light darkens the floor without dimming the device",
    requirementId: "floor.environment.pickup",
    target: "floor.environment",
    to: 95,
  },
  {
    name: "browser: zoom changes how much of the frame the subject fills and nothing else",
    requirementId: "camera.zoom.crop",
    target: "camera.zoom",
    to: 210,
  },
] as const;

for (const control of set) {
  test(control.name, async ({ page }) => {
    await page.goto("/");
    const session = await createToolcraftBrowserProofSession(page);
    const stage = "stage" in control ? control.stage : undefined;
    if (stage) {
      await setSlider(await getToolcraftControlFieldByTarget(page, stage.target), stage.to);
      await page.waitForTimeout(1_200);
    }
    await expectToolcraftProductObservableToChange(
      session,
      session.controlAction(control.target, async (field) => {
        await setSlider(field, control.to);
      }),
      { requirementId: control.requirementId, timeoutMs: 30_000 },
    );
  });
}

test("browser: changing the background color repaints the ground behind the device", async ({
  page,
}) => {
  await page.goto("/");
  const session = await createToolcraftBrowserProofSession(page);
  await expectToolcraftProductObservableToChange(
    session,
    session.controlAction("scene.background", async (field) => {
      await setColor(field, "#c8532a");
    }),
    { requirementId: "background.color.value", timeoutMs: 30_000 },
  );
});

test("browser: changing the key color tints the lit side", async ({ page }) => {
  await page.goto("/");
  const session = await createToolcraftBrowserProofSession(page);
  await expectToolcraftProductObservableToChange(
    session,
    session.controlAction("light.keyColor", async (field) => {
      await setColor(field, "#2f6bd8");
    }),
    { requirementId: "light.key.color", timeoutMs: 30_000 },
  );
});
