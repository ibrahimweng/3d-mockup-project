import { describe, expect, it } from "vitest";

import { decodeBase64, maxImageBytes, readSponsorImage } from "./sponsor-image";

const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02];
const jpeg = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10];
const webp = [...[0x52, 0x49, 0x46, 0x46], 0, 0, 0, 0, ...[0x57, 0x45, 0x42, 0x50]];

/** Chunked, because spreading 200,000 arguments overflows the call stack. */
function dataUrl(mediaType: string, bytes: readonly number[]): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 4_096) {
    binary += String.fromCharCode(...bytes.slice(index, index + 4_096));
  }
  return `data:${mediaType};base64,${btoa(binary)}`;
}

describe("what may be uploaded as a sponsor's logo", () => {
  it("takes the three raster types and reports what it stored", async () => {
    for (const [mediaType, bytes] of [
      ["image/png", png],
      ["image/jpeg", jpeg],
      ["image/webp", webp],
    ] as const) {
      const result = await readSponsorImage(dataUrl(mediaType, bytes));
      expect(result.ok, mediaType).toBe(true);
      if (!result.ok) continue;
      expect(result.image.mediaType).toBe(mediaType);
      expect(result.image.byteLength).toBe(bytes.length);
      expect(result.image.digest).toMatch(/^[0-9a-f]{8}$/u);
    }
  });

  it("refuses SVG, which is a document and can carry script", async () => {
    // Served back from our own origin, an SVG is a script with this origin's
    // permissions. There is no sanitiser worth trusting an upload to.
    const svg = `data:image/svg+xml;base64,${btoa("<svg onload='alert(1)'/>")}`;
    const result = await readSponsorImage(svg);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("unsupported-type");
  });

  it("refuses bytes that are not what the type claims", async () => {
    // A file that says image/png and begins "<!doctype html" becomes a page on
    // this domain the moment it is served back.
    const html = [...new TextEncoder().encode("<!doctype html><script>")];
    const result = await readSponsorImage(dataUrl("image/png", html));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("type-mismatch");
  });

  it("refuses anything that is not a base64 image data URL at all", async () => {
    for (const value of [
      "",
      "https://example.com/logo.png",
      "data:image/png,notbase64",
      42,
      null,
    ]) {
      expect((await readSponsorImage(value)).ok, String(value)).toBe(false);
    }
  });

  it("refuses an image over the size limit before decoding it", async () => {
    const big = new Array<number>(maxImageBytes + 64).fill(0x00);
    const result = await readSponsorImage(dataUrl("image/png", [...png, ...big]));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("too-large");
  });

  it("gives back exactly the bytes it was given", async () => {
    const result = await readSponsorImage(dataUrl("image/png", png));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect([...decodeBase64(result.image.base64)]).toEqual(png);
  });

  it("names the same bytes the same way and different bytes differently", async () => {
    // The digest goes in the image's URL, which is what makes it safe to cache
    // the bytes for a day: a replaced logo is never the same address.
    const first = await readSponsorImage(dataUrl("image/png", png));
    const same = await readSponsorImage(dataUrl("image/png", png));
    const other = await readSponsorImage(dataUrl("image/png", [...png, 0x03]));
    expect(first.ok && same.ok && other.ok).toBe(true);
    if (!first.ok || !same.ok || !other.ok) return;
    expect(first.image.digest).toBe(same.image.digest);
    expect(first.image.digest).not.toBe(other.image.digest);
  });
});
