import * as React from "react";

import { claimsViewOrbit } from "./pointer-ownership";
import {
  describeToolcraftOrientationPose,
  readToolcraftOrientationPose,
  useToolcraft,
  useToolcraftDispatch,
  useToolcraftEvaluatedValue,
  type ToolcraftOrientationPose,
} from "@/toolcraft/runtime/react";
import type { ToolcraftCommand } from "@/toolcraft/runtime";

/**
 * Turntable orbit, from anywhere on the canvas.
 *
 * The runtime's own model orbit claims a plain primary drag that lands on the
 * device, which is right for grabbing the object but leaves nothing to grab
 * when the screen owns that drag and the body is a thin rail. Dragging the
 * space beside the phone is the natural way to swing it round, and requiring
 * the pointer to find the object first is the thing that makes a 3D viewer
 * feel fiddly.
 *
 * So a plain primary drag rotates wherever it starts. The one exception is the
 * display, which the design drag claims ahead of this so a screenshot can be
 * pushed around its own screen; the priority chain in `preview.tsx` is what
 * enforces that order. Moving the view rather than the object is the middle
 * button's job, and two fingers on a trackpad already pan through the
 * runtime's own wheel handling.
 *
 * Horizontal movement turns around world up, vertical movement turns around
 * the screen-horizontal axis, at 0.4 degrees per CSS pixel.
 *
 * Once the camera is keyed the drag writes keyframes instead of the value, so
 * turning the product is how a camera move is animated: key the pose at the
 * start, move the playhead, drag, and the timeline has the move. See
 * `orbitCommand` for why it is one or the other and never both.
 */

const TARGET = "camera.orbit";
const TRACK_LABEL = "Camera";
const HISTORY_LABEL = "Rotate view";
const DEGREES_PER_PIXEL = 0.4;
/** Stop just short of the pole, where up and the view direction collapse. */
const POLE_LIMIT = Math.PI / 2 - 0.01;

type Gesture = {
  frame: number;
  group: string;
  pendingX: number;
  pendingY: number;
  pointerId: number;
};

export type ViewOrbitHandlers = {
  onPointerCancel: (event: React.PointerEvent<HTMLCanvasElement>) => boolean;
  onPointerDown: (event: React.PointerEvent<HTMLCanvasElement>) => boolean;
  onPointerMove: (event: React.PointerEvent<HTMLCanvasElement>) => boolean;
  onPointerUp: (event: React.PointerEvent<HTMLCanvasElement>) => boolean;
};

const claimsOrbit = claimsViewOrbit;

/**
 * Turn a pose by an angle.
 *
 * The pose is a direction from the subject plus an up vector, so the turn is
 * done in spherical terms: yaw around world up, pitch clamped short of the
 * pole so the view never flips over the top.
 *
 * Angles rather than pixels, because a drag is not the only thing that turns a
 * camera. A motion preset arcs it by a stated number of degrees, and it has to
 * arrive at the same place a drag of that size would rather than carrying a
 * second copy of this arithmetic that is free to drift from this one.
 */
export function turnByDegrees(
  pose: ToolcraftOrientationPose,
  yawDegrees: number,
  pitchDegrees: number,
): ToolcraftOrientationPose {
  const [x, y, z] = pose.position;
  const radius = Math.hypot(x, y, z) || 1;
  const yaw = Math.atan2(x, z) - (yawDegrees * Math.PI) / 180;
  const pitch = Math.max(
    -POLE_LIMIT,
    Math.min(POLE_LIMIT, Math.asin(Math.max(-1, Math.min(1, y / radius))) + (pitchDegrees * Math.PI) / 180),
  );

  const horizontal = Math.cos(pitch) * radius;
  return {
    position: [
      horizontal * Math.sin(yaw),
      Math.sin(pitch) * radius,
      horizontal * Math.cos(yaw),
    ],
    up: pose.up,
  };
}

/** The same turn, in the pixels a drag moved. */
export function turn(
  pose: ToolcraftOrientationPose,
  deltaX: number,
  deltaY: number,
): ToolcraftOrientationPose {
  return turnByDegrees(pose, deltaX * DEGREES_PER_PIXEL, deltaY * DEGREES_PER_PIXEL);
}

export type OrbitTarget = {
  /** Whether the timeline owns the camera, and so where a turn has to go. */
  keyed: boolean;
  pose: ToolcraftOrientationPose;
};

/**
 * The pose a turn starts from, and whether the timeline owns it.
 *
 * Evaluated rather than raw. Once the camera is keyed, `state.values` still
 * holds whatever it was last set to before the first keyframe went down, and
 * nothing reads it any more — the frame on screen comes from the track. A drag
 * that started from the raw value would jump the camera to a pose nobody is
 * looking at on its first frame and then write that, which is the same fault
 * the panel's number fields had before they read the evaluated value too.
 *
 * Returned as a ref so a drag applies to the pose the last frame committed
 * rather than to whatever React last rendered.
 */
function useOrbitTarget(): React.MutableRefObject<OrbitTarget> {
  const { state } = useToolcraft();
  const evaluated = useToolcraftEvaluatedValue(TARGET);
  const targetRef = React.useRef<OrbitTarget>({
    keyed: false,
    pose: readToolcraftOrientationPose(evaluated),
  });

  targetRef.current = {
    keyed: state.timeline.keyframeGroups.some((group) => group.controlId === TARGET),
    pose: readToolcraftOrientationPose(evaluated),
  };

  return targetRef;
}

/**
 * Where a turn goes: into the value, or into a keyframe at the playhead.
 *
 * One or the other, never both. While the camera is keyed the raw value is not
 * what anything reads, so writing it as well would only put a stale pose in the
 * saved file. And two commands sharing one history group would merge into each
 * other rather than into themselves — the merge only looks at the entry it
 * landed behind — which would leave undo holding a value patch with a timeline
 * patch's contents.
 *
 * `timeSeconds` is left off so the reducer keys the playhead, which is the
 * frame the person dragging is looking at.
 */
export function orbitCommand(
  keyed: boolean,
  pose: ToolcraftOrientationPose,
  historyGroup?: string,
): ToolcraftCommand {
  const history = historyGroup ? ("merge" as const) : undefined;

  return keyed
    ? {
        controlId: TARGET,
        controlLabel: TRACK_LABEL,
        history,
        historyGroup,
        type: "timeline.upsertControlKeyframe",
        value: pose,
        valueLabel: describeToolcraftOrientationPose(pose),
      }
    : {
        history,
        historyGroup,
        label: HISTORY_LABEL,
        target: TARGET,
        type: "controls.setValue",
        value: pose,
      };
}

export function useViewOrbit(): ViewOrbitHandlers {
  const dispatch = useToolcraftDispatch();
  const gestureRef = React.useRef<Gesture | null>(null);
  const groupRef = React.useRef(0);
  const targetRef = useOrbitTarget();

  const onPointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>): boolean => {
      if (!claimsOrbit(event)) return false;
      groupRef.current += 1;
      gestureRef.current = {
        frame: 0,
        group: `view-orbit-${groupRef.current}`,
        pendingX: 0,
        pendingY: 0,
        pointerId: event.pointerId,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
      event.stopPropagation();
      return true;
    },
    [],
  );

  /**
   * Apply whatever movement has piled up since the last frame.
   *
   * A pointer reports far more often than the screen refreshes — a 120Hz mouse
   * or a trackpad delivering coalesced events can produce several moves per
   * frame — and every write here re-renders the whole app and re-runs every
   * effect behind it. Only the last one before the frame is drawn can be seen,
   * so the rest is work whose result is thrown away. The runtime's own orbit
   * batches for the same reason.
   */
  const flush = React.useCallback(() => {
    const gesture = gestureRef.current;
    if (!gesture) return;
    gesture.frame = 0;
    const { pendingX, pendingY } = gesture;
    if (pendingX === 0 && pendingY === 0) return;
    gesture.pendingX = 0;
    gesture.pendingY = 0;

    const { keyed, pose } = targetRef.current;

    dispatch(orbitCommand(keyed, turn(pose, pendingX, pendingY), gesture.group));
  }, [dispatch, targetRef]);

  const onPointerMove = React.useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>): boolean => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) return false;
      event.preventDefault();
      event.stopPropagation();
      if (event.movementX === 0 && event.movementY === 0) return true;

      gesture.pendingX += event.movementX;
      gesture.pendingY += event.movementY;
      if (gesture.frame === 0) gesture.frame = requestAnimationFrame(flush);
      return true;
    },
    [flush],
  );

  const finish = React.useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>): boolean => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) return false;
      // Anything still pending belongs to this gesture, so it lands before the
      // gesture is forgotten rather than being dropped at the last moment.
      if (gesture.frame !== 0) cancelAnimationFrame(gesture.frame);
      flush();
      gestureRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      event.preventDefault();
      event.stopPropagation();
      return true;
    },
    [flush],
  );

  return {
    onPointerCancel: finish,
    onPointerDown,
    onPointerMove,
    onPointerUp: finish,
  };
}

/** One arrow press, in the pixels a drag would have had to cover. */
const PIXELS_PER_PRESS = 15;
const PIXELS_PER_PRESS_WITH_SHIFT = 45;

const ARROW_TURNS: Readonly<Record<string, { x: number; y: number }>> = {
  ArrowDown: { x: 0, y: -1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: 1 },
};

/**
 * Turn the product from the keyboard, once the canvas has focus.
 *
 * Dragging was the only way to do this, which made the main thing the studio is
 * for unreachable without a mouse. The tour's third step is "drag the product
 * to turn it", and a keyboard user could not complete it. They can now, because
 * this writes the same value the drag writes, through the same shared `turn`.
 *
 * On the canvas rather than on the window, so the arrows keep their existing
 * meaning everywhere else. The panel's own arrows move the product across the
 * frame, and one pair of keys cannot do both jobs at once. Focus is what says
 * which job is being asked for, which is also why the canvas is now something a
 * person can focus in the first place.
 *
 * Every press is its own history entry rather than one merged group, because a
 * press is a discrete decision and undo should take back one of them. A drag is
 * merged because a drag is one continuous movement.
 */
export function useCanvasKeyboardOrbit(): (
  event: React.KeyboardEvent<HTMLCanvasElement>,
) => boolean {
  const dispatch = useToolcraftDispatch();
  const targetRef = useOrbitTarget();

  return React.useCallback(
    (event: React.KeyboardEvent<HTMLCanvasElement>): boolean => {
      // Every modifier but Shift belongs to some other shortcut, here or in the
      // browser, and Alt with an arrow is the browser's own Back and Forward.
      if (event.altKey || event.ctrlKey || event.metaKey) return false;
      const direction = ARROW_TURNS[event.key];
      if (!direction) return false;

      const step = event.shiftKey ? PIXELS_PER_PRESS_WITH_SHIFT : PIXELS_PER_PRESS;
      // The page would scroll otherwise, which on a full-window canvas moves
      // the whole studio a little and looks like a fault.
      event.preventDefault();
      event.stopPropagation();

      const { keyed, pose } = targetRef.current;

      // No history group, so each press is its own entry — a press is a
      // discrete decision, and keyed or not, undo should take back one of them.
      dispatch(orbitCommand(keyed, turn(pose, direction.x * step, direction.y * step)));
      return true;
    },
    [dispatch, targetRef],
  );
}
