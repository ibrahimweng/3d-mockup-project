import * as React from "react";
import { useToolcraft, useToolcraftDispatch } from "@/toolcraft/runtime/react";

import {
  SCENE_PRESETS,
  readScenePresetId,
  type ScenePresetId,
} from "./scene-presets";

/**
 * Write a chosen studio into the controls it is made of.
 *
 * The preset is not a hidden mode: it sets the same environment, floor, lights
 * and camera anyone could set by hand, and then gets out of the way. That is
 * what makes it safe to move a slider afterwards — nothing is watching to put
 * it back.
 *
 * Every write shares one history group, so a preset that touches a dozen
 * controls is still one thing to undo. Without that, changing your mind about
 * a look would mean pressing undo twelve times to get your camera back.
 */

const TARGET = "studio.preset";
const HISTORY_LABEL = "Apply studio";

export function useScenePreset(): void {
  const dispatch = useToolcraftDispatch();
  const { state } = useToolcraft();
  const chosen = readScenePresetId(state.values[TARGET]);
  // What was last written, so a preset applies on the change rather than on
  // every render — otherwise it would fight every slider the moment it moved.
  const appliedRef = React.useRef<ScenePresetId | null>(null);
  const groupRef = React.useRef(0);

  React.useEffect(() => {
    if (appliedRef.current === chosen) return;
    appliedRef.current = chosen;

    const preset = SCENE_PRESETS[chosen];
    groupRef.current += 1;
    const historyGroup = `studio-preset-${groupRef.current}`;

    const writes: readonly (readonly [string, unknown])[] = [
      ["studio.environment", preset.environment],
      ["studio.intensity", preset.environmentIntensity],
      ["scene.background", preset.background],
      ["floor.environment", preset.floorEnvironment],
      ["floor.reflection", preset.floorReflection],
      ["floor.roughness", preset.floorRoughness],
      ["backdrop.height", preset.sweepHeight],
      ["backdrop.curve", preset.sweepCurve],
      ["backdrop.light", preset.sweepLight],
      ["light.keyIntensity", preset.keyIntensity],
      ["light.keyColor", preset.keyColor],
      ["light.keyDirection", preset.keyDirection],
      ["light.fill", preset.fill],
      ["light.rim", preset.rim],
      ["light.shadowSoftness", preset.shadowSoftness],
      ["camera.focalLength", preset.focalLength],
      ["camera.orbit", preset.pose],
    ];

    for (const [target, value] of writes) {
      dispatch({
        history: "merge",
        historyGroup,
        label: HISTORY_LABEL,
        target,
        type: "controls.setValue",
        value,
      });
    }
  }, [chosen, dispatch]);
}
