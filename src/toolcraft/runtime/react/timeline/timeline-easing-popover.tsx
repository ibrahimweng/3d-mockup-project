'use client';

import * as React from 'react';
import { Button, Popover, PopoverContent, PopoverTrigger } from '@/toolcraft/ui';

import type {
  ToolcraftTimelineBezierControlPoints,
  ToolcraftTimelineKeyframeEasing,
} from '../../state/types';
import { getToolcraftTimelineKeyframeEasing } from './timeline-easing-model';
import { TimelineEasingCurveIcon } from './timeline-easing-icons';
import { TimelineEasingPopoverContent } from './timeline-easing-popover-content';
import {
  getTimelineEasingPopoverAnchor,
  stopTimelineEasingEvent,
} from './timeline-easing-popover-layout';

/**
 * Which end of which segment the curve being edited belongs to.
 *
 * Named for the segment rather than borrowed from the preset list on purpose.
 * The presets are CSS names, where "Ease In" means a slow *start*, while the
 * same words in After Effects mean a slow *arrival* — the same two words,
 * opposite ends of the segment. Whichever naming the presets keep, "Leaving"
 * and "Arriving" say which side is being shaped without depending on them.
 */
type TimelineEasingSide = 'arriving' | 'leaving';

const timelineEasingSideOptions: readonly {
  description: string;
  label: string;
  side: TimelineEasingSide;
}[] = [
  {
    description: 'Shape the motion as it leaves this keyframe.',
    label: 'Leaving',
    side: 'leaving',
  },
  {
    description: 'Shape the motion as it arrives at this keyframe.',
    label: 'Arriving',
    side: 'arriving',
  },
];

function cn(...classNames: Array<string | false | null | undefined>): string {
  return classNames.filter(Boolean).join(' ');
}

export function TimelineKeyframeEasingPopover({
  easeIn,
  easing,
  label,
  onChange,
  onChangeEaseIn,
  selectedCount = 1,
}: {
  easeIn?: ToolcraftTimelineBezierControlPoints;
  easing?: ToolcraftTimelineKeyframeEasing;
  label: string;
  onChange?: (easing: ToolcraftTimelineKeyframeEasing) => void;
  onChangeEaseIn?: (controlPoints: ToolcraftTimelineBezierControlPoints | null) => void;
  /** How many keyframes a change here will reach, for the note below the tabs. */
  selectedCount?: number;
}): React.JSX.Element {
  const [side, setSide] = React.useState<TimelineEasingSide>('leaving');
  const isArriving = side === 'arriving';
  const resolvedEasing = getToolcraftTimelineKeyframeEasing(easing);
  // With nothing set, the arriving handle is still whatever the keyframe before
  // this one is giving the segment, which this popover cannot see. Showing the
  // default curve is honest about that: it is the shape you get by picking
  // anything here, and "Default" below puts the handle back where it was.
  const editedEasing: ToolcraftTimelineKeyframeEasing = isArriving
    ? { controlPoints: easeIn ?? [0.65, 0, 0.35, 1], type: 'bezier' }
    : resolvedEasing;

  const header = (
    <div className="flex flex-col gap-1.5 px-3 pt-3">
      <div className="flex items-center gap-1">
        {timelineEasingSideOptions.map((option) => (
          <button
            aria-pressed={option.side === side}
            className={cn(
              'flex-1 rounded-md border px-2 py-1 text-[11px] leading-4 transition-[background-color,border-color,color] duration-150 ease-out',
              option.side === side
                ? 'border-[color:color-mix(in_oklab,var(--border)_10%,transparent)] bg-[color:color-mix(in_oklab,var(--link)_12%,transparent)] text-[color:var(--foreground)]'
                : 'border-transparent text-[color:var(--muted-foreground)] hover:bg-[color:color-mix(in_oklab,var(--foreground)_6%,transparent)]',
            )}
            data-timeline-easing-side={option.side}
            key={option.side}
            onClick={() => setSide(option.side)}
            title={option.description}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
      {isArriving ? (
        <button
          className="self-start text-[11px] leading-4 text-[color:var(--muted-foreground)] underline-offset-2 hover:text-[color:var(--foreground)] hover:underline disabled:opacity-40 disabled:hover:no-underline"
          data-timeline-easing-clear-ease-in=""
          disabled={!easeIn}
          onClick={() => onChangeEaseIn?.(null)}
          type="button"
        >
          {easeIn ? 'Default arrival' : 'Arrival is default'}
        </button>
      ) : null}
      {selectedCount > 1 ? (
        <span className="text-[11px] leading-4 opacity-60">
          Applies to {selectedCount} selected keyframes.
        </span>
      ) : null}
    </div>
  );

  return (
    <Popover modal={false}>
      <PopoverTrigger
        render={
          <Button
            aria-label={`Edit ${label} keyframe curve`}
            className="text-[color:color-mix(in_oklab,var(--foreground)_75%,transparent)] hover:text-[color:var(--foreground)] data-popup-open:text-[color:var(--foreground)]"
            onClick={stopTimelineEasingEvent}
            onPointerDown={stopTimelineEasingEvent}
            size="icon-sm"
            type="button"
            variant="ghost"
          />
        }
      >
        <TimelineEasingCurveIcon easing={resolvedEasing} size={16} />
      </PopoverTrigger>
      <PopoverContent
        align="center"
        anchor={getTimelineEasingPopoverAnchor}
        className="toolcraft-panel-surface isolate w-auto gap-0 overflow-hidden rounded-lg border p-0 supports-backdrop-filter:backdrop-blur-2xl supports-backdrop-filter:backdrop-saturate-150"
        data-timeline-keyframe-easing-popover=""
        onClick={stopTimelineEasingEvent}
        onPointerDown={stopTimelineEasingEvent}
        side="bottom"
        sideOffset={6}
      >
        <TimelineEasingPopoverContent
          easing={editedEasing}
          header={header}
          jointKindsAllowed={!isArriving}
          key={side}
          onChange={(nextEasing) => {
            if (!isArriving) {
              onChange?.(nextEasing);
              return;
            }

            // Only a bezier can describe one handle, and the content withholds
            // the other two kinds while this side is showing.
            if (nextEasing.type === 'bezier') {
              onChangeEaseIn?.(nextEasing.controlPoints);
            }
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
