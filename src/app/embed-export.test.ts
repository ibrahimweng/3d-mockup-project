import { describe, expect, it } from "vitest";

import {
  createEmbedManifest,
  embedFramesPerSecond,
  getEmbedFrameCount,
  getEmbedFrameFileName,
  getEmbedFrameTimings,
} from "./embed-export";
import { createEmbedPlayerHtml, createEmbedReadme } from "./embed-player";

describe("embed frame timings", () => {
  it("takes the loop at the declared frame rate", () => {
    expect(getEmbedFrameCount(6)).toBe(6 * embedFramesPerSecond);
    expect(getEmbedFrameCount(6, 30)).toBe(180);
  });

  it("stops one frame short of the end so the loop closes", () => {
    const timings = getEmbedFrameTimings(6, 2);

    expect(timings.map((timing) => timing.timeSeconds)).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5]);
    // Six seconds is not among them: a turn keyed 0 to 360 draws the same
    // picture at both ends, and carrying both holds it for two frames.
    expect(timings.at(-1)?.timeSeconds).toBeLessThan(6);
    expect(timings.at(-1)?.timeSeconds).toBeCloseTo(6 - 6 / timings.length, 10);
  });

  it("survives a loop with no length", () => {
    expect(getEmbedFrameCount(0)).toBe(1);
    expect(getEmbedFrameTimings(0)).toEqual([{ index: 0, timeSeconds: 0 }]);
    expect(getEmbedFrameCount(Number.NaN)).toBe(1);
  });

  it("names frames so they sort in order", () => {
    expect(getEmbedFrameFileName(0, 90)).toBe("frames/00.webp");
    expect(getEmbedFrameFileName(9, 90)).toBe("frames/09.webp");
    expect(getEmbedFrameFileName(89, 90)).toBe("frames/89.webp");
    expect(getEmbedFrameFileName(7, 1000)).toBe("frames/007.webp");
  });
});

describe("embed manifest", () => {
  it("lists one file per frame, in order", () => {
    const manifest = createEmbedManifest({ durationSeconds: 2, fps: 3, height: 675, width: 540 });

    expect(manifest.frameCount).toBe(6);
    expect(manifest.frames).toEqual([
      "frames/0.webp",
      "frames/1.webp",
      "frames/2.webp",
      "frames/3.webp",
      "frames/4.webp",
      "frames/5.webp",
    ]);
    expect(manifest.frames).toHaveLength(getEmbedFrameTimings(2, 3).length);
  });
});

describe("embed player", () => {
  const manifest = createEmbedManifest({ durationSeconds: 6, fps: 2, height: 675, width: 540 });

  it("stands alone, with no import and no build step", () => {
    const html = createEmbedPlayerHtml(manifest, "Mockup");

    expect(html).not.toMatch(/<script[^>]+src=/);
    expect(html).not.toMatch(/import\s|require\(/);
    expect(html).toContain('width="540"');
    expect(html).toContain('height="675"');
    // Every frame it will need is written into the page it ships as.
    for (const frame of manifest.frames) expect(html).toContain(frame);
  });

  it("keeps the page behind it showing through", () => {
    const html = createEmbedPlayerHtml(manifest, "Mockup");

    expect(html).toContain("background: transparent");
    expect(html).toContain("clearRect");
  });

  it("holds still when the system asks for less motion", () => {
    expect(createEmbedPlayerHtml(manifest, "Mockup")).toContain("prefers-reduced-motion");
  });

  it("escapes a title rather than pasting it into the markup", () => {
    const html = createEmbedPlayerHtml(manifest, '</title><script>alert(1)</script>');

    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("tells the reader what they are holding and what it costs", () => {
    const readme = createEmbedReadme(manifest, 2.7 * 1024 * 1024);

    expect(readme).toContain("2.7MB");
    expect(readme).toContain("iframe");
    expect(readme).toContain(String(manifest.frameCount));
  });
});
