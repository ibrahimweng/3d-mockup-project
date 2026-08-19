import * as React from "react";
import { useToolcraftDispatch } from "@/toolcraft/runtime/react";

/**
 * Move the board under the pointer with the middle button.
 *
 * Panning already exists on two fingers: a trackpad swipe arrives as a wheel
 * event and the runtime turns it straight into a canvas offset. What was
 * missing is the mouse equivalent, because the runtime's own drag-to-pan
 * listens for the primary button only — and the primary button now rotates the
 * device, so pressing it can no longer pan.
 *
 * That split is deliberate and matches how the rest of the app reads: a
 * primary press acts on the *object* under it, and the middle button moves the
 * *view*. Nothing about the scene changes here, so this dispatches the
 * runtime's own canvas command rather than keeping a second copy of the
 * viewport's position.
 */

export type ViewPanHandlers = {
  onPointerCancel: (event: React.PointerEvent<HTMLCanvasElement>) => boolean;
  onPointerDown: (event: React.PointerEvent<HTMLCanvasElement>) => boolean;
  onPointerMove: (event: React.PointerEvent<HTMLCanvasElement>) => boolean;
  onPointerUp: (event: React.PointerEvent<HTMLCanvasElement>) => boolean;
};

function claimsPan(event: React.PointerEvent<HTMLCanvasElement>): boolean {
  return event.button === 1;
}

type Gesture = {
  frame: number;
  pendingX: number;
  pendingY: number;
  pointerId: number;
};

export function useViewPan(): ViewPanHandlers {
  const dispatch = useToolcraftDispatch();
  const gestureRef = React.useRef<Gesture | null>(null);

  const onPointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>): boolean => {
      if (!claimsPan(event)) return false;
      gestureRef.current = {
        frame: 0,
        pendingX: 0,
        pendingY: 0,
        pointerId: event.pointerId,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      // Middle-press is the browser's autoscroll gesture, which would other-
      // wise start its own scrolling on top of this one.
      event.preventDefault();
      event.stopPropagation();
      return true;
    },
    [],
  );

  /**
   * Apply whatever movement has piled up since the last frame.
   *
   * A pointer reports far more often than the screen refreshes, and only the
   * last position before a frame is drawn can be seen, so writing every one of
   * them re-renders the app for results nobody sees.
   */
  const flush = React.useCallback(() => {
    const gesture = gestureRef.current;
    if (!gesture) return;
    gesture.frame = 0;
    const { pendingX, pendingY } = gesture;
    if (pendingX === 0 && pendingY === 0) return;
    gesture.pendingX = 0;
    gesture.pendingY = 0;
    // The offset is in screen pixels, so the pointer's own delta is the pan:
    // the board keeps up with the cursor at any zoom.
    dispatch({ delta: { x: pendingX, y: pendingY }, type: "canvas.panBy" });
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
