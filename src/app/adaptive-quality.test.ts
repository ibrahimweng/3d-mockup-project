import { describe, expect, it } from "vitest";

import {
  FAST_MS,
  INITIAL_QUALITY,
  MAX_SCALE,
  MIN_SCALE,
  RUN,
  SETTLED_MS,
  SLOW_MS,
  foldFrameGap,
  type QualityState,
} from "./adaptive-quality";

/** Feed the same gap in repeatedly, as a steady frame rate would. */
function run(state: QualityState, elapsedMs: number, frames: number): QualityState {
  let next = state;
  for (let index = 0; index < frames; index += 1) {
    next = foldFrameGap(next, elapsedMs);
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
