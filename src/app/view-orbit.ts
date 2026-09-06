import * as React from "react";

import { claimsViewOrbit } from "./pointer-ownership";
import {
  readToolcraftOrientationPose,
  useToolcraft,
  useToolcraftDispatch,
  type ToolcraftOrientationPose,
} from "@/toolcraft/runtime/react";

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
 */

const TARGET = "camera.orbit";
const HISTORY_LABEL = "Rotate view";
const DEGREES_PER_PIXEL = 0.4;
const RADIANS_PER_PIXEL = (DEGREES_PER_PIXEL * Math.PI) / 180;
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
 * Turn a pose by a pointer delta.
 *
 * The pose is a direction from the subject plus an up vector, so the turn is
 * done in spherical terms: yaw around world up, pitch clamped short of the
 * pole so the view never flips over the top.
 */
export function turn(
  pose: ToolcraftOrientationPose,
  deltaX: number,
  deltaY: number,
): ToolcraftOrientationPose {
  const [x, y, z] = pose.position;
  const radius = Math.hypot(x, y, z) || 1;
  const yaw = Math.atan2(x, z) - deltaX * RADIANS_PER_PIXEL;
  const pitch = Math.max(
    -POLE_LIMIT,
    Math.min(POLE_LIMIT, Math.asin(y / radius) + deltaY * RADIANS_PER_PIXEL),
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

export function useViewOrbit(): ViewOrbitHandlers {
  const dispatch = useToolcraftDispatch();
  const { state } = useToolcraft();
  const gestureRef = React.useRef<Gesture | null>(null);
  const groupRef = React.useRef(0);
  // Read through a ref so a drag applies to the pose the last frame committed
  // rather than to whatever React last rendered.
  const poseRef = React.useRef<ToolcraftOrientationPose>(
    readToolcraftOrientationPose(state.values[TARGET]),
  );
  poseRef.current = readToolcraftOrientationPose(state.values[TARGET]);

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

    dispatch({
      history: "merge",
      historyGroup: gesture.group,
      label: HISTORY_LABEL,
      target: TARGET,
      type: "controls.setValue",
      value: turn(poseRef.current, pendingX, pendingY),
    });
  }, [dispatch]);

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
  const { state } = useToolcraft();
  const poseRef = React.useRef<ToolcraftOrientationPose>(
    readToolcraftOrientationPose(state.values[TARGET]),
  );
  poseRef.current = readToolcraftOrientationPose(state.values[TARGET]);

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

      dispatch({
        label: HISTORY_LABEL,
        target: TARGET,
        type: "controls.setValue",
        value: turn(poseRef.current, direction.x * step, direction.y * step),
      });
      return true;
    },
    [dispatch],
  );
}
