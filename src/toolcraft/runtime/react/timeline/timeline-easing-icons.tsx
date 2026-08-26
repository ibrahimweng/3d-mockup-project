'use client';

import * as React from 'react';

import type { ToolcraftTimelineKeyframeEasing } from '../../state/types';
import type { TimelineBezierControlPoints } from './timeline-easing-model';
import {
  getEasingIconPath,
  timelineEasingPresetIconLineColor,
  timelineEasingPresetIconSize,
  timelineEasingPresetIconViewBoxSize,
} from './timeline-easing-geometry';

export function TimelineEasingCurveIcon({
  className,
  easing,
  size = 20,
}: {
  className?: string;
  easing: ToolcraftTimelineKeyframeEasing;
  size?: number;
}): React.JSX.Element {
  if (easing.type !== 'bezier') {
    /**
     * A hold turns the corner; a continuous keyframe runs straight through it.
     * Neither is a curve, which is the point — the continuous mark also carries
     * a dot on the line, because what it says is that the motion does not stop
     * where the keyframe is.
     */
    const isStep = easing.type === 'step';

    return (
      <svg
        aria-hidden="true"
        className={className ? `pointer-events-none ${className}` : 'pointer-events-none'}
        fill="none"
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        width={size}
      >
        <path
          d={isStep ? `M 3 ${size - 3} H ${size - 3} V 3` : `M 3 ${size - 3} L ${size - 3} 3`}
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth={1.5}
        />
        {isStep ? null : <circle cx={size / 2} cy={size / 2} fill="currentColor" r={1.75} />}
      </svg>
    );
  }

  return (
    <svg
      aria-hidden="true"
      className={className ? `pointer-events-none ${className}` : 'pointer-events-none'}
      fill="none"
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      width={size}
    >
      <path
        d={getEasingIconPath(easing.controlPoints, size)}
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth={1.5}
      />
    </svg>
  );
}

export function TimelineEasingPresetIcon({
  controlPoints,
}: {
  controlPoints: TimelineBezierControlPoints;
}): React.JSX.Element {
  const iconSize = timelineEasingPresetIconViewBoxSize;
  const iconInset = 4;
  const iconGridSize = iconSize - iconInset * 2;
  const pointX = (point: number): number => iconInset + point * iconGridSize;
  const pointY = (point: number): number => iconInset + (1 - point) * iconGridSize;
  const path = `M ${pointX(0)} ${pointY(0)} C ${pointX(controlPoints[0])} ${pointY(
    controlPoints[1],
  )}, ${pointX(controlPoints[2])} ${pointY(controlPoints[3])}, ${pointX(1)} ${pointY(1)}`;

  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none shrink-0"
      data-slot="timeline-easing-preset-icon"
      fill="none"
      height={timelineEasingPresetIconSize}
      viewBox={`0 0 ${iconSize} ${iconSize}`}
      width={timelineEasingPresetIconSize}
    >
      <rect
        fill="color-mix(in oklab, currentColor 8%, transparent)"
        height={iconGridSize}
        rx={2}
        stroke="color-mix(in oklab, currentColor 18%, transparent)"
        strokeWidth={1}
        width={iconGridSize}
        x={iconInset}
        y={iconInset}
      />
      <path
        d={path}
        stroke={timelineEasingPresetIconLineColor}
        strokeLinecap="round"
        strokeWidth={1}
      />
    </svg>
  );
}

export function TimelineEasingStepPresetIcon(): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none shrink-0"
      data-slot="timeline-easing-step-icon"
      fill="none"
      height={timelineEasingPresetIconSize}
      viewBox="0 0 28 28"
      width={timelineEasingPresetIconSize}
    >
      <rect
        fill="color-mix(in oklab, currentColor 8%, transparent)"
        height={20}
        rx={2}
        stroke="color-mix(in oklab, currentColor 18%, transparent)"
        strokeWidth={1}
        width={20}
        x={4}
        y={4}
      />
      <path
        d="M 4 24 H 24 V 4"
        stroke={timelineEasingPresetIconLineColor}
        strokeLinecap="round"
        strokeWidth={1}
      />
    </svg>
  );
}

export function TimelineEasingContinuousPresetIcon(): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none shrink-0"
      data-slot="timeline-easing-continuous-icon"
      fill="none"
      height={timelineEasingPresetIconSize}
      viewBox="0 0 28 28"
      width={timelineEasingPresetIconSize}
    >
      <rect
        fill="color-mix(in oklab, currentColor 8%, transparent)"
        height={20}
        rx={2}
        stroke="color-mix(in oklab, currentColor 18%, transparent)"
        strokeWidth={1}
        width={20}
        x={4}
        y={4}
      />
      <path
        d="M 4 24 L 24 4"
        stroke={timelineEasingPresetIconLineColor}
        strokeLinecap="round"
        strokeWidth={1}
      />
      <circle cx={14} cy={14} fill={timelineEasingPresetIconLineColor} r={2} />
    </svg>
  );
}
