import { describe, expect, it, vi } from "vitest";

import { readDesignClock } from "./animated-artwork";
import { paintMovingSlots, type MovingSlot } from "./moving-slots";

/**
 * What these prove.
 *
 * Two rules that are easy to state and were both got wrong once. A design
 * follows the timeline whenever there is a timeline to follow, and keeps its
 * own time when there is not -- because the runtime stops its clock with
 * nothing keyframed, and a GIF dropped on a still scene would otherwise sit on
 * frame one for ever with a Play button that does nothing about it.
 *
 * And a frame is redrawn when it is a different frame. That reads as an
 * optimisation and is really a correctness rule in disguise: a video hands back
 * the same element every time and changes what is inside it, so testing
 * identity alone would freeze every video the moment it started playing.
 */

const noTimeline = {
  currentTimeSeconds: 0,
  isPlaying: false,
  keyframeGroups: [] as readonly unknown[],
};
const withKeyframes = (currentTimeSeconds: number, isPlaying: boolean) => ({
  currentTimeSeconds,
  isPlaying,
  keyframeGroups: [{}] as readonly unknown[],
});

describe("which clock a design follows", () => {
  it("follows the timeline when something is keyframed", () => {
    expect(readDesignClock(withKeyframes(2.5, true), 99)).toEqual({
      playing: true,
      seconds: 2.5,
    });
    // Paused means paused: the design holds the frame it is on.
    expect(readDesignClock(withKeyframes(2.5, false), 99)).toEqual({
      playing: false,
      seconds: 2.5,
    });
  });

  it("keeps its own time when there is no timeline to follow", () => {
    // The runtime will not run its clock with nothing keyframed, so following
    // it would leave the design on its first frame however long you waited.
    expect(readDesignClock(noTimeline, 3.25)).toEqual({ playing: true, seconds: 3.25 });
    expect(readDesignClock(noTimeline, -1)).toEqual({ playing: true, seconds: 0 });
  });
});

/** A slot whose source hands back whatever it is told to. */
function makeSlot(frames: (object | null)[]): {
  paints: number;
  slot: MovingSlot;
  times: number[];
} {
  let index = 0;
  const times: number[] = [];
  const paint = vi.fn();
  const slot = {
    painter: { paint, texture: {} },
    shown: null,
    source: {
      durationSeconds: 1,
      dispose: () => undefined,
      frameAt: (seconds: number) => {
        times.push(seconds);
        const frame = frames[Math.min(index, frames.length - 1)];
        index += 1;
        return frame;
      },
      height: 1,
      settle: async () => undefined,
      width: 1,
    },
    zone: "front",
  } as unknown as MovingSlot;
  return {
    get paints() {
      return paint.mock.calls.length;
    },
    slot,
    times,
  };
}

describe("painting the moving zones", () => {
  it("paints a frame that changed and skips one that did not", () => {
    const a = {};
    const held = makeSlot([a, a, {}]);
    // Paused, so only a genuinely different frame is worth the blit.
    const paused = withKeyframes(0.4, false);
    expect(paintMovingSlots([held.slot], paused, 0).painted).toBe(true);
    expect(paintMovingSlots([held.slot], paused, 0).painted).toBe(false);
    expect(paintMovingSlots([held.slot], paused, 0).painted).toBe(true);
    expect(held.paints).toBe(2);
  });

  it("paints every frame while running, because a video reuses its element", () => {
    const element = {};
    const video = makeSlot([element, element, element]);
    for (let frame = 0; frame < 3; frame += 1) {
      expect(paintMovingSlots([video.slot], withKeyframes(frame, true), 0).painted).toBe(true);
    }
    expect(video.paints).toBe(3);
  });

  it("passes the clock's own time down to the source", () => {
    const gif = makeSlot([{}, {}]);
    paintMovingSlots([gif.slot], withKeyframes(1.5, true), 99);
    paintMovingSlots([gif.slot], noTimeline, 2.75);
    expect(gif.times).toEqual([1.5, 2.75]);
  });

  it("reports running for a design with no timeline, so frames stay timed", () => {
    const gif = makeSlot([{}]);
    expect(paintMovingSlots([gif.slot], noTimeline, 1).playing).toBe(true);
    expect(paintMovingSlots([gif.slot], withKeyframes(1, false), 1).playing).toBe(false);
  });

  it("leaves a zone alone while its first frame is still decoding", () => {
    const empty = makeSlot([null]);
    expect(paintMovingSlots([empty.slot], noTimeline, 0).painted).toBe(false);
    expect(empty.paints).toBe(0);
  });
});
