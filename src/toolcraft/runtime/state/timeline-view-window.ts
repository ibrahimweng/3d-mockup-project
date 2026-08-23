export const toolcraftTimelineMinZoom = 1;
export const toolcraftTimelineMaxZoom = 12;

/**
 * The slice of the loop the expanded timeline is currently drawing.
 *
 * Every position on the track — the ruler, the playhead, each keyframe — is a
 * ratio across this window rather than across the whole loop, so zooming is a
 * matter of handing the same components a narrower window.
 */
export type ToolcraftTimelineViewWindow = {
  readonly durationSeconds: number;
  readonly spanSeconds: number;
  readonly startSeconds: number;
};

export function clampToolcraftTimelineZoom(value: unknown): number {
  const numberValue = typeof value === "number" ? value : Number.NaN;

  if (!Number.isFinite(numberValue)) {
    return toolcraftTimelineMinZoom;
  }

  return Math.max(
    toolcraftTimelineMinZoom,
    Math.min(toolcraftTimelineMaxZoom, numberValue),
  );
}

/**
 * Zoom reads evenly to the hand when it steps geometrically: 1x to 2x should
 * feel like the same nudge as 6x to 12x, which a linear slider does not give.
 */
export function getToolcraftTimelineZoomFromSliderRatio(ratio: number): number {
  const safeRatio = Number.isFinite(ratio) ? Math.max(0, Math.min(1, ratio)) : 0;

  return clampToolcraftTimelineZoom(
    toolcraftTimelineMinZoom *
      (toolcraftTimelineMaxZoom / toolcraftTimelineMinZoom) ** safeRatio,
  );
}

export function getToolcraftTimelineZoomSliderRatio(zoom: number): number {
  const clampedZoom = clampToolcraftTimelineZoom(zoom);

  return (
    Math.log(clampedZoom / toolcraftTimelineMinZoom) /
    Math.log(toolcraftTimelineMaxZoom / toolcraftTimelineMinZoom)
  );
}

export function createToolcraftTimelineViewWindow({
  durationSeconds,
  startSeconds = 0,
  zoom = toolcraftTimelineMinZoom,
}: {
  durationSeconds: number;
  startSeconds?: number;
  zoom?: number;
}): ToolcraftTimelineViewWindow {
  const safeDurationSeconds = Number.isFinite(durationSeconds)
    ? Math.max(0, durationSeconds)
    : 0;
  const spanSeconds = safeDurationSeconds / clampToolcraftTimelineZoom(zoom);
  const maxStartSeconds = Math.max(0, safeDurationSeconds - spanSeconds);
  const safeStartSeconds = Number.isFinite(startSeconds) ? startSeconds : 0;

  return {
    durationSeconds: safeDurationSeconds,
    spanSeconds,
    startSeconds: Math.max(0, Math.min(maxStartSeconds, safeStartSeconds)),
  };
}

export function getToolcraftTimelineViewZoom(view: ToolcraftTimelineViewWindow): number {
  if (view.spanSeconds <= 0) {
    return toolcraftTimelineMinZoom;
  }

  return view.durationSeconds / view.spanSeconds;
}

/** Where a moment in the loop falls across the window, as 0 at the left edge and 1 at the right. */
export function getToolcraftTimelineViewRatio(
  timeSeconds: number,
  view: ToolcraftTimelineViewWindow,
): number {
  if (view.spanSeconds <= 0) {
    return 0;
  }

  return (timeSeconds - view.startSeconds) / view.spanSeconds;
}

export function getToolcraftTimelineViewTime(
  ratio: number,
  view: ToolcraftTimelineViewWindow,
): number {
  return view.startSeconds + view.spanSeconds * ratio;
}

export function isToolcraftTimelineTimeInView(
  timeSeconds: number,
  view: ToolcraftTimelineViewWindow,
): boolean {
  const ratio = getToolcraftTimelineViewRatio(timeSeconds, view);

  return ratio >= 0 && ratio <= 1;
}

/**
 * Zoom about a moment rather than about the left edge, so the frame you were
 * looking at stays under the cursor as the window tightens around it.
 */
export function getToolcraftTimelineViewStartForAnchor({
  anchorSeconds,
  durationSeconds,
  view,
  zoom,
}: {
  anchorSeconds: number;
  durationSeconds: number;
  view: ToolcraftTimelineViewWindow;
  zoom: number;
}): number {
  const anchorRatio = Math.max(0, Math.min(1, getToolcraftTimelineViewRatio(anchorSeconds, view)));
  const nextSpanSeconds =
    Math.max(0, durationSeconds) / clampToolcraftTimelineZoom(zoom);

  return anchorSeconds - nextSpanSeconds * anchorRatio;
}

/** Slide the window along the loop, stopping at either end. */
export function getToolcraftTimelinePannedViewStart({
  deltaSeconds,
  view,
}: {
  deltaSeconds: number;
  view: ToolcraftTimelineViewWindow;
}): number {
  if (!Number.isFinite(deltaSeconds)) {
    return view.startSeconds;
  }

  return Math.max(
    0,
    Math.min(view.durationSeconds - view.spanSeconds, view.startSeconds + deltaSeconds),
  );
}

/** Follow the playhead when it leaves the window, keeping a margin so it never rides the edge. */
export function getToolcraftTimelineViewStartForVisibleTime({
  timeSeconds,
  view,
}: {
  timeSeconds: number;
  view: ToolcraftTimelineViewWindow;
}): number {
  if (view.spanSeconds <= 0 || view.spanSeconds >= view.durationSeconds) {
    return 0;
  }

  const marginSeconds = view.spanSeconds * 0.1;

  if (timeSeconds < view.startSeconds + marginSeconds) {
    return timeSeconds - marginSeconds;
  }

  if (timeSeconds > view.startSeconds + view.spanSeconds - marginSeconds) {
    return timeSeconds - view.spanSeconds + marginSeconds;
  }

  return view.startSeconds;
}
