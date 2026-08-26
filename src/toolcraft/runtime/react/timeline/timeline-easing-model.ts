import type {
  ToolcraftTimelineBezierControlPoints,
  ToolcraftTimelineKeyframeEasing,
} from '../../state/types';

export type TimelineBezierControlPoints = ToolcraftTimelineBezierControlPoints;

const defaultTimelineBezierControlPoints = [
  0.65, 0, 0.35, 1,
] satisfies TimelineBezierControlPoints;

const defaultTimelineKeyframeEasing: ToolcraftTimelineKeyframeEasing = {
  controlPoints: defaultTimelineBezierControlPoints,
  type: 'bezier',
};

export type TimelineEasingPresetCategory = 'basic' | 'expressive' | 'in' | 'inOut' | 'out';

export type TimelineEasingPreset = {
  category: TimelineEasingPresetCategory;
  controlPoints: TimelineBezierControlPoints;
  label: string;
  name: string;
};

export const timelineEasingPresetCategories = [
  ['basic', 'Foundation'],
  ['out', 'Out'],
  ['in', 'In'],
  ['inOut', 'In Out'],
  ['expressive', 'Expressive'],
] as const satisfies ReadonlyArray<readonly [TimelineEasingPresetCategory, string]>;

export const timelineEasingPresets = [
  { category: 'basic', controlPoints: [0, 0, 1, 1], label: 'Linear', name: 'linear' },
  { category: 'basic', controlPoints: [0.65, 0, 0.35, 1], label: 'Smooth', name: 'smooth' },
  {
    category: 'expressive',
    controlPoints: [1, -0.4, 0.35, 0.95],
    label: 'Anticipate',
    name: 'anticipate',
  },
  {
    category: 'expressive',
    controlPoints: [0.36, 0, 0.66, -0.56],
    label: 'Back In',
    name: 'backIn',
  },
  {
    category: 'expressive',
    controlPoints: [0.34, 1.56, 0.64, 1],
    label: 'Back Out',
    name: 'backOut',
  },
  { category: 'out', controlPoints: [0, 0, 0.2, 1], label: 'Quick Out', name: 'quickOut' },
  {
    category: 'out',
    controlPoints: [0.175, 0.885, 0.32, 1.1],
    label: 'Swift Out',
    name: 'swiftOut',
  },
  { category: 'out', controlPoints: [0.19, 1, 0.22, 1], label: 'Snappy Out', name: 'snappyOut' },
  {
    category: 'out',
    controlPoints: [0.215, 0.61, 0.355, 1],
    label: 'Out Cubic',
    name: 'outCubic',
  },
  { category: 'out', controlPoints: [0, 0, 0.58, 1], label: 'Ease Out', name: 'easeOut' },
  { category: 'in', controlPoints: [0.42, 0, 1, 1], label: 'Ease In', name: 'easeIn' },
  { category: 'in', controlPoints: [0.6, 0.04, 0.98, 0.335], label: 'In Circ', name: 'inCirc' },
  { category: 'in', controlPoints: [0.755, 0.05, 0.855, 0.06], label: 'In Quint', name: 'inQuint' },
  {
    category: 'inOut',
    controlPoints: [0.42, 0, 0.58, 1],
    label: 'Ease In Out',
    name: 'easeInOut',
  },
  {
    category: 'inOut',
    controlPoints: [0.77, 0, 0.175, 1],
    label: 'In Out Quart',
    name: 'inOutQuart',
  },
  {
    category: 'inOut',
    controlPoints: [0.86, 0, 0.07, 1],
    label: 'In Out Quint',
    name: 'inOutQuint',
  },
  { category: 'inOut', controlPoints: [1, 0, 0, 1], label: 'In Out Expo', name: 'inOutExpo' },
  {
    category: 'inOut',
    controlPoints: [0.785, 0.135, 0.15, 0.86],
    label: 'In Out Circ',
    name: 'inOutCirc',
  },
] as const satisfies readonly TimelineEasingPreset[];

const easingNumberTokenPattern = /[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)/g;

function clampEasingValue(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function cloneToolcraftTimelineKeyframeEasing(
  easing: ToolcraftTimelineKeyframeEasing,
): ToolcraftTimelineKeyframeEasing {
  return easing.type === 'bezier'
    ? { controlPoints: [...easing.controlPoints], type: 'bezier' }
    : { type: easing.type };
}

export function getToolcraftTimelineKeyframeEasing(
  easing: ToolcraftTimelineKeyframeEasing | undefined,
): ToolcraftTimelineKeyframeEasing {
  return cloneToolcraftTimelineKeyframeEasing(easing ?? defaultTimelineKeyframeEasing);
}

export function normalizeToolcraftTimelineKeyframeEasing(
  easing: unknown,
): ToolcraftTimelineKeyframeEasing | undefined {
  if (typeof easing !== 'object' || easing === null || Array.isArray(easing)) {
    return undefined;
  }

  const easingRecord = easing as Record<string, unknown>;

  if (easingRecord.type === 'step') {
    return { type: 'step' };
  }

  if (easingRecord.type === 'continuous') {
    return { type: 'continuous' };
  }

  if (easingRecord.type !== 'bezier' || !Array.isArray(easingRecord.controlPoints)) {
    return undefined;
  }

  const [x1, y1, x2, y2] = easingRecord.controlPoints;

  if (
    typeof x1 !== 'number' ||
    typeof y1 !== 'number' ||
    typeof x2 !== 'number' ||
    typeof y2 !== 'number' ||
    !Number.isFinite(x1) ||
    !Number.isFinite(y1) ||
    !Number.isFinite(x2) ||
    !Number.isFinite(y2)
  ) {
    return undefined;
  }

  return {
    controlPoints: [
      clampEasingValue(x1, 0, 1),
      clampEasingValue(y1, -1, 2),
      clampEasingValue(x2, 0, 1),
      clampEasingValue(y2, -1, 2),
    ],
    type: 'bezier',
  };
}

function parseTimelineEasingNumberTokens(value: string): number[] {
  return Array.from(value.matchAll(easingNumberTokenPattern), ([token]) =>
    Number.parseFloat(token.replace(',', '.')),
  ).filter(Number.isFinite);
}

export function parseToolcraftTimelineKeyframeEasing(
  value: string,
  baseEasing?: ToolcraftTimelineKeyframeEasing,
): ToolcraftTimelineKeyframeEasing | null {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return null;
  }

  if (/^step(?:\s+hold)?$/i.test(trimmedValue) || /^hold$/i.test(trimmedValue)) {
    return { type: 'step' };
  }

  if (/^continuous$/i.test(trimmedValue)) {
    return { type: 'continuous' };
  }

  const cubicBezierMatch = trimmedValue.match(/^cubic-bezier\((.+)\)$/i);
  const rawControlPoints = parseTimelineEasingNumberTokens(
    cubicBezierMatch?.[1] ?? trimmedValue,
  );

  if (rawControlPoints.length === 0) {
    return null;
  }

  const fallbackControlPoints =
    baseEasing?.type === 'bezier' ? baseEasing.controlPoints : defaultTimelineBezierControlPoints;
  const controlPoints = [
    rawControlPoints[0] ?? fallbackControlPoints[0],
    rawControlPoints[1] ?? fallbackControlPoints[1],
    rawControlPoints[2] ?? fallbackControlPoints[2],
    rawControlPoints[3] ?? fallbackControlPoints[3],
  ] satisfies TimelineBezierControlPoints;

  return (
    normalizeToolcraftTimelineKeyframeEasing({
      controlPoints,
      type: 'bezier',
    }) ?? null
  );
}

function formatTimelineBezierControlPoints(
  controlPoints: TimelineBezierControlPoints,
): string {
  return controlPoints.map((point) => Number(point.toFixed(3))).join(', ');
}

export function findTimelineEasingPresetName(
  easing: ToolcraftTimelineKeyframeEasing,
): string | null {
  if (easing.type !== 'bezier') {
    return null;
  }

  const [x1, y1, x2, y2] = easing.controlPoints;

  return (
    timelineEasingPresets.find((preset) => {
      const [presetX1, presetY1, presetX2, presetY2] = preset.controlPoints;

      return (
        Math.abs(x1 - presetX1) < 0.005 &&
        Math.abs(y1 - presetY1) < 0.005 &&
        Math.abs(x2 - presetX2) < 0.005 &&
        Math.abs(y2 - presetY2) < 0.005
      );
    })?.name ?? null
  );
}

export function getEasingEditorControlPoints(
  easing: ToolcraftTimelineKeyframeEasing,
): TimelineBezierControlPoints {
  if (easing.type === 'bezier') {
    return easing.controlPoints;
  }

  /**
   * Neither of these is a curve the editor can draw. A hold has no curve at
   * all, and a continuous keyframe's curve is only solved once its neighbours
   * are known, which is at evaluation and not here. Both fall back to the
   * straight line, and the editor shows itself as inactive rather than
   * pretending the line is what will run.
   */
  return [0, 0, 1, 1];
}

export function areEasingControlPointsEqual(
  first: TimelineBezierControlPoints,
  second: TimelineBezierControlPoints,
): boolean {
  return first.every((point, index) => Math.abs(point - second[index]) < 0.0001);
}

function getTimelineEasingAnimationProgress(progress: number): number {
  return 1 - (1 - progress) ** 3;
}

export function interpolateTimelineEasingControlPoints(
  from: TimelineBezierControlPoints,
  to: TimelineBezierControlPoints,
  progress: number,
): TimelineBezierControlPoints {
  const easedProgress = getTimelineEasingAnimationProgress(Math.max(0, Math.min(1, progress)));

  return from.map(
    (point, index) => point + (to[index] - point) * easedProgress,
  ) as TimelineBezierControlPoints;
}

export function getEasingInputValue(easing: ToolcraftTimelineKeyframeEasing): string {
  if (easing.type === 'step') {
    return 'step';
  }

  if (easing.type === 'continuous') {
    return 'continuous';
  }

  return formatTimelineBezierControlPoints(easing.controlPoints);
}

/**
 * The handful of shapes a keyframe usually wants, named in the words people
 * actually use for them.
 *
 * The nineteen presets and the curve editor stay where they are — this is the
 * short list that sits above them, so choosing how a keyframe moves is one
 * press rather than a hunt through five categories. Anything not on the list
 * still reads back as Custom, and the library below is how you get there.
 */
export type TimelineKeyframeEasingKind =
  | 'continuous'
  | 'custom'
  | 'easeIn'
  | 'easeOut'
  | 'hold'
  | 'linear'
  | 'smooth';

export type TimelineKeyframeEasingKindOption = {
  /** Plain-language description of the motion, for the control's tooltip. */
  description: string;
  easing: ToolcraftTimelineKeyframeEasing;
  kind: Exclude<TimelineKeyframeEasingKind, 'custom'>;
  label: string;
};

export const timelineKeyframeEasingKindOptions = [
  {
    description: 'Same speed the whole way. No acceleration at either end.',
    easing: { controlPoints: [0, 0, 1, 1], type: 'bezier' },
    kind: 'linear',
    label: 'Linear',
  },
  {
    description: 'Starts slowly and speeds up towards the next keyframe.',
    easing: { controlPoints: [0.42, 0, 1, 1], type: 'bezier' },
    kind: 'easeIn',
    label: 'Ease In',
  },
  {
    description: 'Leaves at full speed and slows down into the next keyframe.',
    easing: { controlPoints: [0, 0, 0.58, 1], type: 'bezier' },
    kind: 'easeOut',
    label: 'Ease Out',
  },
  {
    description: 'Eases at both ends, so it settles on the next keyframe.',
    easing: { controlPoints: [0.65, 0, 0.35, 1], type: 'bezier' },
    kind: 'smooth',
    label: 'Smooth',
  },
  {
    description: 'Passes straight through without stopping here.',
    easing: { type: 'continuous' },
    kind: 'continuous',
    label: 'Continuous',
  },
  {
    description: 'Holds this value, then jumps at the next keyframe.',
    easing: { type: 'step' },
    kind: 'hold',
    label: 'Hold',
  },
] as const satisfies readonly TimelineKeyframeEasingKindOption[];

export function getTimelineKeyframeEasingKind(
  easing: ToolcraftTimelineKeyframeEasing | undefined,
): TimelineKeyframeEasingKind {
  const resolvedEasing = getToolcraftTimelineKeyframeEasing(easing);

  if (resolvedEasing.type === 'continuous') {
    return 'continuous';
  }

  if (resolvedEasing.type === 'step') {
    return 'hold';
  }

  return (
    timelineKeyframeEasingKindOptions.find(
      (option) =>
        option.easing.type === 'bezier' &&
        areEasingControlPointsEqual(option.easing.controlPoints, resolvedEasing.controlPoints),
    )?.kind ?? 'custom'
  );
}
