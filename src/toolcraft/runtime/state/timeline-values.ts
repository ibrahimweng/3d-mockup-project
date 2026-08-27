export const toolcraftTimelineDefaultDurationSeconds = 8;
export const toolcraftTimelineMinDurationSeconds = 1;
export const toolcraftTimelineMaxDurationSeconds = 60;
export const toolcraftTimelineScrubStepSeconds = 0.25;

export function clampToolcraftTimelineDurationSeconds(
  value: unknown,
  fallback = toolcraftTimelineDefaultDurationSeconds,
): number {
  const numberValue = typeof value === "number" ? value : Number.NaN;

  if (!Number.isFinite(numberValue)) {
    return fallback;
  }

  return Math.max(
    toolcraftTimelineMinDurationSeconds,
    Math.min(toolcraftTimelineMaxDurationSeconds, numberValue),
  );
}

export function clampToolcraftTimelineTime(value: number, durationSeconds: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(durationSeconds, value));
}

export function formatToolcraftTimelineKeyframeSeconds(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

export function roundToolcraftTimelineKeyframeTime(value: number): number {
  return Math.round(value * 100) / 100;
}

export function getToolcraftTimelineKeyframeId(
  controlId: string,
  timeSeconds: number,
): string {
  return `${controlId}::${formatToolcraftTimelineKeyframeSeconds(timeSeconds)}`;
}

/**
 * The speeds the transport offers, slowest first.
 *
 * Quarter speed is there to watch an ease actually ease; double and quadruple
 * are for sitting through a long loop while judging the shape of it. Anything
 * outside the list is snapped to the nearest one, so a stored value from
 * elsewhere cannot leave the transport showing a speed it has no button for.
 */
export const toolcraftTimelinePlaybackRates = [0.25, 0.5, 1, 2, 4] as const;

export function clampToolcraftTimelinePlaybackRate(playbackRate: unknown): number {
  if (typeof playbackRate !== "number" || !Number.isFinite(playbackRate)) {
    return 1;
  }

  return toolcraftTimelinePlaybackRates.reduce((closest, rate) =>
    Math.abs(rate - playbackRate) < Math.abs(closest - playbackRate) ? rate : closest,
  );
}
