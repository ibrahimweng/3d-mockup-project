'use client';

import * as React from 'react';
import { useEffect, useRef, useState } from 'react';

import { getToolcraftTimelineLoopTime } from '../../state/timeline-loop';
import {
  clampToolcraftTimelineTime,
  toolcraftTimelineScrubStepSeconds,
} from '../../state/timeline-values';
import {
  getToolcraftTimelineViewTime,
  type ToolcraftTimelineViewWindow,
} from '../../state/timeline-view-window';

type TimelineClockOptions = {
  durationSeconds: number;
  getCurrentTimeSeconds: () => number;
  /**
   * Whether anything is actually keyframed.
   *
   * A loop with nothing keyed has nothing to show, but the clock ran anyway:
   * the playhead advanced every frame, every tick re-rendered, and the canvas
   * was redrawn continuously for a picture that never changed. Measured as ten
   * distinct frames out of ten samples while playing against one out of ten
   * while paused — which is what made every proof that waits for the picture
   * to hold still unreliable.
   *
   * The transport still opens ready to run, because that is what it means for
   * a timeline to be live; it simply has nothing to do until something is
   * keyed.
   */
  hasKeyframes: boolean;
  isHoverPaused: boolean;
  isLooping: boolean;
  isPlaying: boolean;
  /** How fast the clock runs, as a multiple of real time. */
  playbackRate: number;
  isScrubbing: boolean;
  setCurrentTimeSeconds: React.Dispatch<React.SetStateAction<number>>;
  setIsPlaying: React.Dispatch<React.SetStateAction<boolean>>;
};

type TimelineScrubberOptions = {
  commitCurrentTimeSeconds: () => void;
  currentTimeSeconds: number;
  disabled?: boolean;
  durationSeconds: number;
  setCurrentTimeSeconds: React.Dispatch<React.SetStateAction<number>>;
  setIsPlaying: React.Dispatch<React.SetStateAction<boolean>>;
  view: ToolcraftTimelineViewWindow;
};

type TimelineScrubberResult = {
  handleScrubKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  handleScrubLostPointerCapture: () => void;
  handleScrubPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  handleScrubPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void;
  handleScrubPointerUp: (event: React.PointerEvent<HTMLDivElement>) => void;
  isScrubbing: boolean;
  stripRef: React.RefObject<HTMLDivElement | null>;
};

function getKeyboardScrubTime({
  currentTimeSeconds,
  durationSeconds,
  key,
}: {
  currentTimeSeconds: number;
  durationSeconds: number;
  key: string;
}): number | null {
  if (key === 'ArrowLeft') {
    return currentTimeSeconds - toolcraftTimelineScrubStepSeconds;
  }

  if (key === 'ArrowRight') {
    return currentTimeSeconds + toolcraftTimelineScrubStepSeconds;
  }

  if (key === 'Home') {
    return 0;
  }

  if (key === 'End') {
    return durationSeconds;
  }

  return null;
}

export function useTimelineClock({
  durationSeconds,
  getCurrentTimeSeconds,
  hasKeyframes,
  isHoverPaused,
  isLooping,
  isPlaying,
  playbackRate,
  isScrubbing,
  setCurrentTimeSeconds,
  setIsPlaying,
}: TimelineClockOptions): void {
  useEffect(() => {
    if (
      !isPlaying ||
      !hasKeyframes ||
      isHoverPaused ||
      isScrubbing ||
      typeof window === 'undefined' ||
      typeof window.requestAnimationFrame !== 'function'
    ) {
      return;
    }

    let frame = 0;
    let previousTimestamp = window.performance.now();
    const tick = (timestamp: number) => {
      const elapsedSeconds = (timestamp - previousTimestamp) / 1000;

      previousTimestamp = timestamp;
      // Review speed scales the clock and nothing else: the keyframes, their
      // times and the length of the loop are untouched, so half speed is the
      // same animation watched for twice as long.
      const nextValue = getCurrentTimeSeconds() + elapsedSeconds * playbackRate;

      if (nextValue < durationSeconds) {
        setCurrentTimeSeconds(nextValue);
        frame = window.requestAnimationFrame(tick);
        return;
      }

      if (isLooping) {
        setCurrentTimeSeconds(
          getToolcraftTimelineLoopTime({
            currentTimeSeconds: nextValue,
            durationSeconds,
          }),
        );
        frame = window.requestAnimationFrame(tick);
        return;
      }

      setCurrentTimeSeconds(durationSeconds);
      setIsPlaying(false);
    };

    frame = window.requestAnimationFrame(tick);

    return () => window.cancelAnimationFrame(frame);
  }, [
    durationSeconds,
    getCurrentTimeSeconds,
    isHoverPaused,
    isLooping,
    hasKeyframes,
    playbackRate,
    isPlaying,
    isScrubbing,
    setCurrentTimeSeconds,
    setIsPlaying,
  ]);
}

export function useTimelineScrubber({
  commitCurrentTimeSeconds,
  currentTimeSeconds,
  disabled = false,
  durationSeconds,
  setCurrentTimeSeconds,
  setIsPlaying,
  view,
}: TimelineScrubberOptions): TimelineScrubberResult {
  const [isScrubbing, setIsScrubbing] = useState(false);
  const isScrubbingRef = useRef(false);
  const isMountedRef = useRef(true);
  const commitCurrentTimeSecondsRef = useRef(commitCurrentTimeSeconds);
  const stripRef = useRef<HTMLDivElement | null>(null);
  commitCurrentTimeSecondsRef.current = commitCurrentTimeSeconds;

  const finishScrub = React.useCallback((): void => {
    if (!isScrubbingRef.current) {
      return;
    }

    isScrubbingRef.current = false;
    if (isMountedRef.current) {
      setIsScrubbing(false);
    }
    commitCurrentTimeSecondsRef.current();
  }, []);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      finishScrub();
    };
  }, [finishScrub]);

  useEffect(() => {
    if (disabled) {
      finishScrub();
    }
  }, [disabled, finishScrub]);

  const getScrubGeometry = (): { rect: DOMRect; trackStart: number; trackWidth: number } | null => {
    const rect = stripRef.current?.getBoundingClientRect();

    if (!(rect && rect.width > 0)) {
      return null;
    }

    const rawTrackStart = Number.parseFloat(stripRef.current?.dataset.timelineTrackStart ?? '0');
    const trackStart = Number.isFinite(rawTrackStart) ? rawTrackStart : 0;
    const rawTrackEndInset = Number.parseFloat(stripRef.current?.dataset.timelineTrackEnd ?? '0');
    const trackEndInset = Number.isFinite(rawTrackEndInset) ? rawTrackEndInset : 0;
    const trackWidth = Math.max(1, rect.width - trackStart - trackEndInset);

    return { rect, trackStart, trackWidth };
  };
  /**
   * Where a press is allowed to take hold of the playhead.
   *
   * This used to be the playhead itself and nothing else, on an expanded
   * timeline: the keyframe rows sit over the track at the same coordinates, so
   * letting any press scrub meant a press meant for a diamond moved the
   * playhead instead. The cost was that moving the playhead needed the person
   * to find and grab a two-pixel line, when every tool they have used lets them
   * click the ruler and drag.
   *
   * So the rule is by target rather than by region. A press on the playhead
   * still scrubs, a press anywhere on the ruler scrubs, and a press on empty
   * track scrubs — a diamond still keeps its own presses, and the expanded
   * content turns away anything else interactive before this is asked.
   */
  const canStartScrubbingFromPointerEvent = (
    event: React.PointerEvent<HTMLDivElement>,
  ): boolean => {
    const geometry = getScrubGeometry();

    if (!geometry) {
      return false;
    }

    const isExpandedTimeline = geometry.trackStart > 0;
    const target = event.target instanceof Element ? event.target : null;
    const startedFromScrubSurface = target?.closest(
      [
        '[data-slot="timeline-expanded-playhead"]',
        '[data-slot="timeline-expanded-playhead-handle"]',
        '[data-slot="timeline-expanded-playhead-hit-area"]',
        '[data-timeline-scrub-surface="true"]',
      ].join(','),
    );

    if (startedFromScrubSurface) {
      return true;
    }

    if (isExpandedTimeline && target?.closest('[data-slot="timeline-keyframe"]')) {
      return false;
    }

    // Everything left of the track is the properties column, and the expanded
    // content has already turned away anything interactive before this runs, so
    // what is left here really is empty track.
    return event.clientX >= geometry.rect.left + geometry.trackStart;
  };
  const setCurrentTimeFromClientX = (clientX: number): void => {
    const geometry = getScrubGeometry();

    if (!geometry) {
      return;
    }

    const { rect, trackStart, trackWidth } = geometry;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left - trackStart) / trackWidth));

    setCurrentTimeSeconds(
      clampToolcraftTimelineTime(getToolcraftTimelineViewTime(ratio, view), durationSeconds),
    );
  };
  const handleScrubKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (disabled) {
      return;
    }

    const nextTime = getKeyboardScrubTime({
      currentTimeSeconds,
      durationSeconds,
      key: event.key,
    });

    if (nextTime === null) {
      return;
    }

    event.preventDefault();
    setCurrentTimeSeconds(clampToolcraftTimelineTime(nextTime, durationSeconds));
    commitCurrentTimeSeconds();
  };
  const handleScrubPointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (disabled || !canStartScrubbingFromPointerEvent(event)) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    isScrubbingRef.current = true;
    setIsPlaying(false);
    setIsScrubbing(true);
    setCurrentTimeFromClientX(event.clientX);
  };
  const handleScrubPointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (!isScrubbingRef.current) {
      return;
    }

    setCurrentTimeFromClientX(event.clientX);
  };
  const handleScrubPointerUp = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (!isScrubbingRef.current) {
      return;
    }

    finishScrub();

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return {
    handleScrubKeyDown,
    handleScrubLostPointerCapture: finishScrub,
    handleScrubPointerDown,
    handleScrubPointerMove,
    handleScrubPointerUp,
    isScrubbing,
    stripRef,
  };
}
