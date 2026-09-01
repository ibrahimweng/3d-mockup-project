import { afterEach, describe, expect, it, vi } from "vitest";

import {
  isAnimatedMimeType,
  openAnimatedArtwork,
  wrap,
} from "./animated-artwork";

/**
 * What these prove.
 *
 * The awkward part of a design that moves is not decoding it, which the
 * platform does; it is that the render loop cannot wait for the decode and the
 * exporter must. So the same source has to answer immediately with whatever it
 * has and, separately, be waitable until it has the right thing -- and it has
 * to keep at most one decode in flight while a scrub asks for a different frame
 * on every pointer move.
 *
 * None of that needs a browser, so none of it is tested in one. A fake decoder
 * stands in for WebCodecs and records what it was asked for, which is the only
 * way to see the queueing behaviour at all: through a real decoder it would
 * look like the right picture either way, and be quietly doing ten times the
 * work.
 */

type FakeFrame = {
  close: () => void;
  displayHeight: number;
  displayWidth: number;
  duration: number;
  timestamp: number;
};

/** Frames every 100ms, which is the ordinary GIF delay. */
function makeDecoder(frameCount = 5, durationUs = 100_000) {
  const asked: number[] = [];
  const open: FakeFrame[] = [];
  let closed = false;
  let release: (() => void) | null = null;

  const decoder = {
    close: () => {
      closed = true;
    },
    completed: Promise.resolve(),
    decode: ({ frameIndex }: { frameIndex: number }) => {
      asked.push(frameIndex);
      const frame: FakeFrame = {
        close: () => {
          const at = open.indexOf(frame);
          if (at >= 0) open.splice(at, 1);
        },
        displayHeight: 64,
        displayWidth: 96,
        duration: durationUs,
        timestamp: frameIndex * durationUs,
      };
      open.push(frame);
      // Held open when a test wants to see what happens mid-decode.
      if (release) {
        const waiting = new Promise<void>((resolve) => {
          const previous = release;
          release = () => {
            previous?.();
            resolve();
          };
        });
        return waiting.then(() => ({ image: frame }));
      }
      return Promise.resolve({ image: frame });
    },
    tracks: {
      ready: Promise.resolve(),
      selectedTrack: { animated: true, frameCount },
    },
  };

  return {
    asked,
    get closed() {
      return closed;
    },
    decoder,
    /** Frames decoded and not yet closed, which is the memory being held. */
    get openFrames() {
      return open.length;
    },
    hold: () => {
      release = () => undefined;
    },
    letGo: () => {
      const go = release;
      release = null;
      go?.();
    },
  };
}

function install(fake: ReturnType<typeof makeDecoder>) {
  const globals = globalThis as Record<string, unknown>;
  globals.ImageDecoder = function ImageDecoder() {
    return fake.decoder;
  };
  globals.fetch = vi.fn(async () => ({ arrayBuffer: async () => new ArrayBuffer(8) }));
}

afterEach(() => {
  const globals = globalThis as Record<string, unknown>;
  Reflect.deleteProperty(globals, "ImageDecoder");
  Reflect.deleteProperty(globals, "fetch");
});

describe("which uploads move", () => {
  it("knows a GIF and a video from a photograph", () => {
    expect(isAnimatedMimeType("image/gif")).toBe(true);
    expect(isAnimatedMimeType("video/mp4")).toBe(true);
    expect(isAnimatedMimeType("video/webm")).toBe(true);
    expect(isAnimatedMimeType("image/png")).toBe(false);
    expect(isAnimatedMimeType("image/jpeg")).toBe(false);
    expect(isAnimatedMimeType(undefined)).toBe(false);
  });
});

describe("where a moment falls in the loop", () => {
  it("wraps forwards and backwards, and survives nonsense", () => {
    expect(wrap(0.5, 2)).toBe(0.5);
    expect(wrap(2.5, 2)).toBe(0.5);
    expect(wrap(-0.5, 2)).toBe(1.5);
    expect(wrap(Number.NaN, 2)).toBe(0);
    expect(wrap(1, 0)).toBe(0);
  });
});

describe("a GIF on the timeline's clock", () => {
  it("measures the loop from the frames' own timings", async () => {
    const fake = makeDecoder(5);
    install(fake);
    const source = await openAnimatedArtwork("blob:gif", "image/gif", () => undefined);
    expect(source).not.toBeNull();
    expect(source?.durationSeconds).toBeCloseTo(0.5, 6);
    expect(source?.width).toBe(96);
    expect(source?.height).toBe(64);
    source?.dispose();
  });

  it("answers straight away, before anything has been decoded", async () => {
    const fake = makeDecoder(5);
    install(fake);
    const source = await openAnimatedArtwork("blob:gif", "image/gif", () => undefined);
    // Nothing yet, and no waiting for it: a render loop cannot block.
    expect(source?.frameAt(0.25, true)).toBeNull();
    await source?.settle();
    expect(source?.frameAt(0.25, true)).not.toBeNull();
    source?.dispose();
  });

  it("picks the frame whose turn it is, and loops", async () => {
    const fake = makeDecoder(5);
    install(fake);
    const source = await openAnimatedArtwork("blob:gif", "image/gif", () => undefined);
    const at = async (seconds: number) => {
      source?.frameAt(seconds, true);
      await source?.settle();
      return fake.asked.at(-1);
    };
    // Frames are 100ms each, so the moment maps straight onto the index.
    expect(await at(0.0)).toBe(0);
    expect(await at(0.25)).toBe(2);
    expect(await at(0.49)).toBe(4);
    // And past the end it starts again rather than sticking on the last frame.
    expect(await at(0.5)).toBe(0);
    expect(await at(0.75)).toBe(2);
    source?.dispose();
  });

  it("keeps one decode in flight however fast it is scrubbed", async () => {
    const fake = makeDecoder(5);
    install(fake);
    const source = await openAnimatedArtwork("blob:gif", "image/gif", () => undefined);
    fake.asked.length = 0;
    fake.hold();

    // A scrub: a different frame wanted on every pointer move, none of the
    // intermediate ones worth decoding once the hand has moved past them.
    source?.frameAt(0.05, false);
    source?.frameAt(0.15, false);
    source?.frameAt(0.25, false);
    source?.frameAt(0.45, false);
    expect(fake.asked).toEqual([0]);

    fake.letGo();
    await source?.settle();
    // The one in flight, then the one still wanted -- not the two in between.
    expect(fake.asked).toEqual([0, 4]);
    source?.dispose();
  });

  it("holds one frame at a time, whatever the file's size", async () => {
    const fake = makeDecoder(60);
    install(fake);
    const source = await openAnimatedArtwork("blob:gif", "image/gif", () => undefined);
    for (const seconds of [0, 0.4, 1.1, 2.9, 5.2, 0.7]) {
      source?.frameAt(seconds, true);
      await source?.settle();
      expect(fake.openFrames).toBe(1);
    }
    source?.dispose();
    // And nothing is still held once the slot lets go of it.
    expect(fake.openFrames).toBe(0);
    expect(fake.closed).toBe(true);
  });

  it("says so when a frame arrives, so a still preview redraws", async () => {
    const fake = makeDecoder(5);
    install(fake);
    const woken = vi.fn();
    const source = await openAnimatedArtwork("blob:gif", "image/gif", woken);
    source?.frameAt(0.25, false);
    await source?.settle();
    expect(woken).toHaveBeenCalled();
    source?.dispose();
  });

  it("falls back to the still path rather than failing", async () => {
    // A browser with no decoder at all.
    Reflect.deleteProperty(globalThis as Record<string, unknown>, "ImageDecoder");
    expect(await openAnimatedArtwork("blob:gif", "image/gif", () => undefined)).toBeNull();

    // A GIF of one frame, which is a still wearing an animated file extension.
    const single = makeDecoder(1);
    install(single);
    expect(await openAnimatedArtwork("blob:gif", "image/gif", () => undefined)).toBeNull();
    expect(single.closed).toBe(true);

    // And anything this does not handle.
    const fake = makeDecoder(5);
    install(fake);
    expect(await openAnimatedArtwork("blob:x", "image/png", () => undefined)).toBeNull();
  });
});
