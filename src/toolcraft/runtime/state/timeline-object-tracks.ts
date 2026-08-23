import type {
  ToolcraftTimelineKeyframe,
  ToolcraftTimelineKeyframeGroup,
} from "./types";

/**
 * One object's worth of the timeline: every control on it that has been keyed.
 *
 * A row per control answers "what did Spin do", but the question people
 * actually bring to a timeline is "what does the device do", and a device with
 * six keyed properties used to be six unrelated rows with nothing saying they
 * belonged together.
 */
export type ToolcraftTimelineObjectTrack = {
  readonly groups: readonly ToolcraftTimelineKeyframeGroup[];
  readonly keyframeTimes: readonly number[];
  readonly label: string;
  readonly objectId: string;
};

/**
 * The object a control belongs to, read off the front of its target.
 *
 * Targets are already written as "object.property" — `device.spin`,
 * `camera.orbit` — so the grouping is there to be read rather than declared.
 * A target with no dot is its own object.
 */
export function getToolcraftTimelineObjectId(controlId: string): string {
  const separatorIndex = controlId.indexOf(".");

  return separatorIndex === -1 ? controlId : controlId.slice(0, separatorIndex);
}

export function humanizeToolcraftTimelineObjectId(objectId: string): string {
  const words = objectId
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .trim()
    .toLowerCase();

  if (words.length === 0) {
    return objectId;
  }

  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
}

/** Every distinct moment this object moves at, whichever of its controls moved. */
function getObjectKeyframeTimes(
  groups: readonly ToolcraftTimelineKeyframeGroup[],
): readonly number[] {
  const times = new Set<number>();

  for (const group of groups) {
    for (const keyframe of group.keyframes) {
      times.add(keyframe.timeSeconds);
    }
  }

  return [...times].sort((first, second) => first - second);
}

export function getToolcraftTimelineObjectTracks(
  keyframeGroups: readonly ToolcraftTimelineKeyframeGroup[],
): readonly ToolcraftTimelineObjectTrack[] {
  const groupsByObjectId = new Map<string, ToolcraftTimelineKeyframeGroup[]>();

  // Insertion order, so a track does not jump around the panel as you key it.
  for (const group of keyframeGroups) {
    const objectId = getToolcraftTimelineObjectId(group.controlId);
    const existing = groupsByObjectId.get(objectId);

    if (existing) {
      existing.push(group);
      continue;
    }

    groupsByObjectId.set(objectId, [group]);
  }

  return [...groupsByObjectId].map(([objectId, groups]) => ({
    groups,
    keyframeTimes: getObjectKeyframeTimes(groups),
    label: humanizeToolcraftTimelineObjectId(objectId),
    objectId,
  }));
}

export function getToolcraftTimelineObjectKeyframesAtTime(
  track: ToolcraftTimelineObjectTrack,
  timeSeconds: number,
): readonly ToolcraftTimelineKeyframe[] {
  return track.groups.flatMap((group) =>
    group.keyframes.filter((keyframe) => keyframe.timeSeconds === timeSeconds),
  );
}
