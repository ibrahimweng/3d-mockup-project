import { afterEach, describe, expect, it, vi } from "vitest";

import {
  forgetArtworkUrl,
  getExportArtworkFrame,
  publishArtworkUrl,
} from "./artwork-store";

/**
 * What these prove.
 *
 * Export is the one caller that must not take whatever frame happens to be
 * decoded. The preview asks for a frame and draws whatever it has, because a
 * render loop cannot wait; export is writing a file one frame at a time, so a
 * frame that arrives late arrives in the wrong place and the same project
 * exports a different animation each time it is rendered.
 *
 * So the thing worth testing is not that a frame comes back -- it is that the
 * frame that comes back is the one for the moment asked for, that asking is
 * what waits, and that a still is not dragged through any of this.
 */

type Decoded = { close: () => void } & Record<string, unknown>;

function makeDecoder(frameCount = 10, durationUs = 100_000) {
  const asked: number[] = [];
  return {
    asked,
    make: () => ({
      close: () => undefined,
      completed: Promise.resolve(),
      decode: ({ frameIndex }: { frameIndex: number }) => {
        asked.push(frameIndex);
        const image: Decoded = {
          close: () => undefined,
          displayHeight: 50,
          displayWidth: 80,
          duration: durationUs,
          frameIndex,
          timestamp: frameIndex * durationUs,
        };
        // Deliberately a tick late, so a caller that reads the frame without
        // waiting for it reads the one before -- or, on the first call, none.
        return new Promise<{ image: Decoded }>((resolve) => {
          setTimeout(() => resolve({ image }), 0);
        });
      },
      tracks: {
        ready: Promise.resolve(),
        selectedTrack: { animated: true, frameCount },
      },
    }),
  };
}

function install(fake: ReturnType<typeof makeDecoder>) {
  const globals = globalThis as Record<string, unknown>;
  globals.ImageDecoder = function ImageDecoder() {
    return fake.make();
  };
  globals.fetch = vi.fn(async () => ({ arrayBuffer: async () => new ArrayBuffer(8) }));
}

afterEach(() => {
  const globals = globalThis as Record<string, unknown>;
  Reflect.deleteProperty(globals, "ImageDecoder");
  Reflect.deleteProperty(globals, "fetch");
  forgetArtworkUrl("moving");
  forgetArtworkUrl("still");
});

describe("the frame an export asks for", () => {
  it("is the one for that moment, not whatever was decoded last", async () => {
    const fake = makeDecoder(10);
    install(fake);
    publishArtworkUrl("moving", "blob:gif", "image/gif");

    // Frames are 100ms each, so each moment names its own frame.
    const first = await getExportArtworkFrame("moving", 0.35);
    expect((first?.frame as unknown as { frameIndex: number }).frameIndex).toBe(3);
    expect(first?.width).toBe(80);
    expect(first?.height).toBe(50);

    // Backwards as well as forwards: an export is not obliged to run in order,
    // and a source that only ever moved forwards would be wrong the moment it
    // was asked to.
    const back = await getExportArtworkFrame("moving", 0.05);
    expect((back?.frame as unknown as { frameIndex: number }).frameIndex).toBe(0);

    // And past the end of the clip it loops, which is the whole point of it.
    const wrapped = await getExportArtworkFrame("moving", 1.25);
    expect((wrapped?.frame as unknown as { frameIndex: number }).frameIndex).toBe(2);
  });

  it("leaves a still alone, whatever the time", async () => {
    const fake = makeDecoder(10);
    install(fake);
    publishArtworkUrl("still", "blob:png", "image/png");
    // No decoder is opened for a photograph, so nothing was asked of it. The
    // decode itself needs a DOM and is not what this is about.
    await getExportArtworkFrame("still", 2).catch(() => null);
    expect(fake.asked).toEqual([]);
  });

  it("has nothing to say about an asset the preview never published", async () => {
    expect(await getExportArtworkFrame("never-seen", 1)).toBeNull();
  });
});
