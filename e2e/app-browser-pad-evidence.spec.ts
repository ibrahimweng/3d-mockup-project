import { expectToolcraftReferenceParity } from "./browser-acceptance-outcome-helpers";
import { getToolcraftControlFieldByTarget } from "./browser-control-target-helpers";
import {
  createToolcraftBrowserProofSession,
  readToolcraftBrowserObservation,
} from "./browser-proof-session";
import { expectToolcraftCompoundControlPartOutcome } from "./browser-state-evidence-helpers";
import { padHandleFor, padHandles, setPad, setSlider, uploadDesign } from "./mockup-controls";
import { expectToolcraftProductObservableToChange } from "./product-observable-helpers";
import { test } from "./toolcraft-product-test";

test.setTimeout(180_000);

/**
 * The X/Y pads, one axis at a time.
 *
 * A pad is one control carrying two values, so proving it works means proving
 * each axis separately: the compound-control evidence is keyed per part. What
 * is read back is the pad's own handle position, which the control writes as a
 * custom property from the value it holds — the one observable that says where
 * the control thinks it is rather than where the click landed.
 */
const pads = [
  {
    name: "browser: moving the key direction pad rakes the light and swings the shadow",
    padLabel: "keyDirection",
    requirementId: "light.key.direction",
    target: "light.keyDirection",
  },
  {
    name: "browser: the framing pad moves the subject off centre with verticals still upright",
    padLabel: "framing",
    requirementId: "camera.framing.shift",
    target: "camera.framing",
  },
  {
    name: "browser: screen stretch distorts the image along one axis",
    needsDesign: true,
    padLabel: "Stretch",
    requirementId: "artwork.stretch.axes",
    target: "artwork.stretch",
  },
] as const;

for (const pad of pads) {
  test(pad.name, async ({ page }) => {
    await page.goto("/");
    const session = await createToolcraftBrowserProofSession(page);
    if ("needsDesign" in pad && pad.needsDesign) {
      await uploadDesign(await getToolcraftControlFieldByTarget(page, "artwork.image"));
      await page.waitForTimeout(2_500);
    }
    const handles = session.observe(padHandles);

    await expectToolcraftProductObservableToChange(
      session,
      session.controlAction(pad.target, async (field) => {
        await setPad(field, 0.7, -0.4);
      }),
      { requirementId: pad.requirementId, timeoutMs: 45_000 },
    );

    for (const [part, x, y] of [
      ["vector.x", 0.6, 0],
      ["vector.y", 0, 0.6],
    ] as const) {
      const before = await readToolcraftBrowserObservation(handles);
      await expectToolcraftCompoundControlPartOutcome(
        handles,
        session.controlAction(pad.target, async (field) => {
          await setPad(field, x, y);
        }),
        { ...before, [pad.padLabel]: await padHandleFor(page, pad.padLabel, x, y) },
        { part, requirementId: pad.requirementId },
      );
    }
  });
}

test("browser: screen position, scale and stretch move the image inside the display", async ({
  page,
}) => {
  await page.goto("/");
  const session = await createToolcraftBrowserProofSession(page);
  await uploadDesign(await getToolcraftControlFieldByTarget(page, "artwork.image"));
  await page.waitForTimeout(2_500);
  // Position only has somewhere to go once something is cropped, so the design
  // is zoomed past the display first.
  await setSlider(await getToolcraftControlFieldByTarget(page, "artwork.scale"), 170);
  await page.waitForTimeout(1_500);

  const handles = session.observe(padHandles);

  await expectToolcraftProductObservableToChange(
    session,
    session.controlAction("artwork.offset", async (field) => {
      await setPad(field, 0.7, -0.5);
    }),
    { requirementId: "artwork.placement.transform", timeoutMs: 45_000 },
  );

  for (const [part, x, y] of [
    ["vector.x", 0.6, 0],
    ["vector.y", 0, 0.6],
  ] as const) {
    const before = await readToolcraftBrowserObservation(handles);
    await expectToolcraftCompoundControlPartOutcome(
      handles,
      session.controlAction("artwork.offset", async (field) => {
        await setPad(field, x, y);
      }),
      { ...before, Position: await padHandleFor(page, "Position", x, y) },
      { part, requirementId: "artwork.placement.transform" },
    );
  }

  // The reference remaps the display texture with these three and nothing else,
  // so all three are on the screenshot's own panel rather than the camera's.
  await expectToolcraftReferenceParity(
    async () =>
      Promise.all(
        ["artwork.offset", "artwork.scale", "artwork.stretch"].map(async (target) =>
          (await getToolcraftControlFieldByTarget(page, target)).isVisible(),
        ),
      ),
    [true, true, true],
    { requirementId: "artwork.placement.transform", target: "artwork.offset" },
  );
});
