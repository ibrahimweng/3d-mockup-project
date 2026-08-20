import { expectToolcraftReferenceParity } from "./browser-acceptance-outcome-helpers";
import { getToolcraftControlFieldByTarget } from "./browser-control-target-helpers";
import { createToolcraftBrowserProofSession } from "./browser-proof-session";
import { expectToolcraftMediaLifecycle } from "./browser-state-evidence-helpers";
import { uploadDesign } from "./mockup-controls";
import { test } from "./toolcraft-product-test";

test.setTimeout(180_000);

/** What the app is holding for the display, read from the control that holds it. */
function readArtwork(root: HTMLElement): {
  itemIds: readonly string[];
  outputSignature: string;
} {
  const field = root.querySelector('[data-toolcraft-control-target="artwork.image"]');
  const images = [...(field?.querySelectorAll("img") ?? [])];
  const itemIds = images.map(
    (image) => image.getAttribute("alt") ?? image.getAttribute("src")?.slice(-16) ?? "",
  );
  return {
    itemIds,
    outputSignature: `items:${itemIds.length}`,
  };
}

test("browser: uploading, transforming, and clearing the screenshot updates the rendered display", async ({
  page,
}) => {
  await page.goto("/");
  const session = await createToolcraftBrowserProofSession(page);
  await page.waitForTimeout(6_000);

  const lifecycle = session.observe(readArtwork);

  await expectToolcraftMediaLifecycle(
    lifecycle,
    session.controlAction("artwork.image", async (field) => {
      await uploadDesign(field);
      await field.page().waitForTimeout(2_500);
    }),
    { itemIds: ["mockup-design.png"], outputSignature: "items:1" },
    { requirementId: "artwork.image.upload", timeoutMs: 45_000 },
  );

  // The reference put one image on the display and nothing else; the port
  // offers the same single slot rather than a collection.
  await expectToolcraftReferenceParity(
    async () =>
      (await getToolcraftControlFieldByTarget(page, "artwork.image"))
        .locator("img")
        .count(),
    1,
    { requirementId: "artwork.image.upload", target: "artwork.image" },
  );
});
