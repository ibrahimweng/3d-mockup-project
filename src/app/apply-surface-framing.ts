import * as React from "react";
import {
  readToolcraftOrientationPose,
  useToolcraft,
  useToolcraftDispatch,
  type ToolcraftOrientationPose,
} from "@/toolcraft/runtime/react";

import { DEFAULT_SURFACE, readSurfaceId, type SurfaceId } from "./surfaces";

/**
 * Lift the camera enough to see the table it is now standing on.
 *
 * A table is only a table from above. Its edge — the lit top on one side, the
 * shaded face on the other — is what separates furniture from an endless
 * floor, and a camera at eye level sees a horizontal surface edge-on and
 * therefore sees none of it. Four of the six studios frame near eye level,
 * because they were built for a floor that recedes to a horizon and has no
 * edge to miss. Switch a table on under one of them and it reads as the same
 * infinite plane it replaced.
 *
 * So this is a nudge rather than a framing: it moves the camera only when the
 * camera is the thing in the way, and only far enough to fix it. Azimuth is
 * untouched, so whichever side you were shooting from is the side you keep.
 */

const SURFACE_TARGET = "surface.kind";
const CAMERA_TARGET = "camera.orbit";

/**
 * How far above the surface the camera has to be for its top to read.
 *
 * Measured rather than picked: at thirteen degrees the edge and the lit top
 * both land in frame, and at three they do not. Fifteen clears the first with
 * a little room and is still a long way from looking down at the device.
 */
const MINIMUM_ELEVATION = (15 * Math.PI) / 180;

function elevationOf(pose: ToolcraftOrientationPose): number {
  const [x, y, z] = pose.position;
  return Math.atan2(y, Math.hypot(x, z));
}

/** The same direction, raised to clear the surface, at the same distance. */
function raise(pose: ToolcraftOrientationPose): ToolcraftOrientationPose {
  const [x, , z] = pose.position;
  const horizontal = Math.hypot(x, z);
  return {
    position: [x, horizontal * Math.tan(MINIMUM_ELEVATION), z],
    up: pose.up,
  };
}

function samePose(
  a: ToolcraftOrientationPose,
  b: ToolcraftOrientationPose,
): boolean {
  return a.position.every((value, index) => value === b.position[index]);
}

export function useSurfaceFraming(): void {
  const dispatch = useToolcraftDispatch();
  const { state } = useToolcraft();
  const chosen = readSurfaceId(state.values[SURFACE_TARGET]);
  const pose = readToolcraftOrientationPose(state.values[CAMERA_TARGET]);

  const appliedRef = React.useRef<SurfaceId>(DEFAULT_SURFACE);
  /**
   * What the camera was before it was raised, and what it was raised to.
   *
   * Both, because putting the table away should hand the framing back — but
   * only if the framing is still the one this hook chose. A preset writes its
   * own camera, and a user can drag the gizmo; either way the pose has moved
   * on and restoring an older one would be overwriting a later decision with
   * an earlier one.
   */
  const nudgeRef = React.useRef<{
    before: ToolcraftOrientationPose;
    after: ToolcraftOrientationPose;
  } | null>(null);

  React.useEffect(() => {
    if (appliedRef.current === chosen) return;
    const previous = appliedRef.current;
    appliedRef.current = chosen;

    const write = (next: ToolcraftOrientationPose): void => {
      dispatch({
        // The choice already occupies its place in the history. This is what
        // the choice did, and recording it separately would put a step in the
        // way that undoes half of what the user asked for.
        history: "skip",
        target: CAMERA_TARGET,
        type: "controls.setValue",
        value: next,
      });
    };

    if (chosen !== "none") {
      if (elevationOf(pose) >= MINIMUM_ELEVATION) {
        nudgeRef.current = null;
        return;
      }
      const after = raise(pose);
      nudgeRef.current = { after, before: pose };
      write(after);
      return;
    }

    // Back to no surface. Give the framing back, unless it is no longer ours.
    const nudge = nudgeRef.current;
    nudgeRef.current = null;
    if (previous !== "none" && nudge && samePose(pose, nudge.after)) {
      write(nudge.before);
    }
  }, [chosen, dispatch, pose]);
}
