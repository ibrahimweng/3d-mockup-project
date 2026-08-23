'use client';

import * as React from 'react';
import { ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import { motion } from 'motion/react';

import type { ToolcraftTimelineObjectTrack } from '../../state/timeline-object-tracks';
import {
  getToolcraftTimelineViewRatio,
  type ToolcraftTimelineViewWindow,
} from '../../state/timeline-view-window';
import { TimelineIconButton } from './timeline-icon-button';
import {
  getTimelineCalcPositionStyle,
  timelineKeyframePresenceTransition,
  timelineKeyframeRowHeightPx,
  timelineTrackStartVisualOffsetPx,
} from './timeline-panel-layout';

type TimelineObjectTrackRowProps = {
  isExpanded: boolean;
  isScrubbing: boolean;
  onDeleteObjectKeyframes: (track: ToolcraftTimelineObjectTrack) => void;
  onScrubToTime: (timeSeconds: number) => void;
  onToggleExpanded: (objectId: string) => void;
  track: ToolcraftTimelineObjectTrack;
  view: ToolcraftTimelineViewWindow;
};

function cn(...classNames: Array<string | false | null | undefined>): string {
  return classNames.filter(Boolean).join(' ');
}

function formatTimelineSeconds(value: number): string {
  return value.toFixed(2);
}

function formatPropertyCount(count: number): string {
  return `${count} ${count === 1 ? 'property' : 'properties'}`;
}

/**
 * The object's own row: what it is, and every moment it moves.
 *
 * Collapsed, the merged marks are the whole summary of the object — clicking
 * one takes the playhead there. Editing an individual key stays with the
 * property rows underneath, where it is unambiguous which key you are holding.
 */
export function TimelineObjectTrackRow({
  isExpanded,
  isScrubbing,
  onDeleteObjectKeyframes,
  onScrubToTime,
  onToggleExpanded,
  track,
  view,
}: TimelineObjectTrackRowProps): React.JSX.Element {
  const visibleKeyframeTimes = isExpanded
    ? []
    : track.keyframeTimes.filter((timeSeconds) => {
        const ratio = getToolcraftTimelineViewRatio(timeSeconds, view);

        return ratio >= -0.001 && ratio <= 1.001;
      });

  return (
    <motion.div
      animate={{ height: timelineKeyframeRowHeightPx, opacity: 1 }}
      className="w-full shrink-0 overflow-hidden border-t border-[color:color-mix(in_oklab,var(--border)_10%,transparent)] bg-[color:color-mix(in_oklab,var(--foreground)_4%,transparent)] select-none first:border-t-0"
      data-object-id={track.objectId}
      data-slot="timeline-object-track-row"
      exit={{ height: 0, opacity: 0 }}
      initial={{ height: 0, opacity: 0 }}
      transition={timelineKeyframePresenceTransition}
    >
      <div className="grid h-full min-w-0 grid-cols-[164px_minmax(0,1fr)_36px]">
        <div className="flex min-w-0 items-center gap-1 pr-2 pl-1.5 text-[11px] leading-4 text-[color:var(--foreground)]">
          <TimelineIconButton
            label={`${isExpanded ? 'Collapse' : 'Expand'} ${track.label} track`}
            onClick={() => onToggleExpanded(track.objectId)}
            size="icon-sm"
            tooltipSide="top"
          >
            {isExpanded ? (
              <ChevronDown data-icon="track-expanded" />
            ) : (
              <ChevronRight data-icon="track-collapsed" />
            )}
          </TimelineIconButton>
          <span className="min-w-0 truncate font-medium" title={track.label}>
            {track.label}
          </span>
          {isExpanded ? null : (
            <span className="ml-auto shrink-0 text-[10px] text-[color:var(--muted-foreground)] tabular-nums">
              {formatPropertyCount(track.groups.length)}
            </span>
          )}
        </div>
        <div
          className="relative h-full min-h-0 overflow-visible border-r border-[color:color-mix(in_oklab,var(--border)_6%,transparent)]"
          data-slot="timeline-object-track"
        >
          {visibleKeyframeTimes.map((timeSeconds) => {
            const ratio = getToolcraftTimelineViewRatio(timeSeconds, view);

            return (
              <button
                aria-label={`${track.label} keyframes at ${formatTimelineSeconds(timeSeconds)}s`}
                className={cn(
                  'absolute top-1/2 z-30 m-0 size-2 -translate-x-1/2 -translate-y-1/2 appearance-none border-0 bg-transparent p-0 text-[color:var(--link)] outline-none',
                  isScrubbing ? 'cursor-default' : 'cursor-pointer',
                )}
                data-slot="timeline-object-keyframe"
                key={timeSeconds}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onScrubToTime(timeSeconds);
                }}
                onPointerDown={(event) => event.stopPropagation()}
                style={getTimelineCalcPositionStyle(
                  ratio,
                  timelineTrackStartVisualOffsetPx * (1 - ratio),
                )}
                title={`${formatTimelineSeconds(timeSeconds)}s`}
                type="button"
              >
                <span
                  aria-hidden="true"
                  className="absolute top-1/2 left-1/2 block size-[7px] -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[1px] bg-current"
                />
              </button>
            );
          })}
        </div>
        <div className="flex h-full min-w-0 items-center justify-center">
          <TimelineIconButton
            label={`Delete ${track.label} keyframes`}
            onClick={() => onDeleteObjectKeyframes(track)}
            size="icon-sm"
            tooltipSide="top"
          >
            <Trash2 />
          </TimelineIconButton>
        </div>
      </div>
    </motion.div>
  );
}
