import * as React from "react";
import {
  readToolcraftOrientationPose,
  useToolcraft,
  useToolcraftDispatch,
  type ToolcraftOrientationPose,
} from "@/toolcraft/runtime/react";

/**
 * Blender-style turntable orbit, from anywhere on the canvas.
 *
 * The runtime's own model orbit claims a plain primary drag that lands on the
 * device, which is right for grabbing the object but leaves nothing to grab
 * when the screen owns that drag and the body is a thin rail. A 3D tool solves
 * this with a dedicated orbit button rather than a mode, so this adds the two
 * bindings people already have in their hands:
 *
 * - middle-drag anywhere, as in Blender;
 * - Alt with a primary drag, for trackpads and mice without a middle button.
 *
 * Neither collides with what already exists: the runtime declines modified and
 * non-primary presses, and the design drag only claims a plain primary press on
 * a display.
 *
 * The rotation matches the runtime's own: horizontal movement turns around
 * world up, vertical movement turns around the screen-horizontal axis, at 0.4
 * degrees per CSS pixel.
 */

const TARGET = "camera.orbit";
const HISTORY_LABEL = "Rotate view";
const DEGREES_PER_PIXEL = 0.4;
const RADIANS_PER_PIXEL = (DEGREES_PER_PIXEL * Math.PI) / 180;
/** Stop just short of the pole, where up and the view direction collapse. */
const POLE_LIMIT = Math.PI / 2 - 0.01;

type Gesture = { group: string; pointerId: number };

export type ViewOrbitHandlers = {
  onPointerCancel: (event: React.PointerEvent<HTMLCanvasElement>) => boolean;
  onPointerDown: (event: React.PointerEvent<HTMLCanvasElement>) => boolean;
  onPointerMove: (event: React.PointerEvent<HTMLCanvasElement>) => boolean;
  onPointerUp: (event: React.PointerEvent<HTMLCanvasElement>) => boolean;
};

function claimsOrbit(event: React.PointerEvent<HTMLCanvasElement>): boolean {
  const middleButton = event.button === 1;
  const altPrimary = event.button === 0 && event.altKey;
  return middleButton || altPrimary;
}

/**
 * Turn a pose by a pointer delta.
 *
 * The pose is a direction from the subject plus an up vector, so the turn is
 * done in spherical terms: yaw around world up, pitch clamped short of the
 * pole so the view never flips over the top.
 */
function turn(
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
        group: `view-orbit-${groupRef.current}`,
        pointerId: event.pointerId,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
      event.stopPropagation();
      return true;
    },
    [],
  );

  const onPointerMove = React.useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>): boolean => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) return false;
      if (event.movementX === 0 && event.movementY === 0) return true;

      dispatch({
        history: "merge",
        historyGroup: gesture.group,
        label: HISTORY_LABEL,
        target: TARGET,
        type: "controls.setValue",
        value: turn(poseRef.current, event.movementX, event.movementY),
      });
      event.preventDefault();
      event.stopPropagation();
      return true;
    },
    [dispatch],
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
