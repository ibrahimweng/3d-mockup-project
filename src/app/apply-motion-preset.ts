import {
  evaluateToolcraftTimelineValue,
  type ToolcraftCommand,
  type ToolcraftState,
} from "@/toolcraft/runtime";
import { readToolcraftOrientationPose } from "@/toolcraft/runtime/react";

import { readDeviceId } from "./product-domain";
import { buildMotionPreset, readMotionPresetId, type MotionPresetId } from "./motion-presets";
import type { MotionSubject } from "./motion-techniques";

/**
 * Turning a chosen move into the keyframes that are it.
 *
 * Two decisions are worth reading before the code.
 *
 * **It happens on a press, not on the choice.** Every other preset in this app
 * — the studio, the artwork templates — applies the moment it is picked,
 * because picking one writes values that the next pick simply overwrites.
 * Motion is not like that: applying one clears the keyframes on the tracks it
 * owns, so browsing the list to see what "Sway" does would quietly destroy an
 * animation somebody had built. A press costs one click and removes the whole
 * class of accident, and it also means the picker never claims to describe what
 * is on the timeline — it says what would be laid down, which stays true after
 * the user drags a keyframe.
 *
 * **It is one command.** `timeline.setControlKeyframes` replaces whole tracks
 * in a single patch, so a preset that writes four tracks and eighteen
 * keyframes is one entry in the history and one press of undo puts the
 * timeline back exactly as it was — including any keyframes the user had put
 * there by hand.
 */

const targets = {
  keyDirection: "light.keyDirection",
  orbit: "camera.orbit",
  positionX: "device.positionX",
  positionY: "device.positionY",
  roll: "device.roll",
  spin: "device.spin",
  tilt: "device.tilt",
  zoom: "camera.zoom",
} as const;

const asNumber = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const asPad = (value: unknown): { x: number; y: number } =>
  typeof value === "object" && value !== null && "x" in value && "y" in value
    ? {
        x: asNumber((value as { x: unknown }).x, 0),
        y: asNumber((value as { y: unknown }).y, 0),
      }
    : { x: 0, y: 0 };

/**
 * Where everything stands at the top of the loop.
 *
 * Evaluated rather than read raw, and at zero rather than at the playhead. A
 * control that is already keyed has a value in `state.values` that nothing has
 * read since the first keyframe went down, so building a move around it would
 * animate from a pose nobody can see. Zero rather than the playhead because a
 * preset describes the whole loop, and the frame it should be anchored to is
 * the one the loop begins on — otherwise scrubbing to the middle and pressing
 * apply would silently produce a different animation.
 */
export function readMotionSubject(state: ToolcraftState): MotionSubject {
  const at = (target: string): unknown => evaluateToolcraftTimelineValue(state, target, 0);

  return {
    keyDirection: asPad(at(targets.keyDirection)),
    orbit: readToolcraftOrientationPose(at(targets.orbit)),
    positionX: asNumber(at(targets.positionX), 0),
    positionY: asNumber(at(targets.positionY), 0),
    roll: asNumber(at(targets.roll), 0),
    spin: asNumber(at(targets.spin), 0),
    tilt: asNumber(at(targets.tilt), 0),
    zoom: asNumber(at(targets.zoom), 100),
  };
}

/** How a keyframe's value reads on the diamond it is under. */
function describeValue(target: string, value: unknown): string {
  if (typeof value === "number") {
    return `${Math.round(value * 10) / 10}`;
  }

  if (target === targets.orbit) {
    const pose = value as { position: readonly number[] };
    const [x = 0, y = 0, z = 0] = pose.position;
    const degrees = (radians: number) => Math.round((radians * 180) / Math.PI);

    return `${degrees(Math.atan2(x, z))}°, ${degrees(Math.asin(y / (Math.hypot(x, y, z) || 1)))}°`;
  }

  const pad = value as { x: number; y: number };

  return `${Math.round(pad.x * 100) / 100}, ${Math.round(pad.y * 100) / 100}`;
}

/**
 * The tracks this preset would clear if it were applied.
 *
 * Choosing None means "take the animation off", and the only sensible reading
 * of that is the tracks a preset owns rather than every track on the timeline:
 * a person who keyed the background colour by hand did not ask for it to be
 * removed because they turned the motion off.
 */
function getMotionTargets(): readonly string[] {
  return Object.values(targets);
}

/**
 * The one command that lays a preset down, or null when there is nothing to do.
 *
 * `none` clears every track a preset could own and leaves everything else
 * alone. Anything else replaces the tracks it writes and, again, leaves the
 * rest — so a light sweep applied over a turntable adds to it rather than
 * replacing it, which is how these are meant to be combined.
 */
export function getMotionPresetCommand(
  state: ToolcraftState,
  preset: MotionPresetId,
): ToolcraftCommand | null {
  const device = readDeviceId((state.values as Record<string, unknown>)["device.model"]);
  const chosen = readMotionPresetId(preset);

  if (chosen === "none") {
    const keyed = new Set(state.timeline.keyframeGroups.map((group) => group.controlId));
    const clearing = getMotionTargets().filter((target) => keyed.has(target));

    return clearing.length === 0
      ? null
      : {
          tracks: clearing.map((target) => ({
            controlId: target,
            controlLabel:
              state.timeline.keyframeGroups.find((group) => group.controlId === target)?.label ??
              target,
            keyframes: [],
          })),
          type: "timeline.setControlKeyframes",
        };
  }

  const built = buildMotionPreset(chosen, device, readMotionSubject(state));

  if (built.length === 0) {
    return null;
  }

  const durationSeconds = state.timeline.durationSeconds;

  return {
    tracks: built.map((item) => ({
      controlId: item.target,
      controlLabel: item.controlLabel,
      keyframes: item.keyframes.map((keyframe) => ({
        easing: keyframe.easing,
        // Fractions become seconds here and nowhere else, which is what lets a
        // preset be right at any loop length.
        timeSeconds: keyframe.at * durationSeconds,
        value: keyframe.value,
        valueLabel: describeValue(item.target, keyframe.value),
      })),
    })),
    type: "timeline.setControlKeyframes",
  };
}
