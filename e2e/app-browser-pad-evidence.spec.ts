import { expectToolcraftReferenceParity } from "./browser-acceptance-outcome-helpers";
import { getToolcraftControlFieldByTarget } from "./browser-control-target-helpers";
import {
  createToolcraftBrowserProofSession,
  readToolcraftBrowserObservation,
} from "./browser-proof-session";
import { expectToolcraftCompoundControlPartOutcome } from "./browser-state-evidence-helpers";
import {
  padHandleFor,
  padHandles,
  pickOption,
  setPad,
  setSlider,
  subjectBox,
  subjectShape,
  uploadDesign,
} from "./mockup-controls";
import { expectToolcraftProductObservableToChange } from "./product-observable-helpers";
import { test } from "./toolcraft-product-test";
import { expect, type Page } from "@playwright/test";

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
    shiftsWithoutReshaping: true,
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

    if ("shiftsWithoutReshaping" in pad && pad.shiftsWithoutReshaping) {
      await expectSubjectToShiftWithoutReshaping(page, pad.target);
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

/** Wait for the preview to stop changing, so a frame is finished before it is measured. */
async function settledFrame(page: Page): Promise<Buffer> {
  const canvas = page.locator("[data-toolcraft-product-output]").first();
  let previous: Buffer | null = null;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const shot = await canvas.screenshot();
    if (previous && Buffer.compare(previous, shot) === 0) return shot;
    previous = shot;
    await page.waitForTimeout(400);
  }
  if (!previous) throw new Error("The preview never produced a frame.");
  return previous;
}

/**
 * The framing pad slides the picture; it does not restretch it.
 *
 * This is the claim the acceptance row makes — the projection is shifted
 * rather than the camera turned — and until now nothing measured it. The test
 * around it only proved that *something* about the output changed, and a scene
 * squashed to two thirds of its width is certainly something changing.
 *
 * Which is what was happening. `setViewOffset` takes the full size of the
 * frame it is windowing and assigns `camera.aspect` from it, so handing it a
 * unit square projected a square picture into whatever shape the canvas
 * actually was.
 *
 * The proof is that the subject's shape does not depend on the shape of the
 * frame it is drawn into, measured with the pad held in one place. Comparing a
 * shifted frame against a centred one is not enough and was tried first: the
 * fault also survives `clearViewOffset`, which never restores the aspect, so
 * once the pad has been touched every later frame is equally squashed and the
 * comparison cancels the fault out. Two different frame shapes cannot cancel,
 * because the amount of squash is the frame's own aspect.
 */
async function expectSubjectToShiftWithoutReshaping(
  page: Page,
  target: string,
): Promise<void> {
  // The artboard is 1080 by 1350 and the suite runs in a 1280 by 720 window,
  // so a screenshot of the canvas comes back clipped to what is on screen: the
  // measured box lands on exactly 720 tall whatever the picture is doing. A
  // window that holds the whole frame is the difference between measuring the
  // subject and measuring the viewport.
  await page.setViewportSize({ height: 2000, width: 2600 });
  const field = await getToolcraftControlFieldByTarget(page, target);
  const ratios = await getToolcraftControlFieldByTarget(page, "canvas.aspectRatio");

  await setPad(field, 0, 0);
  const centred = await subjectBox(page, await settledFrame(page));
  await setPad(field, 0.5, -0.4);
  const shifted = await subjectBox(page, await settledFrame(page));

  // It has to move the subject, or holding its shape proves nothing.
  expect(
    Math.hypot(shifted.x - centred.x, shifted.y - centred.y),
    "The framing pad must move the subject across the picture.",
  ).toBeGreaterThan(0.05);
  expect(
    subjectShape(shifted) / subjectShape(centred),
    "Shifting the framing pad must not restretch the subject.",
  ).toBeCloseTo(1, 1);

  // And the shape it draws must be the subject's own, not the frame's.
  await pickOption(ratios, "1:1");
  const square = subjectShape(await subjectBox(page, await settledFrame(page)));
  await pickOption(ratios, "2:3");
  const tall = subjectShape(await subjectBox(page, await settledFrame(page)));
  expect(
    tall / square,
    "A shifted framing must draw the same subject whatever shape the canvas is.",
  ).toBeCloseTo(1, 1);
}
