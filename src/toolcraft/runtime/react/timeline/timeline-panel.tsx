'use client';

import * as React from 'react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { PanelSurface } from '@/toolcraft/ui';
import { motion } from 'motion/react';

import type {
  ToolcraftPanelState,
  ToolcraftState,
  ToolcraftTimelineKeyframeEasing,
  ToolcraftTimelineKeyframeGroup,
} from '../../state/types';
import { isTimelineReadyForPlayback } from '../../state/timeline-readiness';
import { getToolcraftTimelineObjectTracks } from '../../state/timeline-object-tracks';
import {
  clampToolcraftTimelineDurationSeconds,
  clampToolcraftTimelineTime,
  getToolcraftTimelineKeyframeId,
} from '../../state/timeline-values';
import {
  clampToolcraftTimelineZoom,
  createToolcraftTimelineViewWindow,
  getToolcraftTimelinePannedViewStart,
  getToolcraftTimelineViewStartForAnchor,
  getToolcraftTimelineViewStartForVisibleTime,
  toolcraftTimelineMinZoom,
} from '../../state/timeline-view-window';
import {
  getTimelineEventTargetElement,
  isEditableTimelineEventTarget,
  isTimelineInteractiveElement,
} from './timeline-event-targets';
import { TimelineExpandedContent } from './timeline-expanded-content';
import { findTimelineKeyframe } from './timeline-keyframes';
import {
  TimelinePanelHeader,
  TimelinePanelMask,
} from './timeline-panel-header';
import {
  timelinePanelExpandedWidthPx,
  useTimelinePanelResponsiveLayout,
} from './timeline-panel-responsive-layout';
import { timelineKeyframeRowHeightPx } from './timeline-panel-layout';
import { useTimelineClock, useTimelineScrubber } from './timeline-playback-hooks';
import { PanelContainer } from '../panel-host/panel-host';
import { useToolcraftPanelBinding } from '../panel-host/use-toolcraft-panel-binding';
import type { PanelPlacement, PanelStateChange } from '../panel-host/panel-host-types';
import { useToolcraftStore } from '../app-shell/toolcraft-store-context';
import {
  useToolcraftCommittedSelector,
  useToolcraftDependencySelector,
} from '../app-shell/toolcraft-selectors';
import { useToolcraftDispatch } from '../app-shell/use-toolcraft';

type TimelinePanelProps = {
  className?: string;
  defaultExpanded?: boolean;
  framed?: boolean;
  onPanelStateChange?: PanelStateChange;
  panelPlacement?: PanelPlacement;
  panelState?: ToolcraftPanelState;
  variant?: 'compact' | 'extended';
};

function cn(...classNames: Array<string | false | null | undefined>): string {
  return classNames.filter(Boolean).join(' ');
}

const timelinePanelCollapsedSize = { height: 36 } as const;
const timelinePanelCompactWidthPx = 36;
const timelinePanelCollapsedWidthPx = 256;
const timelinePanelSurfaceBorderHeightPx = 2;
const timelinePanelHeaderHeightPx = 36;
const timelineExpandedRulerHeightPx = 36;
const timelineEmptyStateHeightPx = timelineKeyframeRowHeightPx;
// Grouping put an object row above each property row, so the same number of
// keyed controls now asks for more rows than it used to.
const maxVisibleTimelineKeyframeRows = 10;
const timelineKeyframeListMaxHeightPx =
  maxVisibleTimelineKeyframeRows * timelineKeyframeRowHeightPx;
const timelinePanelExpandCollapseTransition = {
  damping: 34,
  mass: 0.85,
  stiffness: 330,
  type: 'spring',
} as const;
const timelinePanelResizeTransition = {
  duration: 0.16,
  ease: [0.22, 1, 0.36, 1],
} as const;
const playbackDependencies = [{ kind: 'playback' }] as const;
const selectSchema = (state: ToolcraftState) => state.schema;
const selectMediaAssets = (state: ToolcraftState) => state.mediaAssets;
const selectCommittedTimeline = (state: ToolcraftState) => state.timeline;
const selectCurrentTimeSeconds = (state: ToolcraftState) =>
  state.timeline.currentTimeSeconds;

function getTimelinePanelExpandedSize(rowCount: number): {
  height: number;
  width: number;
} {
  const rowAreaHeight =
    rowCount > 0
      ? Math.min(rowCount * timelineKeyframeRowHeightPx, timelineKeyframeListMaxHeightPx)
      : timelineEmptyStateHeightPx;

  return {
    height:
      timelinePanelSurfaceBorderHeightPx +
      timelinePanelHeaderHeightPx +
      timelineExpandedRulerHeightPx +
      rowAreaHeight,
    width: timelinePanelExpandedWidthPx,
  };
}

export function TimelinePanel({
  className,
  defaultExpanded = false,
  framed = true,
  onPanelStateChange,
  panelPlacement,
  panelState,
  variant = 'extended',
}: TimelinePanelProps): React.JSX.Element | null {
  const dispatch = useToolcraftDispatch();
  const panelBinding = useToolcraftPanelBinding({
    onPanelStateChange,
    panelId: 'timeline',
    panelState,
  });
  const resolvedPanelState = panelBinding.panelState;
  const store = useToolcraftStore();
  const schema = useToolcraftCommittedSelector(selectSchema);
  const mediaAssets = useToolcraftCommittedSelector(selectMediaAssets);
  const timeline = useToolcraftCommittedSelector(selectCommittedTimeline);
  const currentTimeSeconds = useToolcraftDependencySelector(
    selectCurrentTimeSeconds,
    Object.is,
    playbackDependencies,
  );

  if (!schema.panels.timeline) {
    return null;
  }

  const keyframesEnabled = schema.assembly.capabilities.includes('timeline.keyframes');
  const playbackReady = isTimelineReadyForPlayback(schema, mediaAssets);

  const {
    durationSeconds,
    expanded,
    isLooping,
    isPlaying,
    keyframeGroups,
    selectedKeyframeId,
  } = timeline;
  const [defaultExpandedPending, setDefaultExpandedPending] = useState(defaultExpanded);
  const [isHoverPaused, setIsHoverPaused] = useState(false);
  const [zoom, setZoom] = useState(toolcraftTimelineMinZoom);
  const [viewStartSeconds, setViewStartSeconds] = useState(0);
  const [collapsedObjectIds, setCollapsedObjectIds] = useState<readonly string[]>([]);
  const displayedIsPlaying = playbackReady && isPlaying;
  const isCompact = variant === 'compact';
  const isExpanded = !isCompact && keyframesEnabled && (expanded || defaultExpandedPending);
  const objectTracks = useMemo(
    () => getToolcraftTimelineObjectTracks(keyframeGroups),
    [keyframeGroups],
  );
  /**
   * Every time something is keyed at, in order and without repeats.
   *
   * Two controls keyed at the same moment are one place to step to, not two,
   * which is why this is a set before it is a list.
   */
  const keyframeTimesSeconds = useMemo(
    () =>
      Array.from(
        new Set(
          keyframeGroups.flatMap((group) =>
            group.keyframes.map((keyframe) => keyframe.timeSeconds),
          ),
        ),
      ).sort((first, second) => first - second),
    [keyframeGroups],
  );
  const visibleRowCount = objectTracks.reduce(
    (total, track) =>
      total + 1 + (collapsedObjectIds.includes(track.objectId) ? 0 : track.groups.length),
    0,
  );
  const expandedPanelSize = getTimelinePanelExpandedSize(visibleRowCount);
  // Only the expanded track can be zoomed; the collapsed header always draws the
  // whole loop, so it asks for a window that covers all of it.
  const view = useMemo(
    () =>
      createToolcraftTimelineViewWindow({
        durationSeconds,
        startSeconds: viewStartSeconds,
        zoom: isExpanded ? zoom : toolcraftTimelineMinZoom,
      }),
    [durationSeconds, isExpanded, viewStartSeconds, zoom],
  );
  const previousIsExpandedRef = useRef(isExpanded);
  const followedTimeRef = useRef(currentTimeSeconds);
  const isExpandCollapseTransition = previousIsExpandedRef.current !== isExpanded;
  const timelinePanelTransition = isExpandCollapseTransition
    ? timelinePanelExpandCollapseTransition
    : timelinePanelResizeTransition;

  useEffect(() => {
    previousIsExpandedRef.current = isExpanded;
  }, [isExpanded]);
  useEffect(() => {
    if (playbackReady) {
      return;
    }

    if (currentTimeSeconds !== 0) {
      dispatch({ currentTimeSeconds: 0, type: 'timeline.setCurrentTime' });
    }

    if (isPlaying) {
      dispatch({ isPlaying: false, type: 'timeline.setPlaying' });
    }
  }, [currentTimeSeconds, dispatch, isPlaying, playbackReady]);
  useEffect(() => {
    if (!defaultExpanded || !keyframesEnabled) {
      return;
    }

    dispatch({ expanded: true, type: 'timeline.setExpanded' });
    setDefaultExpandedPending(false);
  }, [defaultExpanded, dispatch, keyframesEnabled]);

  const setCurrentTimeSeconds = useCallback(
    (nextValue: React.SetStateAction<number>): void => {
      const currentTime = store.getState().timeline.currentTimeSeconds;
      const resolvedValue =
        typeof nextValue === 'function'
          ? nextValue(currentTime)
          : nextValue;

      store.dispatchTransient({
        currentTimeSeconds: resolvedValue,
        type: 'timeline.setCurrentTime',
      });
    },
    [store],
  );
  const commitCurrentTimeSeconds = useCallback((): void => {
    store.commitTransient('playback');
  }, [store]);
  const getCurrentTimeSeconds = useCallback(
    (): number => store.getState().timeline.currentTimeSeconds,
    [store],
  );
  const setIsPlaying = useCallback(
    (nextValue: React.SetStateAction<boolean>): void => {
      const currentIsPlaying = store.getState().timeline.isPlaying;
      const resolvedValue =
        typeof nextValue === 'function' ? nextValue(currentIsPlaying) : nextValue;

      dispatch({ isPlaying: resolvedValue, type: 'timeline.setPlaying' });
    },
    [dispatch, store],
  );
  /**
   * One place playback is started and stopped from, because the button and the
   * spacebar have to do the same thing — including standing the hover pause
   * down, which is what made a press of the button behave differently from a
   * press of the key when they were written separately.
   */
  const togglePlayback = useCallback((): void => {
    setIsHoverPaused(false);

    if (store.getState().timeline.isPlaying) {
      setIsPlaying(false);
      return;
    }

    dispatch({ type: 'timeline.togglePlayback' });
  }, [dispatch, setIsPlaying, store]);
  /**
   * Move the playhead to the next or previous time something is keyed.
   *
   * A small tolerance keeps a press from landing on the keyframe it is already
   * sitting on: floating-point times never compare equal to the playhead
   * exactly, so without it the first press of Next would go nowhere. Playback
   * stops, because stepping is something a person does to look at one frame.
   */
  const stepToKeyframe = useCallback(
    (direction: -1 | 1): void => {
      const { timeline } = store.getState();
      const times = Array.from(
        new Set(
          timeline.keyframeGroups.flatMap((group) =>
            group.keyframes.map((keyframe) => keyframe.timeSeconds),
          ),
        ),
      ).sort((first, second) => first - second);

      if (times.length === 0) {
        return;
      }

      const tolerance = 0.001;
      const from = timeline.currentTimeSeconds;
      const next =
        direction === 1
          ? times.find((time) => time > from + tolerance)
          : [...times].reverse().find((time) => time < from - tolerance);

      if (next === undefined) {
        return;
      }

      setIsPlaying(false);
      dispatch({ currentTimeSeconds: next, type: 'timeline.setCurrentTime' });
    },
    [dispatch, setIsPlaying, store],
  );
  /**
   * Space plays and pauses, from anywhere in the app.
   *
   * It listens on the document rather than on the panel because the thing a
   * person is looking at while they reach for it is the preview, not the
   * timeline, and a handler on the panel only fires once the panel has focus.
   *
   * Two exclusions. Anything that takes typed text keeps its own space — a
   * duration field, a layer being renamed, a search box. And anything that
   * already answers to space keeps it too: a focused button, link or switch
   * would otherwise be pressed and toggle playback in the same keystroke, so
   * this stands down and lets the control do its own job.
   *
   * It lives here rather than beside the app's other shortcuts because of what
   * `togglePlayback` does above it. The panel stands its clock down while the
   * pointer is over it, so a dispatch that only flips `isPlaying` turns the
   * transport to Playing and leaves the playhead exactly where it was — which
   * is what the app-level handler did, and why space appeared to do nothing.
   * Clearing that hover pause needs state only the panel has.
   */
  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== ' ' && event.code !== 'Space') {
        return;
      }

      if (event.altKey || event.ctrlKey || event.metaKey || event.repeat) {
        return;
      }

      const target = event.target instanceof Element ? event.target : null;

      if (
        target?.closest(
          'input, textarea, select, [contenteditable="true"], [contenteditable=""], button, a[href], [role="button"], [role="switch"], [role="menuitem"], [role="option"], [role="combobox"]',
        )
      ) {
        return;
      }

      event.preventDefault();
      togglePlayback();
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [togglePlayback]);
  const setSelectedKeyframeId = useCallback(
    (keyframeId: string | null): void => {
      dispatch({ keyframeId, type: 'timeline.selectKeyframe' });
    },
    [dispatch],
  );
  const scrubber = useTimelineScrubber({
    commitCurrentTimeSeconds,
    currentTimeSeconds,
    disabled: !playbackReady,
    durationSeconds,
    setCurrentTimeSeconds,
    setIsPlaying,
    view,
  });
  useEffect(() => {
    // A zoomed window would otherwise sit still while the playhead ran off the
    // end of it, so the window trails the playhead once it nears an edge. This
    // is also how you pan by hand: drag the playhead into the edge and the
    // window follows it into the part of the loop you were reaching for.
    //
    // Only a move of the playhead pulls the window, never a move of the window
    // itself — otherwise panning away from the playhead would be undone on the
    // very next render, and the loop beyond the current slice unreachable.
    if (followedTimeRef.current === currentTimeSeconds) {
      return;
    }

    followedTimeRef.current = currentTimeSeconds;

    const nextStartSeconds = getToolcraftTimelineViewStartForVisibleTime({
      timeSeconds: currentTimeSeconds,
      view,
    });

    if (nextStartSeconds !== view.startSeconds) {
      setViewStartSeconds(nextStartSeconds);
    }
  }, [currentTimeSeconds, view]);
  const deleteKeyframe = useCallback(
    (keyframeId: string): void => {
      dispatch({ keyframeId, type: 'timeline.deleteKeyframe' });
    },
    [dispatch],
  );
  const moveKeyframe = useCallback(
    (keyframeId: string, nextTimeSeconds: number): string | null => {
      const targetKeyframe = findTimelineKeyframe(keyframeGroups, keyframeId);

      if (!targetKeyframe) {
        return null;
      }

      const nextSelectedKeyframeId = getToolcraftTimelineKeyframeId(
        targetKeyframe.controlId,
        nextTimeSeconds,
      );

      dispatch({
        keyframeId,
        timeSeconds: nextTimeSeconds,
        type: 'timeline.moveKeyframe',
      });

      return nextSelectedKeyframeId;
    },
    [dispatch, keyframeGroups],
  );

  useTimelineClock({
    durationSeconds,
    getCurrentTimeSeconds,
    hasKeyframes: keyframeGroups.length > 0,
    playbackRate: timeline.playbackRate,
    isHoverPaused,
    isLooping,
    isPlaying: displayedIsPlaying,
    isScrubbing: scrubber.isScrubbing,
    setCurrentTimeSeconds,
    setIsPlaying,
  });

  useEffect(() => {
    if (!selectedKeyframeId || typeof document === 'undefined') {
      return;
    }

    const handleDocumentKeyDown = (event: KeyboardEvent): void => {
      if (
        event.defaultPrevented ||
        (event.key !== 'Delete' && event.key !== 'Backspace' && event.key !== 'Escape') ||
        isEditableTimelineEventTarget(event.target)
      ) {
        return;
      }

      event.preventDefault();

      if (event.key === 'Escape') {
        setSelectedKeyframeId(null);
        return;
      }

      deleteKeyframe(selectedKeyframeId);
    };

    document.addEventListener('keydown', handleDocumentKeyDown);

    return () => {
      document.removeEventListener('keydown', handleDocumentKeyDown);
    };
  }, [deleteKeyframe, selectedKeyframeId]);

  useEffect(() => {
    if (!selectedKeyframeId || typeof document === 'undefined') {
      return;
    }

    const handleDocumentPointerDown = (event: PointerEvent): void => {
      const targetElement = getTimelineEventTargetElement(event.target);
      const clickedKeyframe = targetElement?.closest('[data-slot="timeline-keyframe"]');
      const clickedEasingPopover = targetElement?.closest(
        '[data-timeline-keyframe-easing-popover]',
      );
      const clickedTimelinePanel = targetElement?.closest('[data-slot="timeline-panel"]');
      const clickedTimelineInteractiveElement =
        clickedTimelinePanel && isTimelineInteractiveElement(event.target);

      if (!clickedKeyframe && !clickedEasingPopover && !clickedTimelineInteractiveElement) {
        setSelectedKeyframeId(null);
      }
    };

    document.addEventListener('pointerdown', handleDocumentPointerDown, { capture: true });

    return () => {
      document.removeEventListener('pointerdown', handleDocumentPointerDown, { capture: true });
    };
  }, [selectedKeyframeId]);

  /**
   * Lay a preset's keyframes at each end of the loop.
   *
   * The runtime does not know what a turntable is: it reads the product's own
   * description of which controls move and between what, keys each at zero,
   * and moves it to its far value at the end. Anything already keyed on those
   * controls is cleared first, so pressing it twice gives one animation rather
   * than two fighting over the same rows.
   */
  const timelineAnimations = schema.panels.timeline?.animations ?? [];
  const addAnimation = (animationId: string): void => {
    const animation = timelineAnimations.find((entry) => entry.id === animationId);

    if (!animation) {
      return;
    }

    for (const track of animation.tracks) {
      dispatch({ controlId: track.target, type: 'timeline.deleteControlKeyframes' });
      dispatch({
        controlId: track.target,
        controlLabel: track.controlLabel,
        timeSeconds: 0,
        type: 'timeline.toggleControlKeyframes',
        value: track.from,
        valueLabel: String(track.from),
      });
      dispatch({
        controlId: track.target,
        controlLabel: track.controlLabel,
        timeSeconds: durationSeconds,
        type: 'timeline.upsertControlKeyframe',
        value: track.to,
        valueLabel: String(track.to),
      });
      // The easing belongs to the keyframe the segment leaves from, so it is
      // set on the first one. Without this a looping preset inherits the
      // editor's ease-in-out and stops dead once a cycle.
      if (track.easing) {
        dispatch({
          easing: track.easing,
          keyframeId: `${track.target}::0`,
          type: 'timeline.changeKeyframeEasing',
        });
      }
    }
    // Laying down an animation is the moment there is something to play, so it
    // is the moment playback starts. The timeline opens paused because a loop
    // with nothing keyed has nothing to show.
    dispatch({ isPlaying: true, type: 'timeline.setPlaying' });
  };
  const toggleObjectExpanded = (objectId: string): void => {
    setCollapsedObjectIds((currentIds) =>
      currentIds.includes(objectId)
        ? currentIds.filter((id) => id !== objectId)
        : [...currentIds, objectId],
    );
  };
  const scrubToTime = (timeSeconds: number): void => {
    setIsPlaying(false);
    dispatch({
      currentTimeSeconds: clampToolcraftTimelineTime(timeSeconds, durationSeconds),
      type: 'timeline.setCurrentTime',
    });
  };
  const panView = (deltaSeconds: number): void => {
    setViewStartSeconds(getToolcraftTimelinePannedViewStart({ deltaSeconds, view }));
  };
  const changeZoom = (nextZoom: number): void => {
    const clampedZoom = clampToolcraftTimelineZoom(nextZoom);

    // Zoom about the playhead rather than about the start of the loop, so the
    // frame you are looking at is still the frame you are looking at.
    setViewStartSeconds(
      getToolcraftTimelineViewStartForAnchor({
        anchorSeconds: currentTimeSeconds,
        durationSeconds,
        view,
        zoom: clampedZoom,
      }),
    );
    setZoom(clampedZoom);
  };
  const commitCurrentTimeValue = (nextValue: string): void => {
    const parsed = Number.parseFloat(nextValue);

    if (!Number.isFinite(parsed)) {
      return;
    }

    dispatch({
      currentTimeSeconds: clampToolcraftTimelineTime(parsed, durationSeconds),
      type: 'timeline.setCurrentTime',
    });
  };
  const commitDurationValue = (nextValue: string): void => {
    const nextDuration = clampToolcraftTimelineDurationSeconds(Number.parseFloat(nextValue));

    dispatch({ durationSeconds: nextDuration, type: 'timeline.setDuration' });
  };
  const deleteControlKeyframes = (controlId: string): void => {
    dispatch({ controlId, type: 'timeline.deleteControlKeyframes' });
  };
  const changeKeyframeEasing = (
    keyframeId: string,
    nextEasing: ToolcraftTimelineKeyframeEasing,
  ): void => {
    dispatch({ easing: nextEasing, keyframeId, type: 'timeline.changeKeyframeEasing' });
  };
  const resolvedPanelPlacement = panelPlacement ?? (framed ? 'frame' : 'surface');
  const shouldConstrainToContainer = resolvedPanelPlacement === 'surface';
  // Measured whether or not the tracks are showing, because the bar is the
  // full width of the canvas in both states — closing it lowers the panel, it
  // does not shrink it back to a floating stub.
  const { panelRef: timelineSurfaceRef, responsiveLayout } = useTimelinePanelResponsiveLayout(
    !shouldConstrainToContainer,
  );
  const unconstrainedTimelinePanelWidth = isCompact
    ? timelinePanelCompactWidthPx
    : isExpanded
    ? expandedPanelSize.width
    : timelinePanelCollapsedWidthPx;
  /**
   * As wide as the canvas above it, and never sideways.
   *
   * The measurement excludes whatever side panels are open, which is exactly
   * where the band should stop: run it the full width of the window instead
   * and it passes beneath the properties panel and cuts off the export buttons
   * at its foot. The sideways offset was for a panel that floated centred over
   * the canvas; in a band it only pushed it off the left edge.
   */
  const timelinePanelWidth =
    !isCompact && responsiveLayout !== null
      ? responsiveLayout.width
      : unconstrainedTimelinePanelWidth;
  const timelinePanelOffsetX = 0;
  const timelinePanelLayoutStyle: CSSProperties = {
    transform: timelinePanelOffsetX !== 0 ? `translateX(${timelinePanelOffsetX}px)` : undefined,
  };
  const timelinePanelAnimation = {
    height: isExpanded ? expandedPanelSize.height : timelinePanelCollapsedSize.height,
    ...(shouldConstrainToContainer
      ? { maxWidth: timelinePanelWidth }
      : { width: timelinePanelWidth }),
  };

  const timelineSurface = (
    <motion.div
      animate={timelinePanelAnimation}
      className={cn(
        'pointer-events-auto origin-top',
        shouldConstrainToContainer ? 'w-full' : 'max-w-full',
        !framed && className,
      )}
      data-expanded-height={isExpanded ? expandedPanelSize.height : undefined}
      data-responsive-width={
        typeof timelinePanelWidth === "number" &&
        timelinePanelWidth < unconstrainedTimelinePanelWidth
          ? timelinePanelWidth
          : undefined
      }
      data-hover-paused={isHoverPaused ? 'true' : 'false'}
      data-playback-ready={playbackReady ? 'true' : 'false'}
      data-scrubbing={scrubber.isScrubbing ? 'true' : 'false'}
      data-slot="timeline-panel"
      data-timeline-panel-variant={variant}
      data-toolcraft-timeline-panel-variant={variant}
      initial={false}
      ref={timelineSurfaceRef}
      style={timelinePanelLayoutStyle}
      transition={timelinePanelTransition}
    >
      <PanelSurface
        className={cn(
          'group/timeline-panel-surface relative flex h-full w-full flex-col rounded-t-lg rounded-b-lg',
          isExpanded ? 'overflow-hidden' : 'overflow-visible p-1',
          !isCompact && !isExpanded && !keyframesEnabled && 'pr-3',
        )}
        data-panel-id="timeline"
        onPointerEnter={() => setIsHoverPaused(true)}
        onPointerLeave={(event) => {
          const nextTarget = event.relatedTarget;

          if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
            return;
          }

          setIsHoverPaused(false);
        }}
      >
        {!isCompact && !isExpanded ? (
          <TimelinePanelMask
            currentTimeSeconds={currentTimeSeconds}
            durationSeconds={durationSeconds}
            isHandleVisible={isHoverPaused || scrubber.isScrubbing}
          />
        ) : null}
        <TimelinePanelHeader
          canExpand={keyframesEnabled}
          currentTimeSeconds={currentTimeSeconds}
          durationSeconds={durationSeconds}
          isExpanded={isExpanded}
          isLooping={isLooping}
          isPlaying={displayedIsPlaying}
          isScrubbing={scrubber.isScrubbing}
          keyframeTimesSeconds={keyframeTimesSeconds}
          playbackRate={timeline.playbackRate}
          playbackReady={playbackReady}
          animations={timelineAnimations}
          onAddAnimation={addAnimation}
          onCurrentTimeCommit={commitCurrentTimeValue}
          onDurationCommit={commitDurationValue}
          onScrubKeyDown={scrubber.handleScrubKeyDown}
          onScrubLostPointerCapture={scrubber.handleScrubLostPointerCapture}
          onScrubPointerDown={scrubber.handleScrubPointerDown}
          onScrubPointerMove={scrubber.handleScrubPointerMove}
          onScrubPointerUp={scrubber.handleScrubPointerUp}
          onSetPlaybackRate={(nextRate) =>
            dispatch({ playbackRate: nextRate, type: 'timeline.setPlaybackRate' })
          }
          onStepToKeyframe={stepToKeyframe}
          onToggleExpanded={() => {
            setDefaultExpandedPending(false);
            dispatch({ expanded: !isExpanded, type: 'timeline.setExpanded' });
          }}
          onToggleLoop={() => dispatch({ type: 'timeline.toggleLoop' })}
          onTogglePlayback={togglePlayback}
          onZoomChange={changeZoom}
          stripRef={scrubber.stripRef}
          variant={variant}
          view={view}
        />
        {isExpanded && keyframesEnabled ? (
          <TimelineExpandedContent
            currentTimeSeconds={currentTimeSeconds}
            durationSeconds={durationSeconds}
            isScrubbing={scrubber.isScrubbing}
            keyframeGroups={keyframeGroups}
            onChangeKeyframeEasing={changeKeyframeEasing}
            onDeleteControlKeyframes={deleteControlKeyframes}
            onDeleteKeyframe={deleteKeyframe}
            onKeyframeDragStart={() => setIsPlaying(false)}
            onKeyDown={scrubber.handleScrubKeyDown}
            onLostPointerCapture={scrubber.handleScrubLostPointerCapture}
            onMoveKeyframe={moveKeyframe}
            onPointerDown={scrubber.handleScrubPointerDown}
            onPointerMove={scrubber.handleScrubPointerMove}
            onPointerUp={scrubber.handleScrubPointerUp}
            collapsedObjectIds={collapsedObjectIds}
            objectTracks={objectTracks}
            onPanView={panView}
            onScrubToTime={scrubToTime}
            onSelectedKeyframeChange={setSelectedKeyframeId}
            onToggleObjectExpanded={toggleObjectExpanded}
            onZoomChange={changeZoom}
            selectedKeyframeId={selectedKeyframeId}
            stripRef={scrubber.stripRef}
            view={view}
          />
        ) : null}
      </PanelSurface>
    </motion.div>
  );

  const panel = (
    <PanelContainer
      onPanelStateChange={panelBinding.onPanelStateChange}
      panelState={resolvedPanelState}
      panelType="timeline"
      placement={resolvedPanelPlacement}
    >
      {timelineSurface}
    </PanelContainer>
  );

  return resolvedPanelState.hidden ? (
    <div data-toolcraft-timeline-panel-hidden="true" hidden>
      {panel}
    </div>
  ) : (
    panel
  );
}

export { TimelinePanel as KeyframesPanel };
