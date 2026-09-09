import type { ToolcraftTimelineKeyframeGroup } from "./types";
import type { ToolcraftTimelineViewWindow } from "./timeline-view-window";

/**
 * How close a dragged keyframe has to come before it lands on something.
 *
 * Measured on screen rather than in seconds, because the timeline zooms: eight
 * pixels is the same easy reach whether the track is showing six seconds or
 * half of one, and a tolerance in seconds would be unusably sticky zoomed in
 * and useless zoomed out.
 */
export const toolcraftTimelineSnapDistancePx = 8;

/**
 * The times a dragged keyframe is allowed to land exactly on.
 *
 * The playhead is there because keying against the frame you are looking at is
 * most of what this panel is for. The two ends are there because a loop that
 * does not start and finish on them is not seamless, and landing on them by
 * hand at 0.01s resolution is a matter of luck. Other keyframes are there so
 * two properties can be made to move together, which is the timeline's version
 * of lining two things up.
 *
 * Keyframes being dragged are excluded — a selection would otherwise snap to
 * itself and never move.
 */
export function getToolcraftTimelineSnapTimes({
  currentTimeSeconds,
  durationSeconds,
  excludedKeyframeIds,
  keyframeGroups,
}: {
  currentTimeSeconds: number;
  durationSeconds: number;
  excludedKeyframeIds: ReadonlySet<string>;
  keyframeGroups: readonly ToolcraftTimelineKeyframeGroup[];
}): readonly number[] {
  const times = new Set<number>([0, durationSeconds, currentTimeSeconds]);

  for (const group of keyframeGroups) {
    for (const keyframe of group.keyframes) {
      if (!excludedKeyframeIds.has(keyframe.id)) {
        times.add(keyframe.timeSeconds);
      }
    }
  }

  return [...times];
}

/**
 * The nearest snap target within reach, or the time asked for.
 *
 * Ties go to the earlier target, which only matters when two sit exactly the
 * same distance either side and picking one arbitrarily would make the result
 * depend on the order the tracks happen to be in.
 */
export function snapToolcraftTimelineTime({
  candidateSeconds,
  snapTimesSeconds,
  toleranceSeconds,
}: {
  candidateSeconds: number;
  snapTimesSeconds: readonly number[];
  toleranceSeconds: number;
}): number {
  if (!(toleranceSeconds > 0)) {
    return candidateSeconds;
  }

  let nearest: number | null = null;
  let nearestDistance = toleranceSeconds;

  for (const snapTime of snapTimesSeconds) {
    const distance = Math.abs(snapTime - candidateSeconds);

    if (distance < nearestDistance || (distance === nearestDistance && snapTime < (nearest ?? Infinity))) {
      nearest = snapTime;
      nearestDistance = distance;
    }
  }

  return nearest ?? candidateSeconds;
}

/**
 * The snap tolerance in seconds for a track of a given width on screen.
 *
 * The view span rather than the whole duration, because that is what the
 * track's pixels are showing once the panel is zoomed in.
 */
export function getToolcraftTimelineSnapToleranceSeconds(
  view: ToolcraftTimelineViewWindow,
  trackWidthPx: number,
): number {
  if (!(trackWidthPx > 0)) {
    return 0;
  }

  return (view.spanSeconds / trackWidthPx) * toolcraftTimelineSnapDistancePx;
}
