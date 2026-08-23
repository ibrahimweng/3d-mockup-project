import { describe, expect, it } from "vitest";
import {
  clampToolcraftTimelineZoom,
  createToolcraftTimelineViewWindow,
  getToolcraftTimelinePannedViewStart,
  getToolcraftTimelineViewRatio,
  getToolcraftTimelineViewStartForAnchor,
  getToolcraftTimelineViewStartForVisibleTime,
  getToolcraftTimelineViewTime,
  getToolcraftTimelineViewZoom,
  getToolcraftTimelineZoomFromSliderRatio,
  getToolcraftTimelineZoomSliderRatio,
  isToolcraftTimelineTimeInView,
  toolcraftTimelineMaxZoom,
  toolcraftTimelineMinZoom,
} from "@/toolcraft/runtime";

describe("timeline view window", () => {
  it("shows the whole loop at rest", () => {
    const view = createToolcraftTimelineViewWindow({ durationSeconds: 6 });

    expect(view).toEqual({ durationSeconds: 6, spanSeconds: 6, startSeconds: 0 });
    expect(getToolcraftTimelineViewRatio(0, view)).toBe(0);
    expect(getToolcraftTimelineViewRatio(6, view)).toBe(1);
    expect(getToolcraftTimelineViewZoom(view)).toBe(1);
  });

  it("narrows the window as zoom rises", () => {
    const view = createToolcraftTimelineViewWindow({ durationSeconds: 6, zoom: 3 });

    expect(view.spanSeconds).toBe(2);
    expect(getToolcraftTimelineViewZoom(view)).toBe(3);
  });

  it("keeps the window inside the loop", () => {
    const view = createToolcraftTimelineViewWindow({
      durationSeconds: 6,
      startSeconds: 99,
      zoom: 2,
    });

    expect(view.startSeconds).toBe(3);
    expect(getToolcraftTimelineViewTime(1, view)).toBe(6);
  });

  it("refuses a start before the loop begins", () => {
    const view = createToolcraftTimelineViewWindow({
      durationSeconds: 6,
      startSeconds: -4,
      zoom: 2,
    });

    expect(view.startSeconds).toBe(0);
  });

  it("maps time and ratio as inverses of each other", () => {
    const view = createToolcraftTimelineViewWindow({
      durationSeconds: 8,
      startSeconds: 2,
      zoom: 4,
    });

    expect(getToolcraftTimelineViewTime(0, view)).toBe(2);
    expect(getToolcraftTimelineViewTime(1, view)).toBe(4);
    expect(getToolcraftTimelineViewRatio(3, view)).toBe(0.5);
    expect(getToolcraftTimelineViewRatio(getToolcraftTimelineViewTime(0.25, view), view)).toBe(0.25);
  });

  it("reports what falls outside the window", () => {
    const view = createToolcraftTimelineViewWindow({
      durationSeconds: 8,
      startSeconds: 2,
      zoom: 4,
    });

    expect(isToolcraftTimelineTimeInView(2, view)).toBe(true);
    expect(isToolcraftTimelineTimeInView(4, view)).toBe(true);
    expect(isToolcraftTimelineTimeInView(1.9, view)).toBe(false);
    expect(isToolcraftTimelineTimeInView(4.1, view)).toBe(false);
    expect(getToolcraftTimelineViewRatio(1, view)).toBeLessThan(0);
  });

  it("holds the anchor still while zooming", () => {
    const view = createToolcraftTimelineViewWindow({ durationSeconds: 8, zoom: 1 });
    const startSeconds = getToolcraftTimelineViewStartForAnchor({
      anchorSeconds: 6,
      durationSeconds: 8,
      view,
      zoom: 2,
    });
    const zoomed = createToolcraftTimelineViewWindow({
      durationSeconds: 8,
      startSeconds,
      zoom: 2,
    });

    expect(getToolcraftTimelineViewRatio(6, zoomed)).toBeCloseTo(0.75, 10);
  });

  it("follows the playhead out of the window", () => {
    const view = createToolcraftTimelineViewWindow({
      durationSeconds: 8,
      startSeconds: 0,
      zoom: 4,
    });

    expect(getToolcraftTimelineViewStartForVisibleTime({ timeSeconds: 1, view })).toBe(0);
    expect(
      getToolcraftTimelineViewStartForVisibleTime({ timeSeconds: 5, view }),
    ).toBeCloseTo(3.2, 10);
  });

  it("stays put while the whole loop is visible", () => {
    const view = createToolcraftTimelineViewWindow({ durationSeconds: 8, zoom: 1 });

    expect(getToolcraftTimelineViewStartForVisibleTime({ timeSeconds: 7, view })).toBe(0);
  });

  it("steps zoom geometrically across the slider", () => {
    expect(getToolcraftTimelineZoomFromSliderRatio(0)).toBe(toolcraftTimelineMinZoom);
    expect(getToolcraftTimelineZoomFromSliderRatio(1)).toBe(toolcraftTimelineMaxZoom);

    const midpointZoom = getToolcraftTimelineZoomFromSliderRatio(0.5);

    expect(midpointZoom).toBeCloseTo(Math.sqrt(toolcraftTimelineMaxZoom), 10);
    // Even travel means equal ratios, not equal differences.
    expect(midpointZoom / toolcraftTimelineMinZoom).toBeCloseTo(
      toolcraftTimelineMaxZoom / midpointZoom,
      10,
    );
  });

  it("rounds the slider back to the zoom it came from", () => {
    for (const ratio of [0, 0.2, 0.5, 0.75, 1]) {
      expect(
        getToolcraftTimelineZoomSliderRatio(getToolcraftTimelineZoomFromSliderRatio(ratio)),
      ).toBeCloseTo(ratio, 10);
    }
  });

  it("pans the window without leaving the loop", () => {
    const view = createToolcraftTimelineViewWindow({
      durationSeconds: 8,
      startSeconds: 3,
      zoom: 4,
    });

    expect(getToolcraftTimelinePannedViewStart({ deltaSeconds: 1, view })).toBe(4);
    expect(getToolcraftTimelinePannedViewStart({ deltaSeconds: -1, view })).toBe(2);
    expect(getToolcraftTimelinePannedViewStart({ deltaSeconds: -99, view })).toBe(0);
    expect(getToolcraftTimelinePannedViewStart({ deltaSeconds: 99, view })).toBe(6);
  });

  it("clamps zoom to the supported range", () => {
    expect(clampToolcraftTimelineZoom(0.1)).toBe(toolcraftTimelineMinZoom);
    expect(clampToolcraftTimelineZoom(9999)).toBe(toolcraftTimelineMaxZoom);
    expect(clampToolcraftTimelineZoom(Number.NaN)).toBe(toolcraftTimelineMinZoom);
    expect(clampToolcraftTimelineZoom("2" as unknown as number)).toBe(toolcraftTimelineMinZoom);
  });
});
