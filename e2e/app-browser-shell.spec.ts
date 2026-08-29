import { expect, test } from "@playwright/test";

import { appSchema } from "../src/app/app-schema";
import {
  expectExportExcludesCanvasHandles,
  expectNoForbiddenCanvasUi,
} from "./canvas-handle-helpers";
import {
  expectToolcraftProductObservableToChange,
  getToolcraftProductObservableSnapshot,
} from "./product-observable-helpers";

test("browser renders the Toolcraft template shell instead of a reference iframe shell", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.locator('[data-slot="toolcraft-runtime-app"]')).toBeVisible();

  if (appSchema.assembly.surfaces.canvas.enabled) {
    await expect(page.getByRole("application", { name: "Canvas viewport" })).toBeVisible();
  }

  const nonCanvasIframeCount = await page.evaluate(
    () =>
      Array.from(document.querySelectorAll("iframe")).filter(
        (frame) => !frame.closest("[data-toolcraft-canvas-slot]"),
      ).length,
  );

  expect(
    nonCanvasIframeCount,
    "Reference iframes may not replace the Toolcraft shell. Preserve reference output inside ToolcraftApp canvasContent.",
  ).toBe(0);
});

test("browser preserves the Toolcraft canvas backing surface", async ({ page }) => {
  if (!appSchema.assembly.surfaces.canvas.enabled) {
    return;
  }

  await page.goto("/");

  const canvasViewport = page.getByRole("application", { name: "Canvas viewport" });

  await expect(canvasViewport).toBeVisible();

  const backgroundColor = await canvasViewport.evaluate((element) =>
    window.getComputedStyle(element).backgroundColor,
  );

  expect(
    backgroundColor,
    "The runtime CanvasShell backing must stay visible. Product renderers may customize their own output background, but they must not hide or make the workspace shell transparent.",
  ).not.toMatch(/^(?:transparent|rgba?\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\))$/i);
});

test("browser canvas contains product output without app UI controls or CTA copy", async ({
  page,
}) => {
  if (!appSchema.assembly.surfaces.canvas.enabled) {
    return;
  }

  await page.goto("/");
  await expect(page.getByRole("application", { name: "Canvas viewport" })).toBeVisible();
  await expectNoForbiddenCanvasUi(page);
});

test("product observable helper catches changed and unchanged output", async ({ page }) => {
  await page.setContent(`
    <div data-toolcraft-product-output>Before</div>
    <button type="button" id="change-output">Change output</button>
  `);

  const snapshot = await getToolcraftProductObservableSnapshot(page);
  const decodedSnapshot = JSON.parse(snapshot) as {
    height: number;
    rasterHash: string;
    width: number;
  };

  expect(decodedSnapshot).toMatchObject({
    height: expect.any(Number),
    rasterHash: expect.stringMatching(/^[a-f0-9]+$/u),
    width: expect.any(Number),
  });
  expect(decodedSnapshot.height).toBeGreaterThan(0);
  expect(decodedSnapshot.width).toBeGreaterThan(0);

  await expectToolcraftProductObservableToChange(page, async () => {
    await page.locator("#change-output").evaluate((button) => {
      button.previousElementSibling!.textContent = "After";
    });
  });

  await expect(
    expectToolcraftProductObservableToChange(page, async () => {}, {
      timeoutMs: 100,
    }),
  ).rejects.toThrow(/Product output should change/);
});

test("product observable helper rejects autonomous frame changes as interaction evidence", async ({
  page,
}) => {
  await page.setContent(`
    <div data-toolcraft-product-output>Frame 0</div>
    <script>
      let frame = 0;
      setInterval(() => {
        frame += 1;
        document.querySelector("[data-toolcraft-product-output]").textContent =
          "Frame " + frame;
      }, 8);
    </script>
  `);

  await expect(
    expectToolcraftProductObservableToChange(page, async () => undefined, {
      baselineStabilityIntervalMs: 12,
      baselineStabilitySamples: 3,
      timeoutMs: 150,
    }),
  ).rejects.toThrow(/baseline must remain stable/u);
});

// The raster hash used to come straight from crypto.subtle, which exists only
// in a secure context. Every helper self-test below reaches its page through
// setContent, which leaves it on about:blank, so those tests could never run.
test("product raster hash does not depend on crypto.subtle", async ({ page }) => {
  const markup =
    '<div data-toolcraft-product-output style="width:120px;height:80px;background:#3366cc"></div>';

  await page.setContent(markup);
  expect(
    await page.evaluate(() => Boolean(crypto.subtle)),
    "A page reached through setContent stays on about:blank, which is not a secure context.",
  ).toBe(false);
  const withoutSubtle = await getToolcraftProductObservableSnapshot(page);

  await page.goto("/");
  await page.setContent(markup);
  expect(
    await page.evaluate(() => Boolean(crypto.subtle)),
    "The dev server origin is a secure context, so the fast path is the one under test.",
  ).toBe(true);
  const withSubtle = await getToolcraftProductObservableSnapshot(page);

  // Same pixels, same origin, one variable: whether crypto.subtle is reachable.
  await page.evaluate(() => {
    Object.defineProperty(crypto, "subtle", {
      configurable: true,
      value: undefined,
    });
  });
  const withSubtleHidden = await getToolcraftProductObservableSnapshot(page);

  const hashOf = (snapshot: string): string =>
    (JSON.parse(snapshot) as { rasterHash: string }).rasterHash;

  expect(hashOf(withSubtleHidden)).toBe(hashOf(withSubtle));
  expect(hashOf(withoutSubtle)).toBe(hashOf(withSubtle));
  expect(hashOf(withSubtle)).toMatch(/^[a-f0-9]{64}$/u);
});

test("canvas no-UI helper rejects unclassified canvas text", async ({ page }) => {
  await page.setContent(`
    <div data-toolcraft-canvas-world>
      <div>Click to upload an image</div>
    </div>
  `);

  await expect(expectNoForbiddenCanvasUi(page)).rejects.toThrow(
    /Canvas text must be product output/,
  );

  await page.setContent(`
    <div data-toolcraft-canvas-world>
      <div data-toolcraft-product-output>ASCII output</div>
    </div>
  `);

  await expectNoForbiddenCanvasUi(page);
});

/**
 * The tolerance is only worth having if it still catches what it is for.
 *
 * Two synthetic exports of a four-cell image: one pair apart by the renderer's
 * own noise, one pair apart by a marked handle. The first has to pass and the
 * second has to fail, or the bound is in the wrong place.
 */
function imageInspectionWithPixels(pixels: readonly number[]) {
  return {
    byteLength: 128,
    decodedPixelHash: `hash-${pixels.join("-")}`,
    height: 2,
    kind: "image" as const,
    mediaType: "image/png" as const,
    nonBackgroundBounds: null,
    normalizedPixels: pixels,
    width: 2,
  };
}

test("canvas export-clean helper tolerates render noise but not a marked handle", async ({
  page,
}) => {
  await page.setContent(
    '<div data-toolcraft-canvas-handle data-testid="focus-handle"></div>',
  );

  const baseline = [120, 120, 120, 255, 120, 120, 120, 255];
  // Five levels is the most this renderer's own noise was measured to move.
  const noisy = [125, 118, 121, 255, 116, 124, 120, 255];
  // A handle marked bright green with a magenta halo.
  const marked = [1, 254, 3, 255, 254, 1, 253, 255];

  let call = 0;
  await expectExportExcludesCanvasHandles(
    page,
    async () => new Uint8Array([1, 2, 3]),
    async () => imageInspectionWithPixels(call++ === 0 ? baseline : noisy),
  );

  call = 0;
  await expect(
    expectExportExcludesCanvasHandles(
      page,
      async () => new Uint8Array([1, 2, 3]),
      async () => imageInspectionWithPixels(call++ === 0 ? baseline : marked),
    ),
  ).rejects.toThrow(/handles are leaking/i);
});

test("canvas export-clean helper rejects a no-op export callback", async ({ page }) => {
  await page.setContent(
    '<div data-toolcraft-canvas-handle data-testid="focus-handle"></div>',
  );

  await expect(
    expectExportExcludesCanvasHandles(
      page,
      async () => undefined,
      async () => ({ byteLength: 0, contentHash: "missing" }),
    ),
  ).rejects.toThrow(/export artifact/i);
});

test("canvas export-clean helper compares semantic output instead of encoder bytes", async ({ page }) => {
  await page.setContent(
    '<div data-toolcraft-canvas-handle data-testid="focus-handle"></div>',
  );
  let exportCount = 0;

  await expectExportExcludesCanvasHandles(
    page,
    async () => new Uint8Array([1, 2, 3, exportCount++]),
    async (artifact) => ({
      byteLength: artifact.byteLength,
      contentHash: "same-decoded-pixels",
      height: 1,
      mediaType: "image/png",
      width: 1,
    }),
  );
});

/**
 * A section header must not swallow the keys the app listens for.
 *
 * The header stops propagation on the buttons beside its title so a press on
 * Reset or Collapse does not also toggle the section. That used to stop every
 * key, and the runtime's undo and redo are document listeners on the bubble
 * phase — so collapsing a section left focus on the button that collapsed it
 * and Control+z silently did nothing from then on. It cost a browser proof
 * three runs to find, and nothing said what was wrong, which is why this is a
 * test rather than a comment: the keys reach the document, and the two the
 * header acts on itself do not.
 */
test("collapsing a section leaves the undo shortcut working", async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto("/");
  await page
    .locator("[data-toolcraft-product-output]")
    .first()
    .waitFor({ state: "visible", timeout: 120_000 });

  const collapse = page.locator("[data-control-section-collapse-button]").first();
  await collapse.click();
  await expect(
    page.locator("[data-control-section-collapse-button]:focus"),
    "The collapse button keeps focus after a click, which is the state this guards.",
  ).toHaveCount(1);

  const seen = await page.evaluate(async () => {
    const keys: { key: string; phase: string }[] = [];
    const record = (phase: string) => (event: KeyboardEvent) => {
      keys.push({ key: event.key, phase });
    };
    document.addEventListener("keydown", record("bubble"), false);
    const focused = document.activeElement as HTMLElement | null;
    for (const key of ["z", "Enter"]) {
      focused?.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, ctrlKey: key === "z", key }),
      );
    }
    return keys;
  });

  expect(
    seen.map((entry) => entry.key),
    "Control+z must reach the document, where the runtime listens for undo; Enter belongs to the header and must not.",
  ).toEqual(["z"]);
});
