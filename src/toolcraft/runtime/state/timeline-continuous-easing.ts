import type {
  ToolcraftTimelineBezierControlPoints,
  ToolcraftTimelineKeyframe,
} from "./types";

/**
 * A continuous keyframe is a property of the joint, not of one segment.
 *
 * Every other easing here shapes the segment that leaves a keyframe, and both
 * ends of that shape rest at zero speed, so a run of keyframes visibly stops at
 * each one. Continuous asks for the opposite: arrive and leave at the same
 * speed, so the motion carries through the keyframe without a pause.
 *
 * That cannot be a curve stored on the keyframe, because the speed to carry
 * through at is only knowable from the keyframes on either side — and it has to
 * change when either of them moves. So it is stored as intent and solved here,
 * at evaluation, where both neighbours are in hand.
 */

/**
 * Where the two inner control points sit horizontally. Thirds are the usual
 * choice: they divide the segment evenly, which makes the solved slope below
 * read directly as a multiple of the segment's own average speed.
 */
const continuousControlPointX = 1 / 3;

/**
 * The steepest slope a solved handle may take. A cubic handle at x = 1/3 with
 * slope s sits at y = s / 3, so three is the slope that lands exactly on y = 1
 * and anything beyond it drives the curve outside the segment's own value
 * range.
 */
const maximumContinuousSlope = 3;

function getKeyframeNumericValue(
  keyframe: ToolcraftTimelineKeyframe | undefined,
): number | undefined {
  if (!keyframe) {
    return undefined;
  }

  const value = "value" in keyframe ? keyframe.value : undefined;

  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/**
 * The speed the motion should carry through `keyframes[index]` at.
 *
 * With a keyframe on each side this is the secant through those two: the
 * average speed across the pair, which is the slope that leaves neither
 * neighbour looking like a corner. At the ends of the run there is only one
 * neighbour, so the segment's own average speed is the best answer, and it
 * makes the outer half of the run linear rather than stopped.
 */
function getContinuousVelocity(
  keyframes: readonly ToolcraftTimelineKeyframe[],
  index: number,
): number | undefined {
  const keyframe = keyframes[index];

  if (!keyframe) {
    return undefined;
  }

  const previousKeyframe = keyframes[index - 1];
  const nextKeyframe = keyframes[index + 1];
  const spanStart = previousKeyframe ?? keyframe;
  const spanEnd = nextKeyframe ?? keyframe;
  const spanSeconds = spanEnd.timeSeconds - spanStart.timeSeconds;

  if (spanSeconds <= 0) {
    return undefined;
  }

  const startValue = getKeyframeNumericValue(spanStart);
  const endValue = getKeyframeNumericValue(spanEnd);

  if (startValue === undefined || endValue === undefined) {
    return undefined;
  }

  return (endValue - startValue) / spanSeconds;
}

/**
 * The velocity above, expressed as a slope on this segment's own normalized
 * progress curve.
 *
 * Two guards matter. A segment whose value does not change has no slope to
 * speak of, and a keyframe at a peak or a trough has a secant pointing the
 * opposite way to the segment it is being applied to — following it there would
 * swing the value past both keyframes before coming back. Both flatten to zero,
 * which is what every tool that offers this does at an extreme.
 */
function getContinuousSlope(
  velocity: number | undefined,
  segmentSeconds: number,
  segmentValueDelta: number,
): number | undefined {
  if (velocity === undefined || segmentSeconds <= 0) {
    return undefined;
  }

  if (segmentValueDelta === 0) {
    return 0;
  }

  const slope = (velocity * segmentSeconds) / segmentValueDelta;

  if (!Number.isFinite(slope) || slope < 0) {
    return 0;
  }

  return Math.min(slope, maximumContinuousSlope);
}

function getSegmentValueDelta(
  fromKeyframe: ToolcraftTimelineKeyframe,
  toKeyframe: ToolcraftTimelineKeyframe,
): number | undefined {
  const fromValue = getKeyframeNumericValue(fromKeyframe);
  const toValue = getKeyframeNumericValue(toKeyframe);

  if (fromValue === undefined || toValue === undefined) {
    return undefined;
  }

  return toValue - fromValue;
}

/**
 * Replace the handle a continuous keyframe owns, and leave the other end alone.
 *
 * A keyframe only ever governs the handle nearest to itself, so continuous
 * composes with whatever the keyframe at the far end asked for: continuous into
 * an ease-out gives a segment that arrives at speed and settles, and the same
 * pair the other way round gives one that starts from rest and carries on.
 */
export function applyContinuousEasingToSegment(
  controlPoints: ToolcraftTimelineBezierControlPoints,
  keyframes: readonly ToolcraftTimelineKeyframe[],
  fromIndex: number,
): ToolcraftTimelineBezierControlPoints {
  const fromKeyframe = keyframes[fromIndex];
  const toKeyframe = keyframes[fromIndex + 1];

  if (!fromKeyframe || !toKeyframe) {
    return controlPoints;
  }

  const isFromContinuous = fromKeyframe.easing?.type === "continuous";
  const isToContinuous = toKeyframe.easing?.type === "continuous";

  if (!isFromContinuous && !isToContinuous) {
    return controlPoints;
  }

  const segmentSeconds = toKeyframe.timeSeconds - fromKeyframe.timeSeconds;
  const segmentValueDelta = getSegmentValueDelta(fromKeyframe, toKeyframe);

  if (segmentValueDelta === undefined) {
    return controlPoints;
  }

  const [x1, y1, x2, y2] = controlPoints;
  const resolved: ToolcraftTimelineBezierControlPoints = [x1, y1, x2, y2];

  if (isFromContinuous) {
    const slope = getContinuousSlope(
      getContinuousVelocity(keyframes, fromIndex),
      segmentSeconds,
      segmentValueDelta,
    );

    if (slope !== undefined) {
      resolved[0] = continuousControlPointX;
      resolved[1] = slope * continuousControlPointX;
    }
  }

  if (isToContinuous) {
    const slope = getContinuousSlope(
      getContinuousVelocity(keyframes, fromIndex + 1),
      segmentSeconds,
      segmentValueDelta,
    );

    if (slope !== undefined) {
      resolved[2] = 1 - continuousControlPointX;
      resolved[3] = 1 - slope * continuousControlPointX;
    }
  }

  return resolved;
}
