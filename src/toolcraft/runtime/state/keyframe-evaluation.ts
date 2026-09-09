import { applyContinuousEasingToSegment } from "./timeline-continuous-easing";
import type {
  ToolcraftState,
  ToolcraftTimelineBezierControlPoints,
  ToolcraftTimelineKeyframe,
  ToolcraftTimelineKeyframeEasing,
  ToolcraftTimelineKeyframeGroup,
} from "./types";

const defaultTimelineBezierControlPoints: ToolcraftTimelineBezierControlPoints = [
  0.65, 0, 0.35, 1,
];

const defaultTimelineKeyframeEasing: ToolcraftTimelineKeyframeEasing = {
  controlPoints: defaultTimelineBezierControlPoints,
  type: "bezier",
};

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}

function getBezierPoint(
  time: number,
  firstControlPoint: number,
  secondControlPoint: number,
): number {
  const inverseTime = 1 - time;

  return (
    3 * inverseTime * inverseTime * time * firstControlPoint +
    3 * inverseTime * time * time * secondControlPoint +
    time * time * time
  );
}

function getBezierYForX(
  progress: number,
  [x1, y1, x2, y2]: ToolcraftTimelineBezierControlPoints,
): number {
  let min = 0;
  let max = 1;
  let time = progress;

  for (let index = 0; index < 30; index += 1) {
    time = (min + max) / 2;

    if (getBezierPoint(time, x1, x2) < progress) {
      min = time;
    } else {
      max = time;
    }
  }

  return clampUnit(getBezierPoint(time, y1, y2));
}

function easeProgress(
  progress: number,
  easing: ToolcraftTimelineKeyframeEasing | undefined,
): number {
  const clampedProgress = clampUnit(progress);
  const resolvedEasing = easing ?? defaultTimelineKeyframeEasing;

  if (resolvedEasing.type === "step") {
    return clampedProgress >= 1 ? 1 : 0;
  }

  if (resolvedEasing.type === "continuous") {
    return getBezierYForX(clampedProgress, defaultTimelineBezierControlPoints);
  }

  return getBezierYForX(clampedProgress, resolvedEasing.controlPoints);
}

/**
 * The curve a segment actually runs on, once its two ends have had their say.
 *
 * A hold is absolute and shortcuts everything else. Otherwise the segment
 * starts from whatever curve its opening keyframe carries, then each end takes
 * back the handle nearest itself if it asked to: the closing keyframe's
 * `easeIn` replaces the second handle, and either end that asked to be
 * continuous replaces its own handle with one solved from that keyframe's
 * neighbours.
 *
 * The order matters at the closing end, where `easeIn` and continuous both
 * want the same handle. Continuous is applied last and wins, because it is a
 * statement about the joint — carry the motion through at the speed it arrives
 * — that a fixed handle cannot express, and a keyframe set to continuous has
 * said the stronger thing.
 */
function getSegmentEasing(
  keyframes: readonly ToolcraftTimelineKeyframe[],
  fromIndex: number,
): ToolcraftTimelineKeyframeEasing {
  const fromKeyframe = keyframes[fromIndex];
  const fromEasing = fromKeyframe?.easing ?? defaultTimelineKeyframeEasing;

  if (fromEasing.type === "step") {
    return fromEasing;
  }

  const baseControlPoints =
    fromEasing.type === "bezier"
      ? fromEasing.controlPoints
      : defaultTimelineBezierControlPoints;
  // Only the second pair of the arriving keyframe's handle is read; its first
  // pair describes the segment *leaving* that keyframe and belongs to the next
  // one along. Absent, the segment keeps both handles from the keyframe it
  // leaves, which is what every segment did before `easeIn` existed.
  const toEaseIn = keyframes[fromIndex + 1]?.easeIn;
  const segmentControlPoints: ToolcraftTimelineBezierControlPoints = toEaseIn
    ? [baseControlPoints[0], baseControlPoints[1], toEaseIn[2], toEaseIn[3]]
    : [...baseControlPoints];

  return {
    controlPoints: applyContinuousEasingToSegment(
      segmentControlPoints,
      keyframes,
      fromIndex,
    ),
    type: "bezier",
  };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
}

function interpolateToolcraftValue(
  fromValue: unknown,
  toValue: unknown,
  progress: number,
): unknown {
  if (typeof fromValue === "number" && typeof toValue === "number") {
    return fromValue + (toValue - fromValue) * progress;
  }

  if (Array.isArray(fromValue) && Array.isArray(toValue) && fromValue.length === toValue.length) {
    return fromValue.map((item, index) =>
      interpolateToolcraftValue(item, toValue[index], progress),
    );
  }

  if (isPlainRecord(fromValue) && isPlainRecord(toValue)) {
    const fromKeys = Object.keys(fromValue);
    const toKeys = Object.keys(toValue);

    if (
      fromKeys.length === toKeys.length &&
      fromKeys.every((key) => Object.prototype.hasOwnProperty.call(toValue, key))
    ) {
      return Object.fromEntries(
        fromKeys.map((key) => [
          key,
          interpolateToolcraftValue(fromValue[key], toValue[key], progress),
        ]),
      );
    }
  }

  return progress >= 1 ? toValue : fromValue;
}

function getKeyframeRuntimeValue(keyframe: ToolcraftTimelineKeyframe): unknown {
  return "value" in keyframe ? keyframe.value : undefined;
}

function getEvaluatedTimelineGroupValue(
  group: ToolcraftTimelineKeyframeGroup,
  timeSeconds: number,
  fallbackValue: unknown,
): unknown {
  const keyframes = group.keyframes
    .filter((keyframe) => "value" in keyframe)
    .sort((first, second) => first.timeSeconds - second.timeSeconds);

  if (keyframes.length === 0) {
    return fallbackValue;
  }

  const firstKeyframe = keyframes[0];
  const lastKeyframe = keyframes[keyframes.length - 1];

  if (!firstKeyframe || !lastKeyframe) {
    return fallbackValue;
  }

  if (timeSeconds <= firstKeyframe.timeSeconds) {
    return getKeyframeRuntimeValue(firstKeyframe);
  }

  if (timeSeconds >= lastKeyframe.timeSeconds) {
    return getKeyframeRuntimeValue(lastKeyframe);
  }

  for (let index = 0; index < keyframes.length - 1; index += 1) {
    const fromKeyframe = keyframes[index];
    const toKeyframe = keyframes[index + 1];

    if (!fromKeyframe || !toKeyframe) {
      continue;
    }

    if (timeSeconds < fromKeyframe.timeSeconds || timeSeconds > toKeyframe.timeSeconds) {
      continue;
    }

    const durationSeconds = toKeyframe.timeSeconds - fromKeyframe.timeSeconds;
    const progress = durationSeconds <= 0 ? 1 : (timeSeconds - fromKeyframe.timeSeconds) / durationSeconds;
    const easedProgress = easeProgress(progress, getSegmentEasing(keyframes, index));

    return interpolateToolcraftValue(
      getKeyframeRuntimeValue(fromKeyframe),
      getKeyframeRuntimeValue(toKeyframe),
      easedProgress,
    );
  }

  return fallbackValue;
}

/**
 * One keyframe group's value at a time, without a whole state to ask through.
 *
 * The value graph draws a track by sampling it many times a frame, and it has
 * to draw what the animation actually does. Reimplementing the curve resolution
 * against the same keyframes would be a second implementation to keep in step,
 * and the first time the two drifted the graph would be lying about the very
 * thing it exists to show. This is the same function the panel, the canvas and
 * the video export reach through.
 */
export function evaluateToolcraftTimelineGroupValue(
  group: ToolcraftTimelineKeyframeGroup,
  timeSeconds: number,
  fallbackValue?: unknown,
): unknown {
  return getEvaluatedTimelineGroupValue(group, timeSeconds, fallbackValue);
}

export function evaluateToolcraftTimelineValue(
  state: ToolcraftState,
  target: string,
  timeSeconds = state.timeline.currentTimeSeconds,
): unknown {
  const group = state.timeline.keyframeGroups.find((item) => item.controlId === target);

  if (!group) {
    return state.values[target];
  }

  return getEvaluatedTimelineGroupValue(group, timeSeconds, state.values[target]);
}

export function evaluateToolcraftTimelineValues(
  state: ToolcraftState,
  timeSeconds = state.timeline.currentTimeSeconds,
): Record<string, unknown> {
  const values = { ...state.values };

  for (const group of state.timeline.keyframeGroups) {
    values[group.controlId] = getEvaluatedTimelineGroupValue(
      group,
      timeSeconds,
      state.values[group.controlId],
    );
  }

  return values;
}
