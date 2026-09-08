import * as React from "react";

import { useToolcraftDispatch, useToolcraftEvaluatedValues } from "@/toolcraft/runtime/react";

import { readFramePose, readRasterSettings } from "./render/settings";

/**
 * Remembers where the camera was standing when Auto frame was switched off.
 *
 * The switch itself is one boolean and cannot carry a pose, and the framing
 * has to survive a reload, an export and a settings import, so the pose the
 * camera froze on is written into the workspace as a value of its own. This
 * is the only thing that writes it.
 *
 * The pose is taken from the *evaluated* values rather than the stored ones,
 * which matters exactly when it is least obvious: freeze the camera halfway
 * through a keyframed resize and the pose on screen is the one the timeline
 * evaluated, not the number the slider is parked at. Freezing on the stored
 * one would jump the picture at the moment the switch is meant to hold it
 * still, which is the one thing this feature promises not to do.
 *
 * Nothing here needs to run first. Until the pose is written, `readFramingTransform`
 * falls back to the product's live pose — which, at the instant the switch is
 * thrown, is the same pose. So the frame between the switch flipping and this
 * landing is already the right one, and there is no glitch to guard against.
 *
 * Not a history entry, because the switch beside it already is one: undoing
 * the freeze should put the switch back, and a second entry holding a pose
 * nobody typed would make that take two presses.
 */
export function CameraFrameLock(): null {
  const dispatch = useToolcraftDispatch();
  const values = useToolcraftEvaluatedValues();
  /**
   * The latest values, read only when the switch actually moves.
   *
   * This component re-renders whenever any evaluated value changes, which
   * during playback is every frame. Reading the pose out here rather than in
   * the render keeps that to one assignment; the effect below runs only on a
   * transition, and that is the only moment the pose is wanted.
   */
  const latestValues = React.useRef(values);
  latestValues.current = values;

  const autoFrame = values["camera.autoFrame"] !== false;
  const frozen = readFramePose(values as Record<string, unknown>) !== null;

  React.useEffect(() => {
    if (autoFrame) {
      // Switched back on: drop the pose, so the camera answers the product
      // again and nothing stale is left in the workspace to be restored by a
      // later reload.
      if (frozen) {
        dispatch({
          history: "skip",
          target: "camera.framePose",
          type: "controls.setValue",
          value: null,
        });
      }
      return;
    }

    if (!frozen) {
      dispatch({
        history: "skip",
        target: "camera.framePose",
        type: "controls.setValue",
        value: readRasterSettings(
          latestValues.current as Record<string, unknown>,
        ).transform,
      });
    }
  }, [autoFrame, dispatch, frozen]);

  return null;
}
