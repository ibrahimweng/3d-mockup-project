import { commitToolcraftStatePatch } from "./history-patches";
import {
  getToolcraftValueControls,
  normalizeToolcraftControlValue,
} from "./control-value-normalization";
import { evaluateToolcraftTimelineValue } from "./keyframe-evaluation";
import {
  clampToolcraftTimelinePlaybackRate,
  clampToolcraftTimelineDurationSeconds,
  clampToolcraftTimelineTime,
  getToolcraftTimelineKeyframeId,
  roundToolcraftTimelineKeyframeTime,
  toolcraftTimelineMinDurationSeconds,
} from "./timeline-values";
import type {
  ToolcraftCommand,
  ToolcraftState,
  ToolcraftTimelineKeyframe,
  ToolcraftTimelineKeyframeGroup,
} from "./types";

type ToolcraftTimelineCommand = Extract<
  ToolcraftCommand,
  {
    type:
      | "timeline.changeKeyframeEasing"
      | "timeline.deleteControlKeyframes"
      | "timeline.deleteKeyframe"
      | "timeline.moveKeyframe"
      | "timeline.selectKeyframe"
      | "timeline.setCurrentTime"
      | "timeline.setDuration"
      | "timeline.setExpanded"
      | "timeline.setPlaybackRate"
      | "timeline.setPlaying"
      | "timeline.toggleControlKeyframes"
      | "timeline.toggleExpanded"
      | "timeline.toggleLoop"
      | "timeline.togglePlayback"
      | "timeline.upsertControlKeyframe";
  }
>;

function createTimelineControlKeyframe({
  controlId,
  controlLabel,
  state,
  timeSeconds,
  value,
  valueLabel,
}: {
  controlId: string;
  controlLabel: string;
  state: ToolcraftState;
  timeSeconds?: number;
  value: unknown;
  valueLabel: string;
}): ToolcraftTimelineKeyframe {
  const resolvedTimeSeconds = roundToolcraftTimelineKeyframeTime(
    clampToolcraftTimelineTime(
      timeSeconds ?? state.timeline.currentTimeSeconds,
      state.timeline.durationSeconds,
    ),
  );

  return {
    controlId,
    controlLabel,
    id: getToolcraftTimelineKeyframeId(controlId, resolvedTimeSeconds),
    timeSeconds: resolvedTimeSeconds,
    value,
    valueLabel,
  };
}

function normalizeTimelineControlValue(
  state: ToolcraftState,
  controlId: string,
  value: unknown,
): { accepted: true; value: unknown } | { accepted: false } {
  const control = getToolcraftValueControls(state.schema).get(controlId);
  if (!control) {
    return { accepted: true, value };
  }

  const normalized = normalizeToolcraftControlValue(control, value);
  return normalized.accepted
    ? { accepted: true, value: normalized.value }
    : { accepted: false };
}

function upsertTimelineControlKeyframeGroup({
  controlId,
  controlLabel,
  keyframe,
  keyframeGroups,
}: {
  controlId: string;
  controlLabel: string;
  keyframe: ToolcraftTimelineKeyframe;
  keyframeGroups: readonly ToolcraftTimelineKeyframeGroup[];
}): ToolcraftTimelineKeyframeGroup[] {
  const existingGroup = keyframeGroups.find((group) => group.controlId === controlId);
  const nextKeyframes = [
    ...(existingGroup?.keyframes.filter((item) => item.id !== keyframe.id) ?? []),
    keyframe,
  ].sort(
    (firstKeyframe, secondKeyframe) => firstKeyframe.timeSeconds - secondKeyframe.timeSeconds,
  );
  const nextGroup: ToolcraftTimelineKeyframeGroup = {
    controlId,
    keyframes: nextKeyframes,
    label: existingGroup?.label ?? controlLabel,
  };

  if (!existingGroup) {
    return [...keyframeGroups, nextGroup];
  }

  return keyframeGroups.map((group) => (group.controlId === controlId ? nextGroup : group));
}

/**
 * What a control is left holding once its keyframes are gone.
 *
 * It keeps the value the playhead was showing, because that is the frame that
 * was on screen and in the panel the instant before the track was deleted.
 * The alternative is a jump to `state.values`, which still holds whatever the
 * slider was last dragged to before the track existed: nothing has read it
 * since the first keyframe was laid down, and it is very rarely the frame you
 * are looking at. Folding the value into the same patch as the deletion is
 * what keeps one undo enough to put the keyframes and the value back together.
 */
function getUnkeyframedControlValuePatch(
  state: ToolcraftState,
  nextKeyframeGroups: readonly ToolcraftTimelineKeyframeGroup[],
): { after: Record<string, unknown>; before: Record<string, unknown> } {
  const stillKeyframed = new Set(
    nextKeyframeGroups.map((group) => group.controlId),
  );
  const after: Record<string, unknown> = {};
  const before: Record<string, unknown> = {};

  for (const group of state.timeline.keyframeGroups) {
    if (stillKeyframed.has(group.controlId)) {
      continue;
    }

    after[group.controlId] = evaluateToolcraftTimelineValue(
      state,
      group.controlId,
    );
    before[group.controlId] = state.values[group.controlId];
  }

  return { after, before };
}

function mapTimelineKeyframeGroups(
  keyframeGroups: readonly ToolcraftTimelineKeyframeGroup[],
  keyframeId: string,
  updateKeyframe: (
    keyframe: ToolcraftTimelineKeyframeGroup["keyframes"][number],
  ) => ToolcraftTimelineKeyframeGroup["keyframes"][number],
): ToolcraftTimelineKeyframeGroup[] {
  return keyframeGroups.map((group) => ({
    ...group,
    keyframes: group.keyframes.map((keyframe) =>
      keyframe.id === keyframeId ? updateKeyframe(keyframe) : keyframe,
    ),
  }));
}

export function reduceToolcraftTimelineCommand(
  state: ToolcraftState,
  command: ToolcraftTimelineCommand,
): ToolcraftState {
  switch (command.type) {
    case "timeline.setCurrentTime": {
      return {
        ...state,
        timeline: {
          ...state.timeline,
          currentTimeSeconds: clampToolcraftTimelineTime(
            command.currentTimeSeconds,
            state.timeline.durationSeconds,
          ),
        },
      };
    }

    case "timeline.setDuration": {
      const durationSeconds = clampToolcraftTimelineDurationSeconds(
        command.durationSeconds,
        toolcraftTimelineMinDurationSeconds,
      );
      const timeline = {
        ...state.timeline,
        currentTimeSeconds: clampToolcraftTimelineTime(
          state.timeline.currentTimeSeconds,
          durationSeconds,
        ),
        durationSeconds,
      };

      return commitToolcraftStatePatch(state, {
        after: { timeline },
        before: { timeline: state.timeline },
        label: "Set timeline duration",
      });
    }

    case "timeline.setExpanded": {
      if (state.timeline.expanded === command.expanded) {
        return state;
      }

      return {
        ...state,
        timeline: {
          ...state.timeline,
          expanded: command.expanded,
        },
      };
    }

    case "timeline.toggleExpanded": {
      return {
        ...state,
        timeline: {
          ...state.timeline,
          expanded: !state.timeline.expanded,
        },
      };
    }

    case "timeline.setPlaying": {
      return {
        ...state,
        timeline: {
          ...state.timeline,
          isPlaying: command.isPlaying,
        },
      };
    }

    case "timeline.togglePlayback": {
      const shouldRestartPlayback =
        !state.timeline.isPlaying &&
        state.timeline.currentTimeSeconds >= state.timeline.durationSeconds;

      return {
        ...state,
        timeline: {
          ...state.timeline,
          currentTimeSeconds: shouldRestartPlayback ? 0 : state.timeline.currentTimeSeconds,
          isPlaying: !state.timeline.isPlaying,
        },
      };
    }

    case "timeline.setPlaybackRate": {
      // Not a history entry, for the same reason scrubbing is not one: review
      // speed is a way of looking at the work rather than a change to it, and
      // it leaves the keyframes, their times and the length of the loop exactly
      // as they were.
      return {
        ...state,
        timeline: {
          ...state.timeline,
          playbackRate: clampToolcraftTimelinePlaybackRate(command.playbackRate),
        },
      };
    }

    case "timeline.toggleLoop": {
      return {
        ...state,
        timeline: {
          ...state.timeline,
          isLooping: !state.timeline.isLooping,
        },
      };
    }

    case "timeline.selectKeyframe": {
      return {
        ...state,
        timeline: {
          ...state.timeline,
          selectedKeyframeId: command.keyframeId,
        },
      };
    }

    case "timeline.deleteKeyframe": {
      if (
        !state.timeline.keyframeGroups.some((group) =>
          group.keyframes.some((keyframe) => keyframe.id === command.keyframeId),
        )
      ) {
        return state;
      }

      const timeline = {
        ...state.timeline,
        keyframeGroups: state.timeline.keyframeGroups
          .map((group) => ({
            ...group,
            keyframes: group.keyframes.filter((keyframe) => keyframe.id !== command.keyframeId),
          }))
          .filter((group) => group.keyframes.length > 0),
        selectedKeyframeId: null,
      };
      const heldValues = getUnkeyframedControlValuePatch(
        state,
        timeline.keyframeGroups,
      );

      return commitToolcraftStatePatch(state, {
        after: { ...heldValues.after, timeline },
        before: { ...heldValues.before, timeline: state.timeline },
        label: "Delete keyframe",
      });
    }

    case "timeline.deleteControlKeyframes": {
      if (!state.timeline.keyframeGroups.some((group) => group.controlId === command.controlId)) {
        return state;
      }

      const timeline = {
        ...state.timeline,
        keyframeGroups: state.timeline.keyframeGroups.filter(
          (group) => group.controlId !== command.controlId,
        ),
        selectedKeyframeId: null,
      };
      const heldValues = getUnkeyframedControlValuePatch(
        state,
        timeline.keyframeGroups,
      );

      return commitToolcraftStatePatch(state, {
        after: { ...heldValues.after, timeline },
        before: { ...heldValues.before, timeline: state.timeline },
        label: "Delete control keyframes",
      });
    }

    case "timeline.toggleControlKeyframes": {
      const existingGroup = state.timeline.keyframeGroups.find(
        (group) => group.controlId === command.controlId,
      );

      if (existingGroup) {
        const timeline = {
          ...state.timeline,
          expanded: true,
          keyframeGroups: state.timeline.keyframeGroups.filter(
            (group) => group.controlId !== command.controlId,
          ),
          selectedKeyframeId: null,
        };
        const heldValues = getUnkeyframedControlValuePatch(
          state,
          timeline.keyframeGroups,
        );

        return commitToolcraftStatePatch(state, {
          after: { ...heldValues.after, timeline },
          before: { ...heldValues.before, timeline: state.timeline },
          label: "Delete control keyframes",
        });
      }

      const normalized = normalizeTimelineControlValue(
        state,
        command.controlId,
        command.value,
      );
      if (!normalized.accepted) {
        return state;
      }

      const keyframe = createTimelineControlKeyframe({
        controlId: command.controlId,
        controlLabel: command.controlLabel,
        state,
        timeSeconds: command.timeSeconds,
        value: normalized.value,
        valueLabel: command.valueLabel,
      });
      const timeline = {
        ...state.timeline,
        expanded: true,
        keyframeGroups: upsertTimelineControlKeyframeGroup({
          controlId: command.controlId,
          controlLabel: command.controlLabel,
          keyframe,
          keyframeGroups: state.timeline.keyframeGroups,
        }),
        selectedKeyframeId: keyframe.id,
      };

      return commitToolcraftStatePatch(state, {
        after: { timeline },
        before: { timeline: state.timeline },
        label: "Add control keyframe",
      });
    }

    case "timeline.upsertControlKeyframe": {
      const normalized = normalizeTimelineControlValue(
        state,
        command.controlId,
        command.value,
      );
      if (!normalized.accepted) {
        return state;
      }

      const keyframe = createTimelineControlKeyframe({
        controlId: command.controlId,
        controlLabel: command.controlLabel,
        state,
        timeSeconds: command.timeSeconds,
        value: normalized.value,
        valueLabel: command.valueLabel,
      });
      const timeline = {
        ...state.timeline,
        expanded: true,
        keyframeGroups: upsertTimelineControlKeyframeGroup({
          controlId: command.controlId,
          controlLabel: command.controlLabel,
          keyframe,
          keyframeGroups: state.timeline.keyframeGroups,
        }),
        selectedKeyframeId: keyframe.id,
      };

      return commitToolcraftStatePatch(state, {
        after: { timeline },
        before: { timeline: state.timeline },
        label: "Set control keyframe",
      });
    }

    case "timeline.moveKeyframe": {
      const targetKeyframe = state.timeline.keyframeGroups
        .flatMap((group) => group.keyframes)
        .find((keyframe) => keyframe.id === command.keyframeId);

      if (!targetKeyframe) {
        return state;
      }

      const timeSeconds = roundToolcraftTimelineKeyframeTime(
        clampToolcraftTimelineTime(command.timeSeconds, state.timeline.durationSeconds),
      );
      const nextKeyframeId = getToolcraftTimelineKeyframeId(
        targetKeyframe.controlId,
        timeSeconds,
      );
      // A keyframe dragged onto one already sitting there replaces it, and the
      // track stays in time order afterwards. Neither used to be true. A
      // keyframe's id is its control and its time, so landing on an occupied
      // frame minted a second keyframe carrying the first one's id: two points
      // on one frame, selecting or deleting either one reaching both, and a
      // value on the track that no time could ever evaluate to. Dragging one
      // keyframe past another left the array in the order they were created,
      // which the evaluator survives because it sorts a copy, and the row of
      // diamonds above it did not.
      const movedKeyframes = (
        state.timeline.keyframeGroups
          .find((group) => group.controlId === targetKeyframe.controlId)
          ?.keyframes.flatMap((keyframe) => {
            if (keyframe.id === command.keyframeId) {
              return [{ ...keyframe, id: nextKeyframeId, timeSeconds }];
            }

            return keyframe.timeSeconds === timeSeconds ? [] : [keyframe];
          }) ?? []
      ).sort((first, second) => first.timeSeconds - second.timeSeconds);
      const timeline = {
        ...state.timeline,
        keyframeGroups: state.timeline.keyframeGroups.map((group) =>
          group.controlId === targetKeyframe.controlId
            ? { ...group, keyframes: movedKeyframes }
            : group,
        ),
        selectedKeyframeId: nextKeyframeId,
      };

      return commitToolcraftStatePatch(state, {
        after: { timeline },
        before: { timeline: state.timeline },
        label: "Move keyframe",
      });
    }

    case "timeline.changeKeyframeEasing": {
      if (
        !state.timeline.keyframeGroups.some((group) =>
          group.keyframes.some((keyframe) => keyframe.id === command.keyframeId),
        )
      ) {
        return state;
      }

      const timeline = {
        ...state.timeline,
        keyframeGroups: mapTimelineKeyframeGroups(
          state.timeline.keyframeGroups,
          command.keyframeId,
          (keyframe) => ({
            ...keyframe,
            easing: command.easing,
          }),
        ),
      };

      return commitToolcraftStatePatch(state, {
        after: { timeline },
        before: { timeline: state.timeline },
        label: "Change keyframe easing",
      });
    }
  }
}
