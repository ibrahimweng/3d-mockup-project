import { buildMotionPreset, type MotionPresetId } from "./motion-presets";
import type { MotionSubject, MotionTrack } from "./motion-techniques";
import type { DeviceId } from "./product-domain";

/**
 * A move, drawn small, so you can see it before you commit to it.
 *
 * Choosing an animation from a list of names is choosing blind. "Sway" and
 * "Float" both mean "it moves a bit", "Hero" means nothing at all until you
 * know which product you are looking at, and the only way to find out was to
 * press the button — which lays down keyframes over whatever was there.
 *
 * These are the little animations on the picker's tiles, and the thing worth
 * knowing about them is where they come from: they are derived from the same
 * `buildMotionPreset` the real thing uses, so a tile cannot drift from the
 * animation it advertises. Retune a sway and its tile sways further. Add a
 * technique and it has a tile without anybody drawing one.
 *
 * Two deliberate departures from the real move, both because a diagram is not
 * a render:
 *
 * **Timing is proportional, not absolute.** Every tile loops in the same short
 * while, whatever the timeline's length is set to, so a row of them reads as a
 * set rather than as a race. The *shape* of the timing is exact: the fractions
 * and the easing come straight from the preset.
 *
 * **Amplitude is amplified.** A four percent rise is three pixels in a tile
 * this size, which is indistinguishable from nothing. Each channel has a gain
 * that makes the smallest move in the library visible, and the gains are per
 * channel rather than per preset so that presets stay comparable with each
 * other — a card that swings twice as far as a bag still looks like it does.
 */

/** What part of the little scene a track drives. */
export type MotionPreviewChannel =
  /** The product turning on the spot. */
  | "spin"
  /** The product leaning towards or away from you. */
  | "tilt"
  /** The product canting sideways. */
  | "roll"
  /** The product rising. */
  | "lift"
  /** The product sliding. */
  | "shift"
  /** The whole scene coming closer: the camera, not the product. */
  | "dolly"
  /** The whole scene turning: the camera walking round, floor and all. */
  | "orbit"
  /** The highlight travelling across a product that is not moving. */
  | "light";

export type MotionPreviewStep = {
  /** Where in the loop this sits, 0 to 1. */
  at: number;
  /** The CSS timing function for the segment that leaves here. */
  easing: string;
  /** Degrees, or percent of the glyph, or a scale — whatever the channel is in. */
  value: number;
};

export type MotionPreviewTrack = {
  channel: MotionPreviewChannel;
  steps: readonly MotionPreviewStep[];
};

/** How long every tile takes, whatever the timeline is set to. */
export const motionPreviewSeconds = 2.6;

/**
 * The neutral product a tile animates, so a tile shows the move rather than
 * the pose the user happens to have set. Zeros everywhere the move is measured
 * from, and the real defaults for the two that are not deltas.
 */
const previewSubject: MotionSubject = {
  keyDirection: { x: 0, y: 0 },
  orbit: { position: [0, 0, 1], up: [0, 1, 0] },
  positionX: 0,
  positionY: 0,
  roll: 0,
  spin: 0,
  tilt: 0,
  zoom: 100,
};

/**
 * What each channel is multiplied by to be visible at tile size.
 *
 * Chosen so the smallest move in the library reads and the largest does not
 * leave the tile. A turn is not scaled at all: a revolution is a revolution.
 */
const channelGain: Record<MotionPreviewChannel, number> = {
  dolly: 1,
  light: 34,
  lift: 4,
  orbit: 1.6,
  roll: 2.2,
  shift: 8,
  spin: 1,
  tilt: 6,
};

const targetChannel: Record<string, MotionPreviewChannel> = {
  "camera.orbit": "orbit",
  "camera.zoom": "dolly",
  "device.positionX": "shift",
  "device.positionY": "lift",
  "device.roll": "roll",
  "device.spin": "spin",
  "device.tilt": "tilt",
  "light.keyDirection": "light",
};

/**
 * The easing, as CSS says it.
 *
 * `continuous` solves its curve from the keyframes on either side at
 * evaluation time, which a CSS animation cannot do; through a turning point at
 * speed is what it is for, and linear is the honest approximation of that in a
 * diagram. A step is a step.
 */
function toCssEasing(easing: { type: string; controlPoints?: readonly number[] }): string {
  if (easing.type === "bezier" && easing.controlPoints) {
    return `cubic-bezier(${easing.controlPoints.join(", ")})`;
  }

  return easing.type === "step" ? "steps(1, end)" : "linear";
}

/** The compass direction a camera pose faces, in degrees. */
function poseYawDegrees(value: unknown): number {
  const position = (value as { position?: readonly number[] })?.position;

  if (!position) {
    return 0;
  }

  return (Math.atan2(position[0] ?? 0, position[2] ?? 1) * 180) / Math.PI;
}

/** The number a track's value contributes to its channel, before the gain. */
function readChannelValue(channel: MotionPreviewChannel, value: unknown, first: unknown): number {
  if (channel === "orbit") {
    // A camera walking round reads as the scene turning the other way, which
    // is the whole visible difference between this and a turntable: the floor
    // comes with it.
    return poseYawDegrees(first) - poseYawDegrees(value);
  }

  if (channel === "light") {
    const pad = value as { x?: number };
    const from = first as { x?: number };

    return (pad?.x ?? 0) - (from?.x ?? 0);
  }

  if (channel === "dolly") {
    // Zoom is a percentage of the default, which is already a scale.
    return (value as number) / 100;
  }

  return value as number;
}

/**
 * One preset, as the tracks a tile animates.
 *
 * Tracks the tile has no channel for are dropped rather than drawn wrong, and
 * a preset whose every track is dropped simply does not move — which is the
 * right answer for None and would be the right answer for a move built out of
 * something this little scene cannot show.
 */
export function getMotionPreviewTracks(
  preset: MotionPresetId,
  device: DeviceId,
): readonly MotionPreviewTrack[] {
  return buildMotionPreset(preset, device, previewSubject).flatMap(
    (track: MotionTrack): MotionPreviewTrack[] => {
      const channel = targetChannel[track.target];

      if (!channel || track.keyframes.length < 2) {
        return [];
      }

      const first = track.keyframes[0]!.value;
      const gain = channelGain[channel];

      return [
        {
          channel,
          steps: track.keyframes.map((keyframe) => ({
            at: keyframe.at,
            easing: toCssEasing(keyframe.easing),
            value:
              channel === "dolly"
                ? // A scale is multiplied about one rather than scaled from zero.
                  1 + (readChannelValue(channel, keyframe.value, first) - 1) * gain
                : readChannelValue(channel, keyframe.value, first) * gain,
          })),
        },
      ];
    },
  );
}

/** Which of the two transform targets a channel belongs to. */
export function isSceneChannel(channel: MotionPreviewChannel): boolean {
  return channel === "dolly" || channel === "orbit";
}

/**
 * The CSS transform for one channel at one value.
 *
 * Kept as a function of a single channel so a tile can compose several of them
 * in a fixed order — a product that is both rising and leaning has to be drawn
 * the same way every frame or it jitters as the string is rebuilt.
 */
export function getMotionPreviewTransform(
  channel: MotionPreviewChannel,
  value: number,
): string {
  switch (channel) {
    case "dolly":
      return `scale(${value})`;
    case "lift":
      return `translateY(${-value}%)`;
    case "orbit":
      return `rotateY(${value}deg)`;
    case "roll":
      return `rotate(${value}deg)`;
    case "shift":
      return `translateX(${value}%)`;
    case "spin":
      return `rotateY(${value}deg)`;
    case "tilt":
      return `rotateX(${value}deg)`;
    default:
      return "";
  }
}
