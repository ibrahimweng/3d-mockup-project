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
import {
  createToolcraftTimelineSelection,
  emptyToolcraftTimelineSelection,
  getToolcraftTimelinePasteTimes,
  moveToolcraftTimelineSelection,
  pruneToolcraftTimelineSelection,
  applyToolcraftTimelineSelection,
} from "./timeline-selection";
import type {
  ToolcraftCommand,
  ToolcraftState,
  ToolcraftTimelineKeyframe,
  ToolcraftTimelineKeyframeEasing,
  ToolcraftTimelineKeyframeGroup,
} from "./types";

type ToolcraftTimelineCommand = Extract<
  ToolcraftCommand,
  {
    type:
      | "timeline.changeKeyframeEaseIn"
      | "timeline.changeKeyframeEasing"
      | "timeline.deleteControlKeyframes"
      | "timeline.deleteKeyframe"
      | "timeline.deleteSelectedKeyframes"
      | "timeline.moveKeyframe"
      | "timeline.moveSelectedKeyframes"
      | "timeline.pasteKeyframes"
      | "timeline.selectKeyframe"
      | "timeline.setKeyframeSelection"
      | "timeline.setControlKeyframes"
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
  easing,
  state,
  timeSeconds,
  value,
  valueLabel,
}: {
  controlId: string;
  controlLabel: string;
  /**
   * Set where a keyframe is laid down already knowing its curve, which a
   * preset does. Left off, the keyframe takes the editor's default, which is
   * what an edit made by hand should do.
   */
  easing?: ToolcraftTimelineKeyframeEasing;
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
    ...(easing ? { easing } : {}),
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
  keyframeIds: ReadonlySet<string>,
  updateKeyframe: (
    keyframe: ToolcraftTimelineKeyframeGroup["keyframes"][number],
  ) => ToolcraftTimelineKeyframeGroup["keyframes"][number],
): ToolcraftTimelineKeyframeGroup[] {
  return keyframeGroups.map((group) => ({
    ...group,
    keyframes: group.keyframes.map((keyframe) =>
      keyframeIds.has(keyframe.id) ? updateKeyframe(keyframe) : keyframe,
    ),
  }));
}

/**
 * The keyframes a curve edit applies to.
 *
 * Just the one it was aimed at, unless the command asked for the selection and
 * that keyframe is part of it — shaping a curve with several keyframes selected
 * means all of them, and shaping one that is not in the selection means only
 * it, whatever else happens to be selected elsewhere.
 */
function getTimelineEasingTargetIds(
  state: ToolcraftState,
  keyframeId: string,
  applyToSelection: boolean | undefined,
): ReadonlySet<string> {
  return applyToSelection && state.timeline.selectedKeyframeIds.includes(keyframeId)
    ? new Set(state.timeline.selectedKeyframeIds)
    : new Set([keyframeId]);
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
          ...applyToolcraftTimelineSelection(
            state.timeline,
            command.keyframeId,
            command.additive === true,
          ),
        },
      };
    }

    case "timeline.setKeyframeSelection": {
      return {
        ...state,
        timeline: {
          ...state.timeline,
          ...pruneToolcraftTimelineSelection(
            createToolcraftTimelineSelection(command.keyframeIds),
            state.timeline.keyframeGroups,
          ),
        },
      };
    }

    /**
     * Delete every selected keyframe as one entry in history.
     *
     * Deleting a five-keyframe selection one command at a time would take five
     * undos to put back, and each intermediate state is one nobody asked for.
     */
    case "timeline.deleteSelectedKeyframes": {
      const doomed = new Set(state.timeline.selectedKeyframeIds);

      if (doomed.size === 0) {
        return state;
      }

      const keyframeGroups = state.timeline.keyframeGroups
        .map((group) => ({
          ...group,
          keyframes: group.keyframes.filter((keyframe) => !doomed.has(keyframe.id)),
        }))
        .filter((group) => group.keyframes.length > 0);

      if (
        keyframeGroups.length === state.timeline.keyframeGroups.length &&
        keyframeGroups.every(
          (group, index) =>
            group.keyframes.length ===
            state.timeline.keyframeGroups[index]?.keyframes.length,
        )
      ) {
        return state;
      }

      const timeline = {
        ...state.timeline,
        ...emptyToolcraftTimelineSelection,
        keyframeGroups,
      };
      const heldValues = getUnkeyframedControlValuePatch(state, keyframeGroups);

      return commitToolcraftStatePatch(state, {
        after: { ...heldValues.after, timeline },
        before: { ...heldValues.before, timeline: state.timeline },
        label: "Delete keyframes",
      });
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
        ...emptyToolcraftTimelineSelection,
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
        ...emptyToolcraftTimelineSelection,
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
          ...emptyToolcraftTimelineSelection,
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
        ...createToolcraftTimelineSelection([keyframe.id]),
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
        ...createToolcraftTimelineSelection([keyframe.id]),
      };

      return commitToolcraftStatePatch(
        state,
        {
          after: { timeline },
          before: { timeline: state.timeline },
          label: "Set control keyframe",
        },
        // A gesture that keys as it goes -- turning the camera, dragging a
        // slider on a keyed control -- sends one of these per animation frame,
        // all of them landing on the same keyframe because the playhead has
        // not moved. Merged, the whole gesture is one undo entry that goes
        // back to the track as it stood before the drag began.
        { group: command.historyGroup, mode: command.history },
      );
    }

    case "timeline.setControlKeyframes": {
      const replaced = new Set(command.tracks.map((entry) => entry.controlId));
      const kept = state.timeline.keyframeGroups.filter(
        (group) => !replaced.has(group.controlId),
      );
      const written = command.tracks.flatMap((entry) => {
        const keyframes = entry.keyframes
          .flatMap((keyframe) => {
            const normalized = normalizeTimelineControlValue(
              state,
              entry.controlId,
              keyframe.value,
            );

            // A value this control could never hold is dropped rather than
            // written, so a preset built against a schema that has since
            // changed lays down the part of itself that still applies instead
            // of nothing at all.
            return normalized.accepted
              ? [
                  createTimelineControlKeyframe({
                    controlId: entry.controlId,
                    controlLabel: entry.controlLabel,
                    easing: keyframe.easing,
                    state,
                    timeSeconds: keyframe.timeSeconds,
                    value: normalized.value,
                    valueLabel: keyframe.valueLabel,
                  }),
                ]
              : [];
          })
          // Two keyframes rounded onto the same frame are one keyframe, and
          // the later one wins: an id is a control and a time, so keeping both
          // would put two points on one frame carrying the same id.
          .reduce<ToolcraftTimelineKeyframe[]>((all, keyframe) => {
            const existing = all.findIndex((item) => item.id === keyframe.id);

            if (existing >= 0) {
              all[existing] = keyframe;
              return all;
            }

            return [...all, keyframe];
          }, [])
          .sort((first, second) => first.timeSeconds - second.timeSeconds);

        return keyframes.length > 0
          ? [
              {
                controlId: entry.controlId,
                keyframes,
                label:
                  state.timeline.keyframeGroups.find(
                    (group) => group.controlId === entry.controlId,
                  )?.label ?? entry.controlLabel,
              },
            ]
          : [];
      });
      const keyframeGroups = [...kept, ...written];
      const timeline = {
        ...state.timeline,
        expanded: true,
        keyframeGroups,
        ...pruneToolcraftTimelineSelection(state.timeline, keyframeGroups),
      };
      // A track asked for and then not written is a track being cleared, and a
      // cleared control holds the frame the playhead was showing rather than
      // the raw value nothing has read since it was first keyed.
      const heldValues = getUnkeyframedControlValuePatch(state, keyframeGroups);

      return commitToolcraftStatePatch(state, {
        after: { ...heldValues.after, timeline },
        before: { ...heldValues.before, timeline: state.timeline },
        label: "Set control keyframes",
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
        ...createToolcraftTimelineSelection([nextKeyframeId]),
      };

      return commitToolcraftStatePatch(state, {
        after: { timeline },
        before: { timeline: state.timeline },
        label: "Move keyframe",
      });
    }

    case "timeline.moveSelectedKeyframes": {
      const moved = moveToolcraftTimelineSelection({
        anchorKeyframeId: command.anchorKeyframeId,
        durationSeconds: state.timeline.durationSeconds,
        keyframeGroups: state.timeline.keyframeGroups,
        selectedKeyframeIds: state.timeline.selectedKeyframeIds,
        timeSeconds: command.timeSeconds,
      });

      if (!moved) {
        return state;
      }

      const timeline = {
        ...state.timeline,
        ...moved.selection,
        keyframeGroups: moved.keyframeGroups,
      };

      return commitToolcraftStatePatch(state, {
        after: { timeline },
        before: { timeline: state.timeline },
        label: "Move keyframes",
      });
    }

    /**
     * Put a copied shape down starting at a time.
     *
     * A pasted keyframe joins the track its control already has, or brings one
     * back if the track was deleted since the copy — the same reach
     * `upsertControlKeyframe` has, because pasting is the same act of saying
     * this control has a value at this time. Values go through the control's
     * own normalization on the way in, so a copy taken before a control
     * changed shape cannot put an impossible value on a track.
     */
    case "timeline.pasteKeyframes": {
      const times = getToolcraftTimelinePasteTimes(
        command.keyframes,
        command.timeSeconds,
        state.timeline.durationSeconds,
      );
      let keyframeGroups = state.timeline.keyframeGroups;
      const pastedIds: string[] = [];

      command.keyframes.forEach((clipboardKeyframe, index) => {
        const timeSeconds = times[index];
        const normalized = normalizeTimelineControlValue(
          state,
          clipboardKeyframe.controlId,
          clipboardKeyframe.value,
        );

        if (timeSeconds === undefined || !normalized.accepted) {
          return;
        }

        const keyframe: ToolcraftTimelineKeyframe = {
          controlId: clipboardKeyframe.controlId,
          controlLabel: clipboardKeyframe.controlLabel,
          ...(clipboardKeyframe.easing ? { easing: clipboardKeyframe.easing } : {}),
          id: getToolcraftTimelineKeyframeId(clipboardKeyframe.controlId, timeSeconds),
          timeSeconds,
          value: normalized.value,
          valueLabel: clipboardKeyframe.valueLabel,
        };

        keyframeGroups = upsertTimelineControlKeyframeGroup({
          controlId: keyframe.controlId,
          controlLabel: keyframe.controlLabel,
          keyframe,
          keyframeGroups,
        });
        pastedIds.push(keyframe.id);
      });

      if (pastedIds.length === 0) {
        return state;
      }

      const timeline = {
        ...state.timeline,
        ...createToolcraftTimelineSelection(pastedIds),
        expanded: true,
        keyframeGroups,
      };

      return commitToolcraftStatePatch(state, {
        after: { timeline },
        before: { timeline: state.timeline },
        label: "Paste keyframes",
      });
    }

    case "timeline.changeKeyframeEasing": {
      const keyframeIds = getTimelineEasingTargetIds(
        state,
        command.keyframeId,
        command.applyToSelection,
      );

      if (
        !state.timeline.keyframeGroups.some((group) =>
          group.keyframes.some((keyframe) => keyframeIds.has(keyframe.id)),
        )
      ) {
        return state;
      }

      const timeline = {
        ...state.timeline,
        keyframeGroups: mapTimelineKeyframeGroups(
          state.timeline.keyframeGroups,
          keyframeIds,
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

    /**
     * Shape how the motion arrives at a keyframe.
     *
     * Separate from `changeKeyframeEasing` rather than another field on it,
     * because they write different halves of different segments: this one
     * belongs to the segment *before* the keyframe, and that one to the segment
     * after it. Clearing it hands the whole segment back to the keyframe it
     * leaves, which is where both handles lived before this existed.
     */
    case "timeline.changeKeyframeEaseIn": {
      const keyframeIds = getTimelineEasingTargetIds(
        state,
        command.keyframeId,
        command.applyToSelection,
      );

      if (
        !state.timeline.keyframeGroups.some((group) =>
          group.keyframes.some((keyframe) => keyframeIds.has(keyframe.id)),
        )
      ) {
        return state;
      }

      const timeline = {
        ...state.timeline,
        keyframeGroups: mapTimelineKeyframeGroups(
          state.timeline.keyframeGroups,
          keyframeIds,
          ({ easeIn: _easeIn, ...keyframe }) =>
            command.controlPoints
              ? { ...keyframe, easeIn: [...command.controlPoints] as typeof command.controlPoints }
              : keyframe,
        ),
      };

      return commitToolcraftStatePatch(state, {
        after: { timeline },
        before: { timeline: state.timeline },
        label: "Change keyframe ease in",
      });
    }
  }
}
