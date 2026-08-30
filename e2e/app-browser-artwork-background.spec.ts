import { createToolcraftBrowserProofSession } from "./browser-proof-session";
import { pickOption, setColor, uploadDesign } from "./mockup-controls";
import { expectToolcraftProductObservableToChange } from "./product-observable-helpers";
import { test } from "./toolcraft-product-test";

test.setTimeout(600_000);

/**
 * A print file is a mark on nothing.
 *
 * The areas that are not ink are transparent, because the garment is what
 * shows through them. Bound straight to an opaque material that is not what
 * happens: three.js samples the colour channels and ignores alpha, and a
 * transparent pixel is stored as black with zero alpha, so the whole panel
 * came out black behind the logo. The fix composites the design onto a colour
 * when the bitmap is built, and this is the proof that the colour is reaching
 * it: uploading changes the picture, and so does changing the colour
 * afterwards, without the design itself changing.
 */
test("browser: a transparent design shows the print background rather than black", async ({
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

  await expectToolcraftProductObservableToChange(
    session,
    session.controlAction("artwork.image", async (field) => {
      await uploadDesign(field, "mockup-design-transparent.png");
      await field.page().waitForTimeout(3_000);
    }),
    { requirementId: "artwork.background.print", timeoutMs: 120_000 },
  );

  // The design has not changed; only what shows through it has. A background
  // that never reached the decode would leave this frame identical, which is
  // exactly what the bug looked like before the fix — the panel was black
  // whatever the colour said.
  await expectToolcraftProductObservableToChange(
    session,
    session.controlAction("artwork.background", async (field) => {
      await setColor(field, "#1e6f9f");
    }),
    { requirementId: "artwork.background.print", timeoutMs: 120_000 },
  );
});
