import { evaluateToolcraftTimelineGroupValue } from "./keyframe-evaluation";
import type { ToolcraftTimelineKeyframeGroup } from "./types";

/**
 * A track drawn as what its value actually does over time.
 *
 * The curve popover shows one segment, normalized so both ends sit at the
 * corners — the right picture for choosing a shape, and the wrong one for
 * seeing an animation. It cannot show that a move overshoots, that two
 * keyframes are further apart in value than they look on the diamond row, or
 * that a track sits flat for four seconds and then leaps. This is the other
 * view: real value up the side, real time across, every keyframe on the track
 * at once.
 *
 * Everything here is sampled through the runtime's own evaluator rather than
 * re-derived, so the graph and the frame being drawn cannot disagree.
 */

/** How many points to draw a curve with. Enough that eased motion reads smooth. */
export const toolcraftTimelineValueGraphSamples = 160;

export type ToolcraftTimelineValueGraphRange = {
  readonly maxValue: number;
  readonly minValue: number;
};

export type ToolcraftTimelineValueGraphPoint = {
  readonly timeSeconds: number;
  readonly value: number;
};

/** Whether a track holds plain numbers, which is what can be drawn against an axis. */
export function isToolcraftTimelineValueGraphable(
  group: ToolcraftTimelineKeyframeGroup,
): boolean {
  const keyframes = group.keyframes.filter((keyframe) => "value" in keyframe);

  return (
    keyframes.length > 0 &&
    keyframes.every(
      (keyframe) => typeof keyframe.value === "number" && Number.isFinite(keyframe.value),
    )
  );
}

/**
 * The span of values the axis has to cover.
 *
 * Taken from the keyframes rather than from the control's own limits, and
 * padded. A size slider that can reach 400 per cent but is keyed between 100
 * and 110 would draw as a flat line against its own range, which hides exactly
 * the detail somebody opened the graph to see. Padding keeps the extreme
 * keyframes off the edges so their handles stay grabbable.
 *
 * A track whose keyframes all hold one value has no span at all, so it gets an
 * arbitrary one either side; the line sits in the middle, which is the truth
 * about it.
 */
export function getToolcraftTimelineValueGraphRange(
  group: ToolcraftTimelineKeyframeGroup,
): ToolcraftTimelineValueGraphRange {
  const values = group.keyframes
    .map((keyframe) => keyframe.value)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  if (values.length === 0) {
    return { maxValue: 1, minValue: 0 };
  }

  const lowest = Math.min(...values);
  const highest = Math.max(...values);

  if (lowest === highest) {
    const padding = Math.max(1, Math.abs(lowest) * 0.1);

    return { maxValue: highest + padding, minValue: lowest - padding };
  }

  const padding = (highest - lowest) * 0.12;

  return { maxValue: highest + padding, minValue: lowest - padding };
}

/**
 * The curve, as evenly spaced samples across a window of time.
 *
 * Sampled evenly rather than one point per keyframe because the whole subject
 * is what happens *between* keyframes: an eased segment drawn as a straight
 * line between its ends would show none of the easing that this view exists to
 * make visible.
 */
export function sampleToolcraftTimelineValueGraph({
  endSeconds,
  group,
  sampleCount = toolcraftTimelineValueGraphSamples,
  startSeconds,
}: {
  endSeconds: number;
  group: ToolcraftTimelineKeyframeGroup;
  sampleCount?: number;
  startSeconds: number;
}): readonly ToolcraftTimelineValueGraphPoint[] {
  const spanSeconds = endSeconds - startSeconds;

  if (!(spanSeconds > 0) || sampleCount < 2) {
    return [];
  }

  const points: ToolcraftTimelineValueGraphPoint[] = [];

  for (let index = 0; index < sampleCount; index += 1) {
    const timeSeconds = startSeconds + (spanSeconds * index) / (sampleCount - 1);
    const value = evaluateToolcraftTimelineGroupValue(group, timeSeconds);

    if (typeof value === "number" && Number.isFinite(value)) {
      points.push({ timeSeconds, value });
    }
  }

  return points;
}

/** Where a value sits in the frame, as a ratio with zero at the top. */
export function getToolcraftTimelineValueGraphRatio(
  value: number,
  range: ToolcraftTimelineValueGraphRange,
): number {
  const span = range.maxValue - range.minValue;

  return span === 0 ? 0.5 : 1 - (value - range.minValue) / span;
}

/** The value a point in the frame stands for, which is the ratio read backwards. */
export function getToolcraftTimelineValueGraphValue(
  ratio: number,
  range: ToolcraftTimelineValueGraphRange,
): number {
  return range.minValue + (1 - ratio) * (range.maxValue - range.minValue);
}
