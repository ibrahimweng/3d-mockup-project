import { expect, type Locator, type Page } from "@playwright/test";

const maxRasterDimension = 4096;
const maxRasterPixelArea = 8_388_608;
const screenshotOptions = Object.freeze({
  animations: "disabled" as const,
  caret: "hide" as const,
  scale: "css" as const,
  type: "png" as const,
});
const warmedSelectors = new WeakMap<Page, Set<string>>();

export type ToolcraftProductRasterRegion = Readonly<{
  height: number;
  width: number;
  x: number;
  y: number;
}>;

export type ToolcraftProductRasterProbe = Readonly<{
  region?: ToolcraftProductRasterRegion;
  selector: string;
}>;

export type ToolcraftResolvedProductRasterProbe = Readonly<{
  bounds: ToolcraftProductRasterRegion;
  capture: () => Promise<string>;
  locator: Locator;
}>;

function validateRegion(
  region: ToolcraftProductRasterRegion,
  ownerWidth: number,
  ownerHeight: number,
  label: string,
): void {
  if (
    !Number.isFinite(region.x) ||
    !Number.isFinite(region.y) ||
    !Number.isFinite(region.width) ||
    !Number.isFinite(region.height) ||
    region.x < 0 ||
    region.y < 0 ||
    region.width <= 0 ||
    region.height <= 0 ||
    region.x + region.width > ownerWidth ||
    region.y + region.height > ownerHeight
  ) {
    throw new Error(
      `Raster probe "${label}" requires a finite positive region inside its visible selector.`,
    );
  }
}

async function decodeRasterSnapshot(
  page: Page,
  raster: Buffer,
  region: ToolcraftProductRasterRegion | undefined,
  selector: string,
): Promise<string> {
  const snapshot = await page.evaluate(
    async ({ encoded, maxDimension, maxPixelArea, probeRegion, selector }) => {
      // crypto.subtle exists only in a secure context. A page reached through
      // setContent sits on about:blank, and a dev server reached over a LAN
      // address is plain http, so neither has it. The fallback is the same
      // SHA-256, so a hash means the same thing wherever it was taken.
      const hashPixels = async (bytes: Uint8Array): Promise<string> => {
        if (crypto.subtle) {
          const digest = await crypto.subtle.digest("SHA-256", bytes);

          return [...new Uint8Array(digest)]
            .map((byte) => byte.toString(16).padStart(2, "0"))
            .join("");
        }

        const k = new Uint32Array([
          0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b,
          0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01,
          0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7,
          0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
          0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152,
          0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
          0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc,
          0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
          0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819,
          0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08,
          0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f,
          0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
          0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
        ]);
        const state = new Uint32Array([
          0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f,
          0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
        ]);
        const bitLength = bytes.length * 8;
        const padded = new Uint8Array((bytes.length + 9 + 63) & ~63);
        padded.set(bytes);
        padded[bytes.length] = 0x80;
        const block = new DataView(padded.buffer);
        block.setUint32(padded.length - 8, Math.floor(bitLength / 4294967296), false);
        block.setUint32(padded.length - 4, bitLength >>> 0, false);
        const schedule = new Uint32Array(64);

        for (let offset = 0; offset < padded.length; offset += 64) {
          for (let index = 0; index < 16; index += 1) {
            schedule[index] = block.getUint32(offset + index * 4, false);
          }

          for (let index = 16; index < 64; index += 1) {
            const previous = schedule[index - 15];
            const recent = schedule[index - 2];
            const s0 =
              ((previous >>> 7) | (previous << 25)) ^
              ((previous >>> 18) | (previous << 14)) ^
              (previous >>> 3);
            const s1 =
              ((recent >>> 17) | (recent << 15)) ^
              ((recent >>> 19) | (recent << 13)) ^
              (recent >>> 10);
            schedule[index] =
              (schedule[index - 16] + s0 + schedule[index - 7] + s1) >>> 0;
          }

          let [a, b, c, d, e, f, g, h] = state;

          for (let index = 0; index < 64; index += 1) {
            const S1 =
              ((e >>> 6) | (e << 26)) ^
              ((e >>> 11) | (e << 21)) ^
              ((e >>> 25) | (e << 7));
            const choice = (e & f) ^ (~e & g);
            const t1 = (h + S1 + choice + k[index] + schedule[index]) >>> 0;
            const S0 =
              ((a >>> 2) | (a << 30)) ^
              ((a >>> 13) | (a << 19)) ^
              ((a >>> 22) | (a << 10));
            const majority = (a & b) ^ (a & c) ^ (b & c);
            const t2 = (S0 + majority) >>> 0;

            h = g;
            g = f;
            f = e;
            e = (d + t1) >>> 0;
            d = c;
            c = b;
            b = a;
            a = (t1 + t2) >>> 0;
          }

          const round = [a, b, c, d, e, f, g, h];

          for (let index = 0; index < 8; index += 1) {
            state[index] = (state[index] + round[index]) >>> 0;
          }
        }

        return [...state]
          .map((word) => word.toString(16).padStart(8, "0"))
          .join("");
      };
      const binary = atob(encoded);
      const bytes = Uint8Array.from(
        binary,
        (character) => character.charCodeAt(0),
      );
      const bitmap = await createImageBitmap(
        new Blob([bytes], { type: "image/png" }),
      );

      try {
        const source = probeRegion ?? {
          height: bitmap.height,
          width: bitmap.width,
          x: 0,
          y: 0,
        };
        if (
          source.width > maxDimension ||
          source.height > maxDimension ||
          source.width * source.height > maxPixelArea
        ) {
          throw new Error(
            `Raster probe "${selector}" exceeds the bounded visual proof limit (${source.width}x${source.height}).`,
          );
        }

        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(source.width);
        canvas.height = Math.ceil(source.height);
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) {
          throw new Error(
            `Raster probe "${selector}" could not decode its visual pixels.`,
          );
        }
        context.drawImage(
          bitmap,
          source.x,
          source.y,
          source.width,
          source.height,
          0,
          0,
          source.width,
          source.height,
        );
        const pixels = context.getImageData(
          0,
          0,
          canvas.width,
          canvas.height,
        ).data;
        return {
          height: canvas.height,
          rasterHash: await hashPixels(
            new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength),
          ),
          width: canvas.width,
        };
      } finally {
        bitmap.close();
      }
    },
    {
      encoded: raster.toString("base64"),
      maxDimension: maxRasterDimension,
      maxPixelArea: maxRasterPixelArea,
      probeRegion: region,
      selector,
    },
  );

  return JSON.stringify(snapshot);
}

export async function resolveToolcraftProductRasterProbe(
  page: Page,
  probe: ToolcraftProductRasterProbe,
  timeoutMs = 5000,
): Promise<ToolcraftResolvedProductRasterProbe> {
  if (!probe.selector.trim()) {
    throw new Error("A raster probe requires a non-empty selector.");
  }

  const locator = page.locator(probe.selector);
  await expect(
    locator,
    `Raster probe "${probe.selector}" must resolve exactly once.`,
  ).toHaveCount(1);
  await expect(locator).toBeVisible({ timeout: timeoutMs });
  const ownerBounds = await locator.boundingBox();
  if (
    ownerBounds === null ||
    !Number.isFinite(ownerBounds.width) ||
    !Number.isFinite(ownerBounds.height) ||
    ownerBounds.width <= 0 ||
    ownerBounds.height <= 0
  ) {
    throw new Error(
      `Raster probe "${probe.selector}" must have finite positive visible bounds.`,
    );
  }

  if (probe.region) {
    validateRegion(
      probe.region,
      ownerBounds.width,
      ownerBounds.height,
      probe.selector,
    );
  }
  const localBounds = probe.region ?? {
    height: ownerBounds.height,
    width: ownerBounds.width,
    x: 0,
    y: 0,
  };
  const bounds = {
    height: localBounds.height,
    width: localBounds.width,
    x: ownerBounds.x + localBounds.x,
    y: ownerBounds.y + localBounds.y,
  };

  return {
    bounds,
    capture: async () => {
      const pageSelectors = warmedSelectors.get(page) ?? new Set<string>();
      const key = `${probe.selector}:${JSON.stringify(probe.region ?? null)}`;
      if (!pageSelectors.has(key)) {
        await locator.screenshot(screenshotOptions);
        await page.evaluate(
          () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
        );
        pageSelectors.add(key);
        warmedSelectors.set(page, pageSelectors);
      }
      const raster = await locator.screenshot(screenshotOptions);
      return decodeRasterSnapshot(page, raster, probe.region, probe.selector);
    },
    locator,
  };
}
