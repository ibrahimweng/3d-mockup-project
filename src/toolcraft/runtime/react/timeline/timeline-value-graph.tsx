'use client';

import * as React from 'react';
import { useRef, useState } from 'react';

import type { ToolcraftTimelineKeyframeGroup } from '../../state/types';
import {
  getToolcraftTimelineValueGraphRange,
  getToolcraftTimelineValueGraphRatio,
  getToolcraftTimelineValueGraphValue,
  isToolcraftTimelineValueGraphable,
  sampleToolcraftTimelineValueGraph,
} from '../../state/timeline-value-graph';
import {
  getToolcraftTimelineViewRatio,
  type ToolcraftTimelineViewWindow,
} from '../../state/timeline-view-window';
import {
  timelineTrackEndInsetPx,
  timelineTrackStartVisualOffsetPx,
} from './timeline-panel-layout';

/**
 * The shortest the graph is worth drawing at. It fills whatever the rows area
 * gives it and only scrolls when that is less than this, because a value curve
 * squeezed into a keyframe row's thirty-six pixels shows nothing a row does not.
 */
export const timelineValueGraphMinHeightPx = 140;

/**
 * A track drawn as what its value does, rather than as a row of diamonds.
 *
 * The diamond row answers "when", and the curve popover answers "what shape is
 * this one segment". Neither answers the question people actually bring to an
 * animation that is not working: what is the value doing. A move that
 * overshoots, a pair of keyframes further apart than they look, a track that
 * sits flat and then leaps — all of it is invisible on a row of identical
 * diamonds and obvious here.
 *
 * One track at a time, on its own axis. Overlaying every track would need each
 * one normalised to its own range, and then the height of a point would mean
 * nothing — which is the one thing this view is for.
 *
 * Dragging a point changes its value and not its time. Time already has a good
 * home on the diamond row, where a drag snaps and can move a whole selection;
 * doing both here would mean re-minting ids mid-drag (a keyframe's id is its
 * control and its time) and two history entries for one gesture.
 */
export function TimelineValueGraph({
  durationSeconds,
  group,
  onChangeKeyframeValue,
  onSelectKeyframe,
  selectedKeyframeIds,
  view,
}: {
  durationSeconds: number;
  group: ToolcraftTimelineKeyframeGroup | null;
  onChangeKeyframeValue: (keyframeId: string, value: number) => void;
  onSelectKeyframe: (keyframeId: string | null, additive: boolean) => void;
  selectedKeyframeIds: readonly string[];
  view: ToolcraftTimelineViewWindow;
}): React.JSX.Element {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ keyframeId: string; pointerId: number } | null>(null);
  const [draftValues, setDraftValues] = useState<Record<string, number>>({});

  if (!group) {
    return (
      <TimelineValueGraphMessage>
        Key a control to see its value over time.
      </TimelineValueGraphMessage>
    );
  }

  if (!isToolcraftTimelineValueGraphable(group)) {
    return (
      <TimelineValueGraphMessage>
        {group.label} does not hold a single number, so it has no height to draw.
      </TimelineValueGraphMessage>
    );
  }

  // Drafts are folded in before anything is measured, so the axis grows with a
  // point dragged past the top rather than letting it disappear off the frame.
  const draftedGroup: ToolcraftTimelineKeyframeGroup = {
    ...group,
    keyframes: group.keyframes.map((keyframe) =>
      keyframe.id in draftValues ? { ...keyframe, value: draftValues[keyframe.id] } : keyframe,
    ),
  };
  const range = getToolcraftTimelineValueGraphRange(draftedGroup);
  const points = sampleToolcraftTimelineValueGraph({
    endSeconds: Math.min(view.startSeconds + view.spanSeconds, durationSeconds),
    group: draftedGroup,
    startSeconds: Math.max(0, view.startSeconds),
  });
  const toX = (timeSeconds: number): number =>
    getToolcraftTimelineViewRatio(timeSeconds, view) * 100;
  const toY = (value: number): number => getToolcraftTimelineValueGraphRatio(value, range) * 100;
  const path = points
    .map(
      (point, index) =>
        `${index === 0 ? 'M' : 'L'} ${toX(point.timeSeconds).toFixed(3)} ${toY(point.value).toFixed(3)}`,
    )
    .join(' ');

  const readValueFromPointer = (clientY: number): number | null => {
    const frame = frameRef.current;

    if (!frame) {
      return null;
    }

    const rect = frame.getBoundingClientRect();

    if (rect.height <= 0) {
      return null;
    }

    const ratio = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));

    return getToolcraftTimelineValueGraphValue(ratio, range);
  };

  return (
    <div
      className="absolute inset-0 w-full select-none"
      data-slot="timeline-value-graph"
      style={{ minHeight: timelineValueGraphMinHeightPx }}
    >
      <div className="absolute inset-y-0 left-0 flex w-[164px] flex-col justify-between border-r border-[color:color-mix(in_oklab,var(--border)_6%,transparent)] px-3 py-2 text-[11px] leading-4">
        <span className="truncate text-[color:var(--foreground)]" title={group.label}>
          {group.label}
        </span>
        <span className="opacity-50 tabular-nums" data-slot="timeline-value-graph-max">
          {formatGraphValue(range.maxValue)}
        </span>
        <span className="opacity-50 tabular-nums" data-slot="timeline-value-graph-min">
          {formatGraphValue(range.minValue)}
        </span>
      </div>
      <div
        className="absolute inset-y-0 right-0"
        ref={frameRef}
        style={{
          left: 164 + timelineTrackStartVisualOffsetPx,
          right: timelineTrackEndInsetPx,
        }}
      >
        <svg
          className="absolute inset-0 h-full w-full overflow-visible"
          preserveAspectRatio="none"
          viewBox="0 0 100 100"
        >
          {[0, 50, 100].map((y) => (
            <line
              key={y}
              stroke="color-mix(in oklab, var(--border) 10%, transparent)"
              strokeWidth={0.3}
              vectorEffect="non-scaling-stroke"
              x1={0}
              x2={100}
              y1={y}
              y2={y}
            />
          ))}
          <path
            d={path}
            data-slot="timeline-value-graph-curve"
            fill="none"
            stroke="var(--link)"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {draftedGroup.keyframes.map((keyframe) => {
          const value = keyframe.value;

          if (typeof value !== 'number' || !Number.isFinite(value)) {
            return null;
          }

          const ratio = getToolcraftTimelineViewRatio(keyframe.timeSeconds, view);

          if (ratio < -0.001 || ratio > 1.001) {
            return null;
          }

          const isSelected = selectedKeyframeIds.includes(keyframe.id);

          return (
            <button
              aria-label={`${group.label} keyframe at ${keyframe.timeSeconds.toFixed(2)}s, value ${formatGraphValue(value)}`}
              className="absolute z-10 size-3 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize appearance-none rounded-full border-0 bg-transparent p-0 outline-none"
              data-selected={isSelected ? 'true' : undefined}
              data-slot="timeline-value-graph-point"
              key={keyframe.id}
              onPointerCancel={(event) => {
                if (dragRef.current?.pointerId !== event.pointerId) return;
                dragRef.current = null;
                setDraftValues({});
              }}
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                event.currentTarget.setPointerCapture?.(event.pointerId);
                dragRef.current = { keyframeId: keyframe.id, pointerId: event.pointerId };
                onSelectKeyframe(keyframe.id, event.shiftKey);
              }}
              onPointerMove={(event) => {
                const drag = dragRef.current;

                if (!drag || drag.pointerId !== event.pointerId) {
                  return;
                }

                const nextValue = readValueFromPointer(event.clientY);

                if (nextValue === null) {
                  return;
                }

                event.preventDefault();
                setDraftValues({ [drag.keyframeId]: nextValue });
              }}
              onPointerUp={(event) => {
                const drag = dragRef.current;

                if (!drag || drag.pointerId !== event.pointerId) {
                  return;
                }

                event.preventDefault();
                event.stopPropagation();

                if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
                  event.currentTarget.releasePointerCapture(event.pointerId);
                }

                const committed = draftValues[drag.keyframeId];

                dragRef.current = null;
                setDraftValues({});

                if (committed !== undefined) {
                  onChangeKeyframeValue(drag.keyframeId, committed);
                }
              }}
              style={{
                left: `${ratio * 100}%`,
                top: `${getToolcraftTimelineValueGraphRatio(value, range) * 100}%`,
              }}
              type="button"
            >
              <span
                aria-hidden="true"
                className={
                  isSelected
                    ? 'block size-full rounded-full bg-[color:var(--foreground)]'
                    : 'block size-full rounded-full bg-[color:var(--link)]'
                }
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TimelineValueGraphMessage({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div
      className="absolute inset-0 flex w-full items-center justify-center px-4 text-[11px] leading-4 opacity-50"
      data-slot="timeline-value-graph"
      style={{ minHeight: timelineValueGraphMinHeightPx }}
    >
      {children}
    </div>
  );
}

/** Short enough for an axis label, and never scientific notation. */
function formatGraphValue(value: number): string {
  const rounded = Math.round(value * 100) / 100;

  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}
