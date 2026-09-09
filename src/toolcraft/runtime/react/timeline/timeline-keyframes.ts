import type {
  ToolcraftTimelineKeyframe,
  ToolcraftTimelineKeyframeGroup,
} from '../../state/types';

/**
 * A drag in progress, shared by every row rather than held by the one under
 * the pointer.
 *
 * A selection can span tracks, so the rows that are not being pressed still
 * have to draw their own selected keyframes moving. The row that owns the
 * pointer publishes one offset and the set it applies to; each row shifts its
 * own keyframes by it. Nothing is committed until the pointer comes up.
 */
export type TimelineKeyframeDragPreview = {
  readonly anchorKeyframeId: string;
  readonly keyframeIds: ReadonlySet<string>;
  readonly offsetSeconds: number;
};

/** Where a keyframe is drawn right now, which during a drag is not where it is. */
export function getTimelineKeyframeDisplayTime(
  keyframe: ToolcraftTimelineKeyframe,
  dragPreview: TimelineKeyframeDragPreview | null,
): number {
  return dragPreview?.keyframeIds.has(keyframe.id)
    ? keyframe.timeSeconds + dragPreview.offsetSeconds
    : keyframe.timeSeconds;
}

export function findTimelineKeyframe(
  keyframeGroups: readonly ToolcraftTimelineKeyframeGroup[],
  keyframeId: string | null,
): ToolcraftTimelineKeyframe | undefined {
  if (!keyframeId) {
    return undefined;
  }

  for (const group of keyframeGroups) {
    const keyframe = group.keyframes.find((currentKeyframe) => currentKeyframe.id === keyframeId);

    if (keyframe) {
      return keyframe;
    }
  }

  return undefined;
}
