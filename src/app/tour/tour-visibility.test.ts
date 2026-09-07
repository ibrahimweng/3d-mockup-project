import { afterEach, describe, expect, it, vi } from "vitest";

import {
  isTourShowing,
  resetTourVisibilityForTests,
  setTourShowing,
  subscribeToTour,
} from "./tour-visibility";

afterEach(resetTourVisibilityForTests);

describe("the first-run tour's published state", () => {
  it("starts hidden, so the sponsor card is not held back for a tour nobody is being shown", () => {
    expect(isTourShowing()).toBe(false);
  });

  it("tells its listeners when the tour starts and ends", () => {
    const heard = vi.fn();
    subscribeToTour(heard);

    setTourShowing(true);
    expect(isTourShowing()).toBe(true);
    expect(heard).toHaveBeenCalledTimes(1);

    setTourShowing(false);
    expect(isTourShowing()).toBe(false);
    expect(heard).toHaveBeenCalledTimes(2);
  });

  it("says nothing when the answer has not changed", () => {
    // The tour publishes on every step, and every step is still a tour that is
    // showing. Waking the sponsor card four times to tell it the same thing is
    // four renders for nothing.
    const heard = vi.fn();
    subscribeToTour(heard);

    setTourShowing(true);
    setTourShowing(true);
    setTourShowing(true);

    expect(heard).toHaveBeenCalledTimes(1);
  });

  it("stops telling a listener that has unsubscribed", () => {
    const heard = vi.fn();
    subscribeToTour(heard)();

    setTourShowing(true);
    expect(heard).not.toHaveBeenCalled();
  });

  it("survives a listener that unsubscribes while being told", () => {
    const heard = vi.fn();
    const stop = subscribeToTour(() => stop());
    subscribeToTour(heard);

    expect(() => setTourShowing(true)).not.toThrow();
    expect(heard).toHaveBeenCalledTimes(1);
  });
});
