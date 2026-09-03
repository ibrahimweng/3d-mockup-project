import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  noteExportedFrame,
  onExportSettled,
  resetExportSettleSignal,
} from "./signup-signal";

describe("the export settle signal", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    resetExportSettleSignal();
    vi.useRealTimers();
  });

  it("fires once a still export has finished drawing", () => {
    const heard = vi.fn();
    onExportSettled(heard);

    noteExportedFrame();
    expect(heard, "not while the picture is still being made").not.toHaveBeenCalled();

    vi.advanceTimersByTime(1_500);
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it("fires once for a video, not once per frame", () => {
    const heard = vi.fn();
    onExportSettled(heard);

    // A hundred and eighty frames of a six-second turntable, arriving faster
    // than the settle delay, must be one export and one card.
    for (let frame = 0; frame < 180; frame += 1) {
      noteExportedFrame();
      vi.advanceTimersByTime(30);
    }
    expect(heard).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1_500);
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it("fires again for a second export", () => {
    const heard = vi.fn();
    onExportSettled(heard);

    noteExportedFrame();
    vi.advanceTimersByTime(1_500);
    noteExportedFrame();
    vi.advanceTimersByTime(1_500);

    expect(heard).toHaveBeenCalledTimes(2);
  });

  it("stops telling a listener that has unsubscribed", () => {
    const heard = vi.fn();
    onExportSettled(heard)();

    noteExportedFrame();
    vi.advanceTimersByTime(1_500);
    expect(heard).not.toHaveBeenCalled();
  });
});
