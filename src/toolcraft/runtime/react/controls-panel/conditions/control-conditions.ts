import {
  getToolcraftCanvasSizeTargetDimension,
  isToolcraftTimelinePanelExtendedTarget,
  isToolcraftTimelinePanelVisibleTarget,
} from "../../../schema/runtime-targets";
import {
  doesToolcraftApplicabilityMatch,
  doesToolcraftPredicateMatchValue,
  getToolcraftApplicabilityTargets,
} from "../../../schema/control-applicability";
import type {
  ToolcraftControlConditionSchema,
  ResolvedToolcraftControlSchema,
  ResolvedToolcraftControlSectionSchema,
} from "../../../schema/types";
import type { ToolcraftState } from "../../../state/types";
import { readToolcraftCanvasRuntimeTarget } from "../../../state/canvas-frame";
import { evaluateToolcraftTimelineValue } from "../../../state/keyframe-evaluation";

function getControlDefaultValueByTarget(
  sections: readonly ResolvedToolcraftControlSectionSchema[],
  target: string,
): unknown {
  for (const section of sections) {
    for (const control of Object.values(section.controls)) {
      if (control.target === target) {
        return control.defaultValue;
      }
    }
  }

  return undefined;
}

export function getToolcraftTargetValue(
  state: ToolcraftState,
  target: string,
): unknown {
  const canvasTarget = readToolcraftCanvasRuntimeTarget(state, target);

  if (canvasTarget.handled) {
    return canvasTarget.value;
  }

  const canvasSizeDimension = getToolcraftCanvasSizeTargetDimension(target);

  if (isToolcraftTimelinePanelExtendedTarget(target)) {
    return state.panels.timeline.extended === true;
  }

  if (isToolcraftTimelinePanelVisibleTarget(target)) {
    return state.panels.timeline.hidden !== true;
  }

  return canvasSizeDimension
    ? state.canvas.size[canvasSizeDimension]
    : (state.values[target] ??
        getControlDefaultValueByTarget(
          state.schema.panels.controls?.sections ?? [],
          target,
        ));
}

/**
 * The number a panel shows for a target, which is the number the canvas draws.
 *
 * For a control with no keyframes these are the same thing. For a keyframed
 * one they are not: the canvas reads the keyframes at the playhead, and a
 * panel reading `state.values` reads wherever the slider was last left. Those
 * two part company the moment a second keyframe exists, and the panel showing
 * the stale one is how you end up scrubbing into the middle of a turn, seeing
 * the device at 180 degrees, and reading 0 in the box beside it.
 *
 * Reading the keyframes here is also what makes an edit start from the frame
 * in front of you. The value a panel holds is the value an edit begins at, so
 * a slider dragged at the playhead now moves off what is on screen rather
 * than off a number nothing is showing.
 */
export function getToolcraftPanelTargetValue(
  state: ToolcraftState,
  target: string,
): unknown {
  return state.timeline.keyframeGroups.some(
    (group) => group.controlId === target,
  )
    ? evaluateToolcraftTimelineValue(state, target)
    : getToolcraftTargetValue(state, target);
}

export function getToolcraftConditionTargets(
  ...conditions: ReadonlyArray<ToolcraftControlConditionSchema | undefined>
): string[] {
  return [
    ...new Set(
      conditions.flatMap((condition) =>
        condition ? [condition.target] : [],
      ),
    ),
  ];
}

export function getToolcraftControlConditionTargets(
  control: ResolvedToolcraftControlSchema,
): string[] {
  return [
    ...new Set([
      ...getToolcraftApplicabilityTargets(
        control.applicability,
      ),
      ...getToolcraftConditionTargets(control.disabledWhen),
    ]),
  ];
}

export function getToolcraftControlVisibilityTargets(
  control: ResolvedToolcraftControlSchema,
): string[] {
  return getToolcraftApplicabilityTargets(
    control.applicability,
  );
}

export function getToolcraftSectionVisibilityTargets(
  section: ResolvedToolcraftControlSectionSchema,
): string[] {
  return getToolcraftConditionTargets(section.visibleWhen);
}

export function toolcraftConditionMatches(
  state: ToolcraftState,
  condition: ToolcraftControlConditionSchema,
): boolean {
  return doesToolcraftPredicateMatchValue(
    condition,
    getToolcraftTargetValue(state, condition.target),
  );
}

export function isToolcraftSectionVisible(
  state: ToolcraftState,
  section: ResolvedToolcraftControlSectionSchema,
): boolean {
  return section.visibleWhen
    ? toolcraftConditionMatches(state, section.visibleWhen)
    : true;
}

export function isToolcraftControlVisible(
  state: ToolcraftState,
  control: ResolvedToolcraftControlSchema,
): boolean {
  return doesToolcraftApplicabilityMatch(
    control.applicability,
    (target) => getToolcraftTargetValue(state, target),
  );
}

export function isToolcraftControlDisabled(
  state: ToolcraftState,
  control: ResolvedToolcraftControlSchema,
): boolean {
  if (control.disabled) {
    return true;
  }

  return control.disabledWhen
    ? toolcraftConditionMatches(state, control.disabledWhen)
    : false;
}
