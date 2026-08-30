import { getToolcraftControlFieldByTarget } from "./browser-control-target-helpers";
import { createToolcraftBrowserProofSession } from "./browser-proof-session";
import { expectToolcraftMediaLifecycle } from "./browser-state-evidence-helpers";
import { pickOption, uploadDesign } from "./mockup-controls";
import { test } from "./toolcraft-product-test";

test.setTimeout(300_000);

/**
 * The three uploaders past the front, proven on the product that has all four.
 *
 * Every one of these slots is conditional on the loaded product declaring that
 * zone, so the proof has to select a product first: on the default device
 * these controls do not exist at all, and a test that ran there would pass by
 * finding nothing.
 */
const ZONES = [
  { requirementId: "artwork.image-back.upload", target: "artwork.imageBack" },
  { requirementId: "artwork.image-left.upload", target: "artwork.imageLeft" },
  { requirementId: "artwork.image-right.upload", target: "artwork.imageRight" },
] as const;

const SLOT_TARGETS = [
  "artwork.image",
  "artwork.imageBack",
  "artwork.imageLeft",
  "artwork.imageRight",
];

/**
 * What every slot is holding at once, keyed by the slot holding it.
 *
 * All four rather than one, because the thing worth proving is that an upload
 * lands in the slot it was dropped on and in no other. Reading one slot could
 * not tell a working set of four from four uploaders wired to the same state.
 * This function is serialized into the page, so it closes over nothing.
 */
function readSlots(root: HTMLElement): {
  itemIds: readonly string[];
  outputSignature: string;
} {
  const targets = [
    "artwork.image",
    "artwork.imageBack",
    "artwork.imageLeft",
    "artwork.imageRight",
  ];
  const itemIds: string[] = [];
  const counts: string[] = [];
  for (const target of targets) {
    const field = root.querySelector(`[data-toolcraft-control-target="${target}"]`);
    const images = [...(field?.querySelectorAll("img") ?? [])];
    for (const image of images) {
      itemIds.push(`${target}:${image.getAttribute("alt") ?? ""}`);
    }
    counts.push(`${target}:${images.length}`);
  }
  return { itemIds, outputSignature: counts.join(" ") };
}

function signature(filled: readonly string[]): string {
  return SLOT_TARGETS.map(
    (target) => `${target}:${filled.includes(target) ? 1 : 0}`,
  ).join(" ");
}

test("browser: each upload slot prints on its own zone of the product", async ({
  page,
}) => {
  await page.goto("/");
  const session = await createToolcraftBrowserProofSession(page);
  await page.waitForTimeout(6_000);

  await pickOption(
    await getToolcraftControlFieldByTarget(page, "device.model"),
    "T-Shirt",
  );
  await page.waitForTimeout(8_000);

  const filled: string[] = [];
  for (const zone of ZONES) {
    filled.push(zone.target);
    await expectToolcraftMediaLifecycle(
      session.observe(readSlots),
      session.controlAction(zone.target, async (field) => {
        await uploadDesign(field);
        await field.page().waitForTimeout(2_500);
      }),
      {
        itemIds: filled.map((target) => `${target}:mockup-design.png`),
        outputSignature: signature(filled),
      },
      { requirementId: zone.requirementId, timeoutMs: 60_000 },
    );
  }
});
