import * as React from "react";
import { useToolcraft, useToolcraftDispatch } from "@/toolcraft/runtime/react";

import type { RasterRenderer } from "./render/raster-renderer";

/**
 * Drag the design across the device's own screen.
 *
 * The pointer is claimed on pointer-down only when it lands on a display, so a
 * drag that starts on the body still rotates the device and a drag that starts
 * on empty canvas still pans the viewport. That split is the whole interaction:
 * the screen edits the design, everything else edits the view.
 *
 * Movement is measured in the screen's own UV space rather than in pixels, so
 * the design keeps up with the pointer at any camera angle — including a screen
 * seen almost edge-on, where a pixel of pointer travel covers far more of the
 * design than it does head-on.
 */

const TARGET = "artwork.offset";
const HISTORY_LABEL = "Move design";

type Gesture = {
  group: string;
  pointerId: number;
  startOffset: { x: number; y: number };
  startUV: { u: number; v: number };
};

export type DesignDragHandlers = {
  onPointerCancel: (event: React.PointerEvent<HTMLCanvasElement>) => boolean;
  onPointerDown: (event: React.PointerEvent<HTMLCanvasElement>) => boolean;
  onPointerMove: (event: React.PointerEvent<HTMLCanvasElement>) => boolean;
  onPointerUp: (event: React.PointerEvent<HTMLCanvasElement>) => boolean;
};

function isPlainPrimary(event: React.PointerEvent<HTMLCanvasElement>): boolean {
  return (
    event.button === 0 &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey
  );
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function useDesignDrag(
  rendererRef: React.RefObject<RasterRenderer | null>,
  hasDesign: boolean,
): DesignDragHandlers {
  const dispatch = useToolcraftDispatch();
  const { state } = useToolcraft();
  const gestureRef = React.useRef<Gesture | null>(null);
  const groupRef = React.useRef(0);
  // The gesture reads the committed offset once, at pointer-down, so the drag
  // stays anchored to where it started rather than compounding its own writes.
  const offsetRef = React.useRef({ x: 0.5, y: 0.5 });
  const rawOffset = state.values[TARGET];
  const parsed =
    typeof rawOffset === "object" && rawOffset !== null
      ? (rawOffset as { x?: number; y?: number })
      : {};
  offsetRef.current = {
    x: Number.isFinite(parsed.x) ? Number(parsed.x) : 0.5,
    y: Number.isFinite(parsed.y) ? Number(parsed.y) : 0.5,
  };

  const readOffset = React.useCallback(
    (): { x: number; y: number } => offsetRef.current,
    [],
  );

  const onPointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>): boolean => {
      if (!hasDesign || !isPlainPrimary(event)) return false;
      const uv = rendererRef.current?.hitScreenUV(event.clientX, event.clientY);
      if (!uv) return false;

      groupRef.current += 1;
      gestureRef.current = {
        group: `design-drag-${groupRef.current}`,
        pointerId: event.pointerId,
        startOffset: readOffset(),
        startUV: uv,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
      event.stopPropagation();
      return true;
    },
    [hasDesign, readOffset, rendererRef],
  );

  const onPointerMove = React.useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>): boolean => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) return false;

      const renderer = rendererRef.current;
      const uv = renderer?.hitScreenUV(event.clientX, event.clientY);
      // Leaving the panel mid-drag holds the last position rather than
      // snapping the design somewhere it was never dragged.
      if (!renderer || !uv) return true;

      const slack = renderer.screenSlack();
      const deltaU = uv.u - gesture.startUV.u;
      const deltaV = uv.v - gesture.startUV.v;

      // Offset shifts the sampling window, so it moves against the design on
      // both axes. An axis with no slack is not cropped and has nothing to pan.
      const next = {
        x:
          slack.x > 0
            ? clamp01(gesture.startOffset.x - deltaU / slack.x)
            : gesture.startOffset.x,
        y:
          slack.y > 0
            ? clamp01(gesture.startOffset.y - deltaV / slack.y)
            : gesture.startOffset.y,
      };

      dispatch({
        history: "merge",
        historyGroup: gesture.group,
        label: HISTORY_LABEL,
        target: TARGET,
        type: "controls.setValue",
        value: next,
      });
      event.preventDefault();
      event.stopPropagation();
      return true;
    },
    [dispatch, rendererRef],
  );

  const finish = React.useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>): boolean => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) return false;
      gestureRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      event.preventDefault();
      event.stopPropagation();
      return true;
    },
    [],
  );

  return {
    onPointerCancel: finish,
    onPointerDown,
    onPointerMove,
    onPointerUp: finish,
  };
}
