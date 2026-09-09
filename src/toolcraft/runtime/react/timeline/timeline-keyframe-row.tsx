'use client';

import * as React from 'react';
import { useRef, useState, type CSSProperties } from 'react';
import { Eye, EyeOff, Trash2 } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

import type {
  ToolcraftTimelineBezierControlPoints,
  ToolcraftTimelineKeyframe,
  ToolcraftTimelineKeyframeEasing,
  ToolcraftTimelineKeyframeGroup,
} from '../../state/types';
import {
  clampToolcraftTimelineTime,
  getToolcraftTimelineKeyframeId,
  roundToolcraftTimelineKeyframeTime,
} from '../../state/timeline-values';
import {
  getToolcraftTimelineViewRatio,
  getToolcraftTimelineViewTime,
  type ToolcraftTimelineViewWindow,
} from '../../state/timeline-view-window';
import {
  getToolcraftTimelineSnapToleranceSeconds,
  snapToolcraftTimelineTime,
} from '../../state/timeline-snapping';
import { TimelineIconButton } from './timeline-icon-button';
import {
  getTimelineKeyframeDisplayTime,
  type TimelineKeyframeDragPreview,
} from './timeline-keyframes';
import { TimelineKeyframeEasingPopover } from './timeline-easing-popover';
import {
  getTimelineCalcPositionStyle,
  timelineKeyframePresenceTransition,
  timelineKeyframeRowHeightPx,
  timelineTrackEndInsetPx,
  timelineTrackStartVisualOffsetPx,
} from './timeline-panel-layout';

type TimelineKeyframeDragState = {
  didMove: boolean;
  initialTimeSeconds: number;
  /** Every keyframe this drag moves, decided once at pointer down. */
  keyframeIds: ReadonlySet<string>;
  keyframeId: string;
  latestTimeSeconds: number;
  pointerId: number;
  trackElement: HTMLElement;
  wasSelectedOnPointerDown: boolean;
};

type TimelineKeyframeRowProps = {
  dragPreview: TimelineKeyframeDragPreview | null;
  durationSeconds: number;
  group: ToolcraftTimelineKeyframeGroup;
  isNested?: boolean;
  isScrubbing: boolean;
  onChangeKeyframeEaseIn: (
    keyframeId: string,
    controlPoints: ToolcraftTimelineBezierControlPoints | null,
  ) => void;
  onChangeKeyframeEasing: (keyframeId: string, easing: ToolcraftTimelineKeyframeEasing) => void;
  onDeleteControlKeyframes: (controlId: string) => void;
  onDragPreviewChange: (dragPreview: TimelineKeyframeDragPreview | null) => void;
  onKeyframeDragStart: () => void;
  onMoveSelectedKeyframes: (anchorKeyframeId: string, timeSeconds: number) => void;
  onSelectKeyframe: (keyframeId: string | null, additive: boolean) => void;
  selectedKeyframeId: string | null;
  selectedKeyframeIds: readonly string[];
  /** Times a dragged keyframe may land exactly on. Excludes what is moving. */
  snapTimesSeconds: readonly number[];
  view: ToolcraftTimelineViewWindow;
};

function cn(...classNames: Array<string | false | null | undefined>): string {
  return classNames.filter(Boolean).join(' ');
}

function formatTimelineSeconds(value: number): string {
  return value.toFixed(2);
}

function getTimelineKeyframePositionStyle(
  timeSeconds: number,
  view: ToolcraftTimelineViewWindow,
): CSSProperties {
  const ratio = getToolcraftTimelineViewRatio(timeSeconds, view);

  return getTimelineCalcPositionStyle(ratio, timelineTrackStartVisualOffsetPx * (1 - ratio));
}

function getTimelineTrackTimeFromClientX({
  clientX,
  durationSeconds,
  trackElement,
  view,
}: {
  clientX: number;
  durationSeconds: number;
  trackElement: HTMLElement;
  view: ToolcraftTimelineViewWindow;
}): number {
  const rect = trackElement.getBoundingClientRect();
  const trackLeft = rect.left + timelineTrackStartVisualOffsetPx;
  const trackWidth = Math.max(
    1,
    rect.width - timelineTrackStartVisualOffsetPx - timelineTrackEndInsetPx,
  );
  const ratio = Math.max(0, Math.min(1, (clientX - trackLeft) / trackWidth));

  return roundToolcraftTimelineKeyframeTime(
    clampToolcraftTimelineTime(getToolcraftTimelineViewTime(ratio, view), durationSeconds),
  );
}

export function TimelineKeyframeRow({
  dragPreview,
  durationSeconds,
  group,
  isNested = false,
  isScrubbing,
  onChangeKeyframeEaseIn,
  onChangeKeyframeEasing,
  onDeleteControlKeyframes,
  onDragPreviewChange,
  onKeyframeDragStart,
  onMoveSelectedKeyframes,
  onSelectKeyframe,
  selectedKeyframeId,
  selectedKeyframeIds,
  snapTimesSeconds,
  view,
}: TimelineKeyframeRowProps): React.JSX.Element {
  const [isVisible, setIsVisible] = useState(true);
  const keyframeDragRef = useRef<TimelineKeyframeDragState | null>(null);
  const keyframeClickIntentRef = useRef<{
    didMove: boolean;
    keyframeId: string;
    selectionSizeOnPointerDown: number;
    wasSelectedOnPointerDown: boolean;
  } | null>(null);
  const selectedGroupKeyframe = group.keyframes.find(
    (keyframe) => keyframe.id === selectedKeyframeId,
  );
  const getKeyframeTrackElement = (target: Element): HTMLElement | null =>
    target.closest('[data-slot="timeline-keyframe-track"]');
  /**
   * Which keyframes this press is about to drag.
   *
   * Decided here rather than read from the selection on the next render,
   * because the selection change dispatched below has not landed yet and the
   * first pointer move can arrive before it does. Pressing something already in
   * the selection drags the whole selection; pressing anything else drags only
   * it, which is what makes a plain click on one keyframe still a single move.
   */
  const getDragKeyframeIds = (keyframeId: string, additive: boolean): ReadonlySet<string> => {
    if (additive) {
      return new Set([...selectedKeyframeIds, keyframeId]);
    }

    return selectedKeyframeIds.includes(keyframeId)
      ? new Set(selectedKeyframeIds)
      : new Set([keyframeId]);
  };
  const handleKeyframePointerDown = (
    event: React.PointerEvent<HTMLButtonElement>,
    keyframe: ToolcraftTimelineKeyframe,
  ): void => {
    const trackElement = getKeyframeTrackElement(event.currentTarget);

    if (!trackElement) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);

    const additive = event.shiftKey;
    const keyframeIds = getDragKeyframeIds(keyframe.id, additive);

    // A shift-press commits its selection change immediately, because it is
    // the whole intent of the press. A plain press on something already
    // selected holds off until the click, so that pressing one keyframe of a
    // selection to drag the group does not first collapse the group to it.
    if (additive || !selectedKeyframeIds.includes(keyframe.id)) {
      onSelectKeyframe(keyframe.id, additive);
    }

    onKeyframeDragStart();
    const wasSelectedOnPointerDown = selectedKeyframeIds.includes(keyframe.id);

    keyframeClickIntentRef.current = additive
      ? null
      : {
          didMove: false,
          keyframeId: keyframe.id,
          selectionSizeOnPointerDown: selectedKeyframeIds.length,
          wasSelectedOnPointerDown,
        };
    keyframeDragRef.current = {
      didMove: false,
      initialTimeSeconds: keyframe.timeSeconds,
      keyframeId: keyframe.id,
      keyframeIds,
      latestTimeSeconds: keyframe.timeSeconds,
      pointerId: event.pointerId,
      trackElement,
      wasSelectedOnPointerDown,
    };
  };
  const handleKeyframePointerMove = (event: React.PointerEvent<HTMLButtonElement>): void => {
    const dragState = keyframeDragRef.current;

    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const pointerTimeSeconds = getTimelineTrackTimeFromClientX({
      clientX: event.clientX,
      durationSeconds,
      trackElement: dragState.trackElement,
      view,
    });
    // Alt places a keyframe wherever the pointer is, the escape hatch every
    // snapping timeline has. Snapping is on by default here rather than off
    // behind Shift as it is in After Effects, because Shift is already how you
    // add to a selection and because the times worth landing on exactly --
    // the playhead, the two ends of the loop -- are the ones that are hardest
    // to hit by hand at a hundredth of a second.
    const nextTimeSeconds = event.altKey
      ? pointerTimeSeconds
      : roundToolcraftTimelineKeyframeTime(
          snapToolcraftTimelineTime({
            candidateSeconds: pointerTimeSeconds,
            snapTimesSeconds,
            toleranceSeconds: getToolcraftTimelineSnapToleranceSeconds(
              view,
              dragState.trackElement.getBoundingClientRect().width -
                timelineTrackStartVisualOffsetPx -
                timelineTrackEndInsetPx,
            ),
          }),
        );

    dragState.latestTimeSeconds = nextTimeSeconds;
    const didMove = nextTimeSeconds !== dragState.initialTimeSeconds;
    dragState.didMove = didMove;

    if (keyframeClickIntentRef.current?.keyframeId === dragState.keyframeId) {
      keyframeClickIntentRef.current.didMove = didMove;
    }

    onDragPreviewChange({
      anchorKeyframeId: dragState.keyframeId,
      keyframeIds: dragState.keyframeIds,
      offsetSeconds: nextTimeSeconds - dragState.initialTimeSeconds,
    });
  };
  const endKeyframeDrag = (event: React.PointerEvent<HTMLButtonElement>): void => {
    const dragState = keyframeDragRef.current;

    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (dragState.didMove) {
      onMoveSelectedKeyframes(dragState.keyframeId, dragState.latestTimeSeconds);
    }

    onDragPreviewChange(null);
    keyframeDragRef.current = null;
  };

  return (
    <motion.div
      animate={{ height: timelineKeyframeRowHeightPx, opacity: 1 }}
      className={cn(
        'w-full shrink-0 overflow-hidden border-t border-[color:color-mix(in_oklab,var(--border)_6%,transparent)] transition-colors duration-150 ease-out select-none first:border-t-0',
        selectedGroupKeyframe
          ? 'bg-[color:color-mix(in_oklab,var(--foreground)_3%,transparent)]'
          : !isScrubbing && 'hover:bg-[color:color-mix(in_oklab,var(--foreground)_3%,transparent)]',
      )}
      data-scrubbing={isScrubbing ? 'true' : 'false'}
      data-slot="timeline-keyframe-row"
      data-visible={isVisible ? 'true' : 'false'}
      exit={{ height: 0, opacity: 0 }}
      initial={{ height: 0, opacity: 0 }}
      transition={timelineKeyframePresenceTransition}
    >
      <div className="grid h-9 w-full grid-cols-[164px_minmax(0,1fr)_36px] overflow-visible">
        <div
          className={cn(
            'flex h-full min-w-0 items-center gap-1.5 border-r border-[color:color-mix(in_oklab,var(--border)_6%,transparent)] pr-1.5 text-[11px] leading-4 text-[color:color-mix(in_oklab,var(--foreground)_75%,transparent)] select-none',
            // Indented under the object it belongs to, so the tree reads as one.
            isNested ? 'pl-6' : 'pl-1',
          )}
        >
          <TimelineIconButton
            label={`Toggle ${group.label} visibility`}
            onClick={() => setIsVisible((currentValue) => !currentValue)}
            size="icon-sm"
            tooltipSide="top"
          >
            {isVisible ? (
              <Eye data-icon="visibility-visible" />
            ) : (
              <EyeOff data-icon="visibility-hidden" />
            )}
          </TimelineIconButton>
          <span
            className={cn(
              'block min-w-0 flex-1 truncate pr-2 transition-[color,opacity] duration-150 ease-out',
              !isVisible && 'text-[color:var(--foreground)] opacity-40',
            )}
            title={group.label}
          >
            {group.label}
          </span>
          {selectedGroupKeyframe ? (
            <span className="ml-auto flex shrink-0" data-slot="timeline-keyframe-easing-control">
              <TimelineKeyframeEasingPopover
                easeIn={selectedGroupKeyframe.easeIn}
                easing={selectedGroupKeyframe.easing}
                label={group.label}
                onChange={(nextEasing) =>
                  onChangeKeyframeEasing(selectedGroupKeyframe.id, nextEasing)
                }
                onChangeEaseIn={(controlPoints) =>
                  onChangeKeyframeEaseIn(selectedGroupKeyframe.id, controlPoints)
                }
                selectedCount={selectedKeyframeIds.length}
              />
            </span>
          ) : null}
        </div>
        <div
          className="relative h-full min-h-0 overflow-visible border-r border-[color:color-mix(in_oklab,var(--border)_6%,transparent)]"
          data-slot="timeline-keyframe-track"
        >
          <div
            className={cn(
              'absolute inset-0 overflow-visible',
              isVisible ? 'text-[color:var(--link)]' : 'text-[color:var(--foreground)]',
            )}
            data-slot="timeline-keyframe-track-content"
            style={{ opacity: isVisible ? undefined : 0.15 }}
          >
            <span
              className={cn(
                'absolute top-1/2 right-0 h-px -translate-y-1/2',
                isVisible
                  ? 'bg-[color:color-mix(in_oklab,currentColor_40%,transparent)]'
                  : 'bg-current',
              )}
              style={{ left: timelineTrackStartVisualOffsetPx }}
            />
            <AnimatePresence initial={false}>
              {group.keyframes.map((keyframe) => {
                const isSelected = selectedKeyframeIds.includes(keyframe.id);
                const displayTimeSeconds = getTimelineKeyframeDisplayTime(keyframe, dragPreview);
                const viewRatio = getToolcraftTimelineViewRatio(displayTimeSeconds, view);

                // The track does not clip, so a keyframe outside a zoomed window
                // would otherwise be drawn over the properties column beside it.
                if (viewRatio < -0.001 || viewRatio > 1.001) {
                  return null;
                }

                return (
                  <motion.button
                    animate={{ opacity: 1 }}
                    aria-label={`${group.label} keyframe at ${formatTimelineSeconds(
                      keyframe.timeSeconds,
                    )}s`}
                    aria-pressed={isSelected}
                    className="absolute top-1/2 z-30 m-0 size-2 -translate-x-1/2 -translate-y-1/2 cursor-default appearance-none border-0 bg-transparent p-0 text-current outline-none"
                    data-selected={isSelected ? 'true' : undefined}
                    data-slot="timeline-keyframe"
                    exit={{ opacity: 0 }}
                    initial={{ opacity: 0 }}
                    key={keyframe.id}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      const clickIntent = keyframeClickIntentRef.current;

                      keyframeClickIntentRef.current = null;

                      // A shift-click settled the selection on pointer down --
                      // adding or removing this keyframe is the whole point of
                      // it -- so there is nothing left for the click to decide.
                      // Falling through to the branch below would have read the
                      // selection it had just changed and cleared the lot.
                      if (!clickIntent || clickIntent.didMove) {
                        return;
                      }

                      // Everything here is judged on the selection as it was
                      // before the press, because pressing an unselected
                      // keyframe already selected it. Clicking the one selected
                      // keyframe clears it; clicking one of several narrows to
                      // it, which is how a group is broken up after being
                      // dragged; clicking an unselected one selects it.
                      onSelectKeyframe(
                        clickIntent.wasSelectedOnPointerDown &&
                          clickIntent.selectionSizeOnPointerDown === 1
                          ? null
                          : keyframe.id,
                        false,
                      );
                    }}
                    onPointerCancel={endKeyframeDrag}
                    onPointerDown={(event) => handleKeyframePointerDown(event, keyframe)}
                    onPointerMove={handleKeyframePointerMove}
                    onPointerUp={endKeyframeDrag}
                    style={getTimelineKeyframePositionStyle(displayTimeSeconds, view)}
                    title={keyframe.valueLabel}
                    transition={timelineKeyframePresenceTransition}
                    type="button"
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'absolute top-1/2 left-1/2 block size-[7px] -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[1px]',
                        isSelected && isVisible ? 'bg-[color:var(--foreground)]' : 'bg-current',
                      )}
                    />
                  </motion.button>
                );
              })}
            </AnimatePresence>
          </div>
        </div>
        <div className="flex h-full min-w-0 items-center justify-center">
          <TimelineIconButton
            label={`Delete ${group.label} keyframes`}
            onClick={() => {
              onSelectKeyframe(null, false);
              onDeleteControlKeyframes(group.controlId);
            }}
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
