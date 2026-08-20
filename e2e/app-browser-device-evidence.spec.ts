import { createToolcraftBrowserProofSession } from "./browser-proof-session";
import { pickOption, readOption, setSlider } from "./mockup-controls";
import { expectToolcraftProductObservableToChange } from "./product-observable-helpers";
import { test } from "./toolcraft-product-test";

test.setTimeout(120_000);

test("browser: each finish repaints the device body and leaves the display alone", async ({
  page,
}) => {
  await page.goto("/");
  const session = await createToolcraftBrowserProofSession(page);
  await expectToolcraftProductObservableToChange(
    session,
    session.controlAction("device.finish", async (control) => {
      const current = await readOption(control);
      await pickOption(control, current === "Natural" ? "Graphite" : "Natural");
    }),
    { requirementId: "device.finish.colorway", timeoutMs: 30_000 },
  );
});

test("browser: each surface replaces the endless floor with a slab of that material", async ({
  page,
}) => {
  await page.goto("/");
  const session = await createToolcraftBrowserProofSession(page);
  await expectToolcraftProductObservableToChange(
    session,
    session.controlAction("surface.kind", async (control) => {
      await pickOption(control, "Stone");
    }),
    { requirementId: "surface.kind.material", timeoutMs: 30_000 },
  );
});

test("browser: raising the key brightens the lit side and deepens the contact shadow", async ({
  page,
}) => {
  await page.goto("/");
  const session = await createToolcraftBrowserProofSession(page);
  await expectToolcraftProductObservableToChange(
    session,
    session.controlAction("light.keyIntensity", async (control) => {
      await setSlider(control, 320);
    }),
    { requirementId: "light.key.intensity", timeoutMs: 30_000 },
  );
});
