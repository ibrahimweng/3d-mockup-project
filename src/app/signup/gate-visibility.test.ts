import { afterEach, describe, expect, it, vi } from "vitest";

import {
  isExportGateOpen,
  resetExportGateForTests,
  setExportGateOpen,
  subscribeToExportGate,
} from "./gate-visibility";

afterEach(resetExportGateForTests);

describe("the export gate's published state", () => {
  it("starts closed, so nothing hides before there is anything to hide from", () => {
    expect(isExportGateOpen()).toBe(false);
  });

  it("tells its listeners when it opens and closes", () => {
    const heard = vi.fn();
    subscribeToExportGate(heard);

    setExportGateOpen(true);
    expect(isExportGateOpen()).toBe(true);
    expect(heard).toHaveBeenCalledTimes(1);

    setExportGateOpen(false);
    expect(isExportGateOpen()).toBe(false);
    expect(heard).toHaveBeenCalledTimes(2);
  });

  it("says nothing when the answer has not changed", () => {
    // Otherwise every render of the gate would wake every subscriber, and
    // useSyncExternalStore would re-render the welcome card for nothing.
    const heard = vi.fn();
    subscribeToExportGate(heard);

    setExportGateOpen(true);
    setExportGateOpen(true);
    setExportGateOpen(true);

    expect(heard).toHaveBeenCalledTimes(1);
  });

  it("stops telling a listener that has unsubscribed", () => {
    const heard = vi.fn();
    subscribeToExportGate(heard)();

    setExportGateOpen(true);
    expect(heard).not.toHaveBeenCalled();
  });

  it("survives a listener that unsubscribes while being told", () => {
    // The gate closing is what unmounts the thing listening, so this is the
    // ordinary case rather than a contrived one.
    const heard = vi.fn();
    const stop = subscribeToExportGate(() => stop());
    subscribeToExportGate(heard);

    expect(() => setExportGateOpen(true)).not.toThrow();
    expect(heard).toHaveBeenCalledTimes(1);
  });
});
