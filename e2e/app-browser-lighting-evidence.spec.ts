import { createToolcraftBrowserProofSession } from "./browser-proof-session";
import { pickOption, setSlider } from "./mockup-controls";
import { expectToolcraftProductObservableToChange } from "./product-observable-helpers";
import { test } from "./toolcraft-product-test";

test.setTimeout(120_000);

/** Every light in the rig, proved by the picture changing when it moves. */
const rig = [
  {
    name: "browser: raising fill brightens the unlit side",
    requirementId: "light.fill.level",
    target: "light.fill",
    to: 180,
  },
  {
    name: "browser: raising rim lights the device's back edge",
    requirementId: "light.rim.level",
    target: "light.rim",
    to: 350,
  },
  {
    name: "browser: lowering shadow softness sharpens the edge of the device's shadow",
    requirementId: "light.shadowSoftness.edge",
    target: "light.shadowSoftness",
    to: 2,
  },
  {
    name: "browser: lowering environment intensity darkens the device's ambient lighting",
    requirementId: "studio.intensity.level",
    target: "studio.intensity",
    to: 260,
  },
] as const;

for (const control of rig) {
  test(control.name, async ({ page }) => {
    await page.goto("/");
    const session = await createToolcraftBrowserProofSession(page);
    await expectToolcraftProductObservableToChange(
      session,
      session.controlAction(control.target, async (field) => {
        await setSlider(field, control.to);
      }),
      { requirementId: control.requirementId, timeoutMs: 30_000 },
    );
  });
}

test("browser: choosing a pattern lays bars of shadow across the floor beside the device", async ({
  page,
}) => {
  await page.goto("/");
  const session = await createToolcraftBrowserProofSession(page);
  await expectToolcraftProductObservableToChange(
    session,
    session.controlAction("light.pattern", async (field) => {
      await pickOption(field, "Blinds");
    }),
    { requirementId: "light.pattern.gobo", timeoutMs: 30_000 },
  );
});

test("browser: choosing an environment relights, refloors and reframes the shot", async ({
  page,
}) => {
  await page.goto("/");
  const session = await createToolcraftBrowserProofSession(page);
  await expectToolcraftProductObservableToChange(
    session,
    session.controlAction("studio.preset", async (field) => {
      await pickOption(field, "Hard light");
    }),
    { requirementId: "studio.preset.applies", timeoutMs: 30_000 },
  );
});
