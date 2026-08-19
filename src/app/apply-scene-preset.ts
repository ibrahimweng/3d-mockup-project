import * as React from "react";
import { useToolcraft, useToolcraftDispatch } from "@/toolcraft/runtime/react";

import {
  DEFAULT_SCENE_PRESET,
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
 * None of the writes takes a place in the undo history, and the one thing that
 * does is the choice itself. That is not a shortcut, it is the only coherent
 * account of what happened: the user picked a studio, and fifteen values
 * moved because of it. Undo puts the choice back, and these run again for
 * whatever was chosen before — values and all, in one press.
 *
 * Grouping them instead does not work, and fails quietly. The runtime's merge
 * is built for a drag, where every write lands on the same target: it keeps
 * the first `before` and replaces the `after`, which is exactly right for one
 * control moving many times and lossy for fifteen controls moving once. A
 * merged preset remembered how to undo its first write and forgot the other
 * fourteen, so the first press of undo moved a single slider and left the rest
 * of the studio where it was.
 */

const TARGET = "studio.preset";

export function useScenePreset(): void {
  const dispatch = useToolcraftDispatch();
  const { state } = useToolcraft();
  const chosen = readScenePresetId(state.values[TARGET]);
  /**
   * What was last written, so a preset applies on the change rather than on
   * every render — otherwise it would fight every slider the moment it moved.
   *
   * Seeded with the default rather than empty, because the schema's defaults
   * are that preset already. Writing them again on mount changed nothing
   * anyone could see and cost a place in the undo history: the app opened with
   * a step to undo before the user had done anything, and every preset chosen
   * afterwards took two presses of undo to come back from — the first one
   * spending that phantom step.
   */
  const appliedRef = React.useRef<ScenePresetId | null>(DEFAULT_SCENE_PRESET);

  React.useEffect(() => {
    if (appliedRef.current === chosen) return;
    appliedRef.current = chosen;

    const preset = SCENE_PRESETS[chosen];

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
      ["light.pattern", preset.pattern],
      ["camera.focalLength", preset.focalLength],
      ["camera.orbit", preset.pose],
    ];

    for (const [target, value] of writes) {
      dispatch({
        history: "skip",
        target,
        type: "controls.setValue",
        value,
      });
    }
  }, [chosen, dispatch]);
}
