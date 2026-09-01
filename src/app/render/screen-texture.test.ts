import { expect, test, vi } from "vitest";

import { DEVICE_CATALOG } from "../product-domain";
import { DEFAULT_PART_COLORS } from "../product-parts";
import { readArtworkBackground } from "./settings";
import { createScreenTexture } from "./screen-texture";

/**
 * A canvas that records what was drawn on it, in order.
 *
 * The suite runs in node with no DOM, and the thing worth proving here is a
 * sequence rather than a picture: the background has to be laid down before
 * the design and has to cover the whole canvas. Filling after drawing would
 * erase the design, and filling only the image's own box would leave the
 * corners black on a design smaller than its canvas.
 */
function stubCanvas(): {
  calls: string[];
  restore: () => void;
} {
  const calls: string[] = [];
  const context = {
    // A canvas that will be drawn into more than once has to be reset and
    // cleared first, or frame two arrives on top of frame one through its own
    // transparent parts and under frame one's leftover transform.
    clearRect: (x: number, y: number, w: number, h: number) =>
      calls.push(`clearRect ${x},${y} ${w}x${h}`),
    drawImage: (_image: unknown, x: number, y: number, w: number, h: number) =>
      calls.push(`drawImage ${x},${y} ${w}x${h}`),
    fillRect: (x: number, y: number, w: number, h: number) =>
      calls.push(`fillRect ${x},${y} ${w}x${h}`),
    fillStyle: "",
    rotate: () => calls.push("rotate"),
    scale: (x: number, y: number) => calls.push(`scale ${x},${y}`),
    setTransform: () => calls.push("setTransform"),
    translate: (x: number, y: number) => calls.push(`translate ${x},${y}`),
  };
  const canvas = {
    getContext: () => {
      calls.push(`fillStyle ${context.fillStyle}`);
      return context;
    },
    height: 0,
    width: 0,
  };
  // getContext is called once, before fillStyle is assigned, so the style is
  // read back off the context instead.
  const original = globalThis.document;
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { createElement: () => canvas },
    writable: true,
  });
  return {
    calls,
    restore: () => {
      if (original === undefined) {
        Reflect.deleteProperty(globalThis, "document");
      } else {
        Object.defineProperty(globalThis, "document", {
          configurable: true,
          value: original,
          writable: true,
        });
      }
      void context;
    },
  };
}

test("a transparent design is composited onto the print background", () => {
  const stub = stubCanvas();
  const image = { height: 400, naturalHeight: 400, naturalWidth: 300, width: 300 };
  try {
    createScreenTexture(
      image as unknown as HTMLImageElement,
      DEVICE_CATALOG.tshirt,
      undefined,
      1,
      "#ff0000",
    );
  } finally {
    stub.restore();
  }

  const fill = stub.calls.findIndex((call) => call.startsWith("fillRect"));
  const draw = stub.calls.findIndex((call) => call.startsWith("drawImage"));
  expect(fill, "the background was never laid down").toBeGreaterThanOrEqual(0);
  // Under the design, not over it.
  expect(fill).toBeLessThan(draw);
  // The whole canvas, not the image's box: a design smaller than its canvas
  // would otherwise keep black corners.
  expect(stub.calls[fill]).toBe("fillRect 0,0 300x400");
  // And the canvas was reset and cleared before any of it, so a second frame
  // painted onto the same canvas starts from nothing rather than from the one
  // before it.
  const reset = stub.calls.indexOf("setTransform");
  const clear = stub.calls.findIndex((call) => call.startsWith("clearRect"));
  expect(reset).toBeGreaterThanOrEqual(0);
  expect(reset).toBeLessThan(fill);
  expect(clear).toBeGreaterThan(reset);
  expect(clear).toBeLessThan(fill);
  expect(stub.calls[clear]).toBe("clearRect 0,0 300x400");
});

test("a display is left alone", () => {
  // A screenshot with transparent corners showing black is a screen behaving
  // correctly, so no background reaches the decode and nothing is baked.
  const values = { "artwork.background": "#ff0000" };
  expect(readArtworkBackground(values, false)).toBeUndefined();
  expect(readArtworkBackground(values, true)).toBe("#ff0000");
  // The blank stock, not white: filling the transparent part of a design with
  // white puts a brighter rectangle on the product with a hard edge round it.
  expect(readArtworkBackground({}, true)).toBe(DEFAULT_PART_COLORS.main);

  const untouched = vi.fn();
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { createElement: untouched },
    writable: true,
  });
  createScreenTexture(
    { height: 2, naturalHeight: 2, naturalWidth: 2, width: 2 } as HTMLImageElement,
    DEVICE_CATALOG["iphone-17-pro-max"],
    undefined,
    1,
    undefined,
  );
  Reflect.deleteProperty(globalThis, "document");
  expect(untouched).not.toHaveBeenCalled();
});
