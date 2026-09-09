import {
  clampToolcraftTimelineTime,
  getToolcraftTimelineKeyframeId,
  roundToolcraftTimelineKeyframeTime,
} from "./timeline-values";
import type {
  ToolcraftTimelineClipboardKeyframe,
  ToolcraftTimelineKeyframe,
  ToolcraftTimelineKeyframeGroup,
} from "./types";

/**
 * A selection, kept as a pair so the anchor is never outside its own set.
 *
 * Everything that changes what is selected goes through here rather than
 * writing the two fields itself, because the invariant between them — the
 * anchor is the last id, or null when there are none — is the sort of thing
 * that holds in every branch until it doesn't.
 */
export type ToolcraftTimelineSelection = {
  readonly selectedKeyframeId: string | null;
  readonly selectedKeyframeIds: readonly string[];
};

export const emptyToolcraftTimelineSelection: ToolcraftTimelineSelection = {
  selectedKeyframeId: null,
  selectedKeyframeIds: [],
};

/** The pair for an explicit list, de-duplicated, anchored on the last one. */
export function createToolcraftTimelineSelection(
  keyframeIds: readonly string[],
): ToolcraftTimelineSelection {
  const unique = [...new Set(keyframeIds)];

  return {
    selectedKeyframeId: unique[unique.length - 1] ?? null,
    selectedKeyframeIds: unique,
  };
}

/**
 * One click's worth of selection change.
 *
 * A plain selection replaces what was there, which is what this command has
 * always done — deciding that a click on the already-selected keyframe means
 * "clear" belongs to the row, which knows what was under the pointer when the
 * press started, and it says so by passing null. Shift-click adds, and
 * shift-clicking something already in the set removes it, which is how every
 * timeline lets you correct a selection without starting again.
 */
export function applyToolcraftTimelineSelection(
  selection: ToolcraftTimelineSelection,
  keyframeId: string | null,
  additive: boolean,
): ToolcraftTimelineSelection {
  if (keyframeId === null) {
    return emptyToolcraftTimelineSelection;
  }

  if (!additive) {
    return createToolcraftTimelineSelection([keyframeId]);
  }

  return createToolcraftTimelineSelection(
    selection.selectedKeyframeIds.includes(keyframeId)
      ? selection.selectedKeyframeIds.filter((item) => item !== keyframeId)
      : [...selection.selectedKeyframeIds, keyframeId],
  );
}

/** Drop ids that no longer name a keyframe, so a stale selection cannot act. */
export function pruneToolcraftTimelineSelection(
  selection: ToolcraftTimelineSelection,
  keyframeGroups: readonly ToolcraftTimelineKeyframeGroup[],
): ToolcraftTimelineSelection {
  const live = new Set(
    keyframeGroups.flatMap((group) => group.keyframes.map((keyframe) => keyframe.id)),
  );

  return createToolcraftTimelineSelection(
    selection.selectedKeyframeIds.filter((id) => live.has(id)),
  );
}

function getSelectedKeyframes(
  keyframeGroups: readonly ToolcraftTimelineKeyframeGroup[],
  selectedKeyframeIds: readonly string[],
): readonly ToolcraftTimelineKeyframe[] {
  const selected = new Set(selectedKeyframeIds);

  return keyframeGroups.flatMap((group) =>
    group.keyframes.filter((keyframe) => selected.has(keyframe.id)),
  );
}

/**
 * Shift every selected keyframe so the one under the pointer lands on a time.
 *
 * The shift is clamped by the whole selection rather than by the keyframe
 * being dragged, so a group dragged towards either end stops when its leading
 * keyframe reaches the end instead of piling the rest of the selection up on
 * top of it. Dragging back out again restores the spacing, because nothing was
 * lost on the way in.
 *
 * An unselected keyframe a moved one lands on is replaced, which is what a
 * single keyframe dragged onto another already does. Two selected keyframes
 * cannot collide with each other: they all move by the same amount, and no two
 * on one track started at the same time.
 */
export function moveToolcraftTimelineSelection({
  anchorKeyframeId,
  durationSeconds,
  keyframeGroups,
  selectedKeyframeIds,
  timeSeconds,
}: {
  anchorKeyframeId: string;
  durationSeconds: number;
  keyframeGroups: readonly ToolcraftTimelineKeyframeGroup[];
  selectedKeyframeIds: readonly string[];
  timeSeconds: number;
}): {
  keyframeGroups: ToolcraftTimelineKeyframeGroup[];
  selection: ToolcraftTimelineSelection;
} | null {
  const moving = getSelectedKeyframes(keyframeGroups, selectedKeyframeIds);
  const anchor = moving.find((keyframe) => keyframe.id === anchorKeyframeId);

  if (!anchor || moving.length === 0) {
    return null;
  }

  const earliest = Math.min(...moving.map((keyframe) => keyframe.timeSeconds));
  const latest = Math.max(...moving.map((keyframe) => keyframe.timeSeconds));
  const requested =
    roundToolcraftTimelineKeyframeTime(
      clampToolcraftTimelineTime(timeSeconds, durationSeconds),
    ) - anchor.timeSeconds;
  const deltaSeconds = roundToolcraftTimelineKeyframeTime(
    Math.min(Math.max(requested, -earliest), durationSeconds - latest),
  );

  if (deltaSeconds === 0) {
    return null;
  }

  const movingIds = new Set(moving.map((keyframe) => keyframe.id));
  const nextSelectedIds: string[] = [];
  const nextGroups = keyframeGroups.map((group) => {
    if (!group.keyframes.some((keyframe) => movingIds.has(keyframe.id))) {
      return group;
    }

    const movedTimes = new Set(
      group.keyframes
        .filter((keyframe) => movingIds.has(keyframe.id))
        .map((keyframe) =>
          roundToolcraftTimelineKeyframeTime(keyframe.timeSeconds + deltaSeconds),
        ),
    );
    const keyframes = group.keyframes
      .flatMap((keyframe) => {
        if (!movingIds.has(keyframe.id)) {
          return movedTimes.has(keyframe.timeSeconds) ? [] : [keyframe];
        }

        const nextTimeSeconds = roundToolcraftTimelineKeyframeTime(
          keyframe.timeSeconds + deltaSeconds,
        );

        return [
          {
            ...keyframe,
            id: getToolcraftTimelineKeyframeId(keyframe.controlId, nextTimeSeconds),
            timeSeconds: nextTimeSeconds,
          },
        ];
      })
      .sort((first, second) => first.timeSeconds - second.timeSeconds);

    for (const keyframe of keyframes) {
      if (movedTimes.has(keyframe.timeSeconds)) {
        nextSelectedIds.push(keyframe.id);
      }
    }

    return { ...group, keyframes };
  });

  return {
    keyframeGroups: nextGroups,
    selection: createToolcraftTimelineSelection(nextSelectedIds),
  };
}

/**
 * What a copy of the current selection holds.
 *
 * Times are stored as offsets from the earliest keyframe in the copy, so a
 * paste is "put this shape down starting here" rather than "put it back where
 * it came from". Copying one keyframe therefore pastes it at the playhead,
 * which is the common case and needs no special handling.
 */
export function copyToolcraftTimelineSelection(
  keyframeGroups: readonly ToolcraftTimelineKeyframeGroup[],
  selectedKeyframeIds: readonly string[],
): readonly ToolcraftTimelineClipboardKeyframe[] {
  const selected = getSelectedKeyframes(keyframeGroups, selectedKeyframeIds);

  if (selected.length === 0) {
    return [];
  }

  const earliest = Math.min(...selected.map((keyframe) => keyframe.timeSeconds));

  return selected.map((keyframe) => ({
    controlId: keyframe.controlId,
    controlLabel: keyframe.controlLabel,
    ...(keyframe.easing ? { easing: keyframe.easing } : {}),
    offsetSeconds: roundToolcraftTimelineKeyframeTime(keyframe.timeSeconds - earliest),
    value: keyframe.value,
    valueLabel: keyframe.valueLabel,
  }));
}

/**
 * Where a pasted keyframe lands, and what it replaces.
 *
 * The whole copy is offset from the playhead, and a copy longer than the time
 * left is not truncated but shifted back so all of it fits — losing the tail
 * of a pasted move is worse than starting it earlier than asked, and clamping
 * would stack every overhanging keyframe on the last frame.
 *
 * Shifting back can only work while the copy is shorter than the loop. A copy
 * longer than the whole loop has no start that fits, and pulling it back to
 * zero neither made it fit nor left the overhang anywhere but the last frame —
 * where each one overwrote the last, so the final keyframe of the copy landed
 * on the loop's end and silently replaced whatever was already there. That is
 * reachable rather than exotic: shortening a loop deliberately leaves the
 * keyframes past its end in place, so any copy taken afterwards is longer than
 * the loop it will be pasted into.
 *
 * So a keyframe that has nowhere to go is not placed. `undefined` is that
 * answer, and it is deliberately not the same as zero: dropping the tail of a
 * copy that could never have fitted leaves the track alone, where stacking it
 * rewrites keyframes the paste was never asked to touch.
 */
export function getToolcraftTimelinePasteTimes(
  keyframes: readonly ToolcraftTimelineClipboardKeyframe[],
  timeSeconds: number,
  durationSeconds: number,
): readonly (number | undefined)[] {
  const span = Math.max(0, ...keyframes.map((keyframe) => keyframe.offsetSeconds));
  const room = durationSeconds - span;
  // With room to spare the copy is pulled back until it fits, exactly as
  // before, and nothing is ever dropped. With none, no start fits, so it
  // begins where it was asked to and only what fits is placed.
  const start = clampToolcraftTimelineTime(
    room >= 0 ? Math.min(timeSeconds, room) : timeSeconds,
    durationSeconds,
  );

  return keyframes.map((keyframe) => {
    const time = roundToolcraftTimelineKeyframeTime(start + keyframe.offsetSeconds);

    return time > durationSeconds ? undefined : time;
  });
}
