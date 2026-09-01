import * as React from "react";

/**
 * Match the preview's resolution to whatever the machine can actually keep up
 * with.
 *
 * A fixed resolution has to be chosen for hardware nobody knows in advance.
 * Pick it for a discrete GPU and integrated graphics stutters; pick it for
 * integrated graphics and everyone else gets a soft picture for no reason. So
 * it is not chosen at all: frames are timed while the device is being dragged,
 * and the scale moves toward whatever holds a smooth rate.
 *
 * What is timed is the gap between one drawn frame and the next, because that
 * gap is the frame rate as the eye sees it. Only drags are timed: a still
 * scene draws nothing, and the wait for the next control change would read as
 * a very slow frame. A gap long enough to be a stall, a paused hand or a
 * backgrounded tab is discarded rather than blamed on the machine.
 *
 * The decision is a pure function of the gaps seen so far, kept separate from
 * the React plumbing, because a browser slow enough to need this is too slow
 * to demonstrate it converging — the policy is verified against synthetic
 * frame timings instead.
 */

/** A gap longer than this is the hand pausing, not the machine struggling. */
export const SETTLED_MS = 220;
/**
 * The same ceiling for playback, where there is no hand to pause.
 *
 * A drag has to discard long gaps because the commonest reason for one is that
 * the person stopped moving, and blaming the machine for that would drop the
 * resolution of a scene nobody was struggling to draw. Playback has no such
 * reason: frames are asked for on a clock, so a gap is the machine's answer and
 * nothing else. Keeping the drag's 220ms ceiling here was self-defeating --
 * the worse playback ran the more certainly every sample was thrown away, so
 * the machines that needed the help most were the ones that never got it. What
 * is left above this is a backgrounded tab or a device waking up, which is
 * still not a measurement.
 */
export const STALLED_MS = 5_000;
/** Above this a frame is late enough to be worth losing resolution over. */
export const SLOW_MS = 24;
/** Below this there is headroom to spend on sharpness again. */
export const FAST_MS = 12;
/** Consecutive verdicts before the scale moves, so one hitch cannot drive it. */
export const RUN = 8;
/**
 * The same, for playback, where fewer frames are needed to be sure.
 *
 * A drag's gaps are noisy for reasons that have nothing to do with the machine
 * -- a hand accelerates, stops, changes direction -- so eight in a row is what
 * it takes to be confident. A clock does none of that, so three consecutive
 * late frames during playback already mean what eight mean during a drag. It
 * matters because the wait is measured in frames: at eight, a preview running
 * at three frames a second would take most of a minute to react to being too
 * slow, which is long enough that nobody would call it adaptive.
 */
export const PACED_RUN = 3;
/** How far the scale can fall. Below this the picture is mush. */
export const MIN_SCALE = 0.4;
export const MAX_SCALE = 1;
const STEP_DOWN = 0.75;
const STEP_UP = 1.15;

export type QualityState = {
  /** Consecutive frames judged fast enough to have headroom to spend. */
  fast: number;
  /** Multiplier on the pixel ratio, `MIN_SCALE` to `MAX_SCALE`. */
  scale: number;
  /** Consecutive frames judged too slow. */
  slow: number;
};

export const INITIAL_QUALITY: QualityState = {
  fast: 0,
  scale: MAX_SCALE,
  slow: 0,
};

/** How gaps are judged, which is not the same for a drag and for playback. */
export type SamplingProfile = {
  /** Above this the gap is not a measurement of anything. */
  ceilingMs: number;
  /** Consecutive verdicts before the scale moves. */
  run: number;
};

export const DRAG_SAMPLING: SamplingProfile = { ceilingMs: SETTLED_MS, run: RUN };
export const PLAYBACK_SAMPLING: SamplingProfile = { ceilingMs: STALLED_MS, run: PACED_RUN };

/**
 * Fold one frame gap into the quality state.
 *
 * Returns the state unchanged when the gap says nothing, which is what keeps a
 * paused hand from being read as a struggling GPU.
 */
export function foldFrameGap(
  state: QualityState,
  elapsedMs: number,
  profile: SamplingProfile = DRAG_SAMPLING,
): QualityState {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return state;
  if (elapsedMs > profile.ceilingMs) return state;

  if (elapsedMs > SLOW_MS) {
    const slow = state.slow + 1;
    if (slow >= profile.run && state.scale > MIN_SCALE) {
      return {
        fast: 0,
        scale: Math.max(MIN_SCALE, state.scale * STEP_DOWN),
        slow: 0,
      };
    }
    return { fast: 0, scale: state.scale, slow };
  }

  if (elapsedMs < FAST_MS) {
    const fast = state.fast + 1;
    if (fast >= profile.run && state.scale < MAX_SCALE) {
      return {
        fast: 0,
        scale: Math.min(MAX_SCALE, state.scale * STEP_UP),
        slow: 0,
      };
    }
    return { fast, scale: state.scale, slow: 0 };
  }

  // Inside the band the scale is where it should be, so neither run grows.
  return { fast: 0, scale: state.scale, slow: 0 };
}

export type AdaptiveQuality = {
  /** Call when a drag or a run of playback ends, so the next starts fresh. */
  reset: () => void;
  /** Call once per drawn frame, with its timestamp and how to judge the gap. */
  sample: (now: number, profile?: SamplingProfile) => void;
  /** Multiplier on the pixel ratio, `MIN_SCALE` to `MAX_SCALE`. */
  scale: number;
};

export function useAdaptiveQuality(): AdaptiveQuality {
  const [scale, setScale] = React.useState(MAX_SCALE);
  // Runs are counted outside React state: they change on every frame and only
  // the scale is worth re-rendering for.
  const stateRef = React.useRef(INITIAL_QUALITY);
  const previousRef = React.useRef(0);

  const reset = React.useCallback(() => {
    previousRef.current = 0;
    stateRef.current = { ...stateRef.current, fast: 0, slow: 0 };
  }, []);

  const sample = React.useCallback((
    now: number,
    profile: SamplingProfile = DRAG_SAMPLING,
  ) => {
    const previous = previousRef.current;
    previousRef.current = now;
    // The first frame of a drag has nothing to be measured against.
    if (previous === 0) return;

    const next = foldFrameGap(stateRef.current, now - previous, profile);
    const changed = next.scale !== stateRef.current.scale;
    stateRef.current = next;
    if (changed) setScale(next.scale);
  }, []);

  // Memoised because the frame loop depends on this object, and a new identity
  // every render would tear the loop down and rebuild it on every pointer move.
  return React.useMemo(
    () => ({ reset, sample, scale }),
    [reset, sample, scale],
  );
}
