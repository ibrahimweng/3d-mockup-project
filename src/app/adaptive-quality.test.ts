import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  FAST_MS,
  INITIAL_QUALITY,
  MAX_SCALE,
  MIN_SCALE,
  PACED_RUN,
  PLAYBACK_SAMPLING,
  RUN,
  SETTLED_MS,
  SLOW_MS,
  STALLED_MS,
  foldFrameGap,
  type QualityState,
} from "./adaptive-quality";

/** Feed the same gap in repeatedly, as a steady frame rate would. */
function run(
  state: QualityState,
  elapsedMs: number,
  frames: number,
  profile?: Parameters<typeof foldFrameGap>[2],
): QualityState {
  let next = state;
  for (let index = 0; index < frames; index += 1) {
    next = foldFrameGap(next, elapsedMs, profile);
  }
  return next;
}

describe("foldFrameGap", () => {
  it("leaves the scale alone until a run of slow frames has built up", () => {
    const state = run(INITIAL_QUALITY, SLOW_MS + 10, RUN - 1);
    expect(state.scale).toBe(MAX_SCALE);
    expect(state.slow).toBe(RUN - 1);
  });

  it("drops the scale once the run completes", () => {
    const state = run(INITIAL_QUALITY, SLOW_MS + 10, RUN);
    expect(state.scale).toBeLessThan(MAX_SCALE);
    // The run restarts, so the next drop needs another full run of evidence.
    expect(state.slow).toBe(0);
  });

  it("keeps dropping under sustained slowness, and stops at the floor", () => {
    // Far more frames than it takes to reach the floor.
    const state = run(INITIAL_QUALITY, SLOW_MS + 40, RUN * 40);
    expect(state.scale).toBe(MIN_SCALE);
  });

  it("climbs back to full when the frames come in fast again", () => {
    const dropped = run(INITIAL_QUALITY, SLOW_MS + 40, RUN * 40);
    expect(dropped.scale).toBe(MIN_SCALE);
    const recovered = run(dropped, FAST_MS - 4, RUN * 40);
    expect(recovered.scale).toBe(MAX_SCALE);
  });

  it("ignores a single hitch in an otherwise healthy run", () => {
    let state = INITIAL_QUALITY;
    for (let index = 0; index < RUN * 4; index += 1) {
      // One late frame every four, which is a hitch rather than a trend.
      state = foldFrameGap(state, index % 4 === 0 ? SLOW_MS + 30 : FAST_MS - 4);
    }
    expect(state.scale).toBe(MAX_SCALE);
  });

  it("does not blame the machine for a paused hand", () => {
    // Gaps past the settle threshold are the pointer standing still.
    const state = run(INITIAL_QUALITY, SETTLED_MS + 500, RUN * 10);
    expect(state).toEqual(INITIAL_QUALITY);
  });

  it("holds steady inside the band, neither dropping nor climbing", () => {
    const between = (SLOW_MS + FAST_MS) / 2;
    const state = run(INITIAL_QUALITY, between, RUN * 10);
    expect(state.scale).toBe(MAX_SCALE);
    expect(state.slow).toBe(0);
    expect(state.fast).toBe(0);
  });

  it("ignores nonsense timings rather than acting on them", () => {
    for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(foldFrameGap(INITIAL_QUALITY, bad)).toEqual(INITIAL_QUALITY);
    }
  });

  it("never leaves the scale outside its bounds", () => {
    let state = INITIAL_QUALITY;
    for (let index = 0; index < 500; index += 1) {
      state = foldFrameGap(state, index % 2 === 0 ? SLOW_MS + 20 : FAST_MS - 6);
      expect(state.scale).toBeGreaterThanOrEqual(MIN_SCALE);
      expect(state.scale).toBeLessThanOrEqual(MAX_SCALE);
    }
  });
});

/**
 * That the sampler is actually wired to the cases that need it.
 *
 * `foldFrameGap` above is the whole of the policy and it is easy to test on
 * its own, which is exactly how the real defect hid: the policy was correct
 * and nothing called it while the timeline played. A turntable rendered at
 * full resolution however slowly its frames came back, with nothing measuring
 * them, while dragging the same scene adapted within a few frames -- so the
 * one thing that could not adapt was the one that ran longest.
 *
 * Read off the source rather than the behaviour because the wiring is a
 * condition inside a `requestAnimationFrame` loop in a React component, and a
 * test that renders the whole preview to reach it would prove less about this
 * line than reading the line does.
 */
describe("the frame loop's sampling", () => {
  const previewSource = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "preview.tsx"),
    "utf8",
  );

  /** Every `quality.sample(...)` call in the file, with the line it sits on. */
  const sampleCalls = previewSource
    .split("\n")
    .filter((line) => line.includes("quality.sample("));

  it("times a drag and anything else that has to keep up, and nothing else", () => {
    expect(sampleCalls).toHaveLength(2);
    const drag = sampleCalls.find((line) => line.includes("interactingRef.current"));
    const paced = sampleCalls.find((line) => line.includes("paced"));
    expect(drag, "a drag should be timed").toBeDefined();
    expect(paced, "work running on a clock should be timed").toBeDefined();
  });

  it("judges paced work by its own profile, not the drag's", () => {
    const paced = sampleCalls.find((line) => line.includes("paced")) ?? "";
    // The drag profile discards any gap over SETTLED_MS as a paused hand, which
    // on a clock throws away exactly the frames worth reacting to.
    expect(paced).toContain("PLAYBACK_SAMPLING");
    const drag = sampleCalls.find((line) => line.includes("interactingRef.current")) ?? "";
    expect(drag).toContain("DRAG_SAMPLING");
  });

  it("counts a moving design as paced, not only the timeline", () => {
    // A GIF with nothing keyframed runs on its own clock, so the timeline says
    // it is not playing while frames are being produced as fast as the machine
    // manages. Timing only `isPlaying` would leave that case unmeasured, which
    // is the same hole playback itself used to sit in.
    expect(previewSource).toMatch(/let paced = timelineRef\.current\.isPlaying/);
    expect(previewSource).toMatch(/paced = paced \|\| moved\.playing/);
  });

  it("clears the measurement when playback starts or stops", () => {
    // Otherwise the first gap measured is the whole idle stretch since the
    // last drag, and the scale drops to the floor before a frame is drawn.
    expect(previewSource).toMatch(/\[isPlaying, quality\]/);
  });
});

/**
 * Playback, where the discard rule was doing the opposite of its job.
 *
 * A drag throws away any gap over `SETTLED_MS` because the usual reason for a
 * long one is that the hand stopped. Applied to playback that rule inverted
 * itself: frames arrive on a clock, so a long gap is exactly the machine
 * saying it cannot keep up -- and the slower it got, the more certainly every
 * sample was discarded and the scale left at full.
 */
describe("judging playback rather than a drag", () => {
  it("reads a badly late frame as slow instead of discarding it", () => {
    const gap = SETTLED_MS + 500;
    expect(run(INITIAL_QUALITY, gap, RUN * 2).scale).toBe(MAX_SCALE);
    expect(run(INITIAL_QUALITY, gap, PACED_RUN, PLAYBACK_SAMPLING).scale).toBeLessThan(MAX_SCALE);
  });

  it("still discards a gap long enough to be a backgrounded tab", () => {
    const stalled = run(INITIAL_QUALITY, STALLED_MS + 1, PACED_RUN * 4, PLAYBACK_SAMPLING);
    expect(stalled).toEqual(INITIAL_QUALITY);
  });

  it("reacts in fewer frames than a drag, because a clock does not jitter", () => {
    const gap = SLOW_MS + 5;
    expect(run(INITIAL_QUALITY, gap, PACED_RUN, PLAYBACK_SAMPLING).scale).toBeLessThan(MAX_SCALE);
    expect(run(INITIAL_QUALITY, gap, PACED_RUN).scale).toBe(MAX_SCALE);
  });

  it("still needs a run, so one hitch cannot drop the picture", () => {
    const one = foldFrameGap(INITIAL_QUALITY, SETTLED_MS + 500, PLAYBACK_SAMPLING);
    expect(one.scale).toBe(MAX_SCALE);
    expect(one.slow).toBe(1);
  });

  it("bottoms out at MIN_SCALE however slow the machine is", () => {
    const floored = run(INITIAL_QUALITY, 3_000, PACED_RUN * 12, PLAYBACK_SAMPLING);
    expect(floored.scale).toBe(MIN_SCALE);
  });
});
