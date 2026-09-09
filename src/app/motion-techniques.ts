import type { ToolcraftTimelineKeyframeEasing } from "@/toolcraft/runtime";
import type { ToolcraftOrientationPose } from "@/toolcraft/runtime/react";

import { turnByDegrees } from "./view-orbit";

/**
 * The moves this studio knows how to make, as keyframes.
 *
 * A timeline with nothing on it is the hardest screen in this app: the diamonds
 * are there, the playhead is there, and there is no way to find out what a good
 * animation of a phone looks like except to guess at angles one keyframe at a
 * time. These are the answers, written down — the handful of moves product
 * animation is actually made of, each one laid out as the keyframes a person
 * would have had to place by hand.
 *
 * Three rules hold for every one of them, and they are what make these useful
 * rather than decorative:
 *
 * **They loop.** The export is a seamless forward-only loop, so every track
 * ends where it started — either literally, or a full revolution on from it,
 * which is the same place. A move that ended anywhere else would hitch once a
 * cycle, and the hitch is the first thing anyone notices.
 *
 * **They are written as fractions of the loop, not seconds.** The user owns the
 * duration. A preset that keyed at four seconds would be wrong the moment
 * somebody made the loop three seconds long; one that keys at 0.67 is right at
 * any length.
 *
 * **They move around wherever the product already is.** A float bobs about the
 * height it is standing at, an arc sweeps either side of the angle you framed,
 * a breath pushes in from the zoom you set. A preset that snapped everything
 * to its own idea of a starting pose would throw away the setup it is supposed
 * to be animating.
 */

/** A keyframe, at a fraction of the loop rather than at a second. */
export type MotionKeyframe = {
  /** Where in the loop this sits, 0 to 1. */
  at: number;
  /** How the motion *leaves* here. */
  easing: ToolcraftTimelineKeyframeEasing;
  value: unknown;
};

export type MotionTrack = {
  controlLabel: string;
  keyframes: readonly MotionKeyframe[];
  target: string;
};

/**
 * Constant speed. What a turntable is, and the reason a track has to be able to
 * say so: the editor's default rests at both ends, which is right for a move
 * that starts and stops and wrong for one that never does.
 */
const linear: ToolcraftTimelineKeyframeEasing = {
  controlPoints: [0, 0, 1, 1],
  type: "bezier",
};

/**
 * The gentle one, for a value at the top or bottom of its travel.
 *
 * Close to a sine: it slows into the turning point and away from it, which is
 * what a thing that is about to come back does. Softer than the editor's
 * default so a bob reads as drifting rather than as being placed.
 */
const settle: ToolcraftTimelineKeyframeEasing = {
  controlPoints: [0.45, 0, 0.55, 1],
  type: "bezier",
};

/**
 * Through, not to.
 *
 * At the middle of a swing the object is at its fastest, and a keyframe there
 * only exists to say which way it is going. Eased, it would stop dead at the
 * bottom of every swing — the single most common way a hand-built pendulum
 * comes out wrong.
 */
const through: ToolcraftTimelineKeyframeEasing = { type: "continuous" };

/**
 * A move somebody performed: away slowly, back slowly, with intent in between.
 * The editor's own default, used where a preset genuinely wants it.
 */
const considered: ToolcraftTimelineKeyframeEasing = {
  controlPoints: [0.65, 0, 0.35, 1],
  type: "bezier",
};

/** Where everything is now, so a move can be built around it rather than over it. */
export type MotionSubject = {
  keyDirection: { x: number; y: number };
  orbit: ToolcraftOrientationPose;
  positionX: number;
  positionY: number;
  roll: number;
  spin: number;
  tilt: number;
  zoom: number;
};

/** How far each move goes for this particular product. */
export type MotionTuning = {
  /** How far the camera swings to each side of where it is framed, in degrees. */
  arcDegrees: number;
  /** How much closer the camera comes at the top of a breath, in zoom percent. */
  breatheZoom: number;
  /** How far the product rises at the top of a float, in percent of its own size. */
  floatRise: number;
  /** How far the key light rakes to each side, in the pad's own -1 to 1. */
  lightSweep: number;
  /** How far a hanging product swings to each side, in degrees. */
  swayDegrees: number;
  /** How long a flip holds on each face, as a fraction of the loop. */
  flipHold: number;
};

const clamp = (value: number, low: number, high: number): number =>
  Math.max(low, Math.min(high, value));

/**
 * A track built from values at fractions, with the easing each one leaves at.
 *
 * The last keyframe's easing is never read — there is no segment after it — so
 * it is written as `linear` throughout rather than pretending to a choice.
 */
function track(
  target: string,
  controlLabel: string,
  keyframes: readonly (readonly [number, unknown, ToolcraftTimelineKeyframeEasing])[],
): MotionTrack {
  return {
    controlLabel,
    keyframes: keyframes.map(([at, value, easing]) => ({ at, easing, value })),
    target,
  };
}

/**
 * Where a full turn has to start so that all of it fits on the dial.
 *
 * Spin runs from -360 to 360 and a turn adds a whole revolution to wherever the
 * product is facing, so starting from any positive angle would end past the top
 * of the range — and the reducer refuses a value a control could not hold, so
 * the last keyframe was simply dropped and the turn never arrived. An angle and
 * that angle less a full revolution point the same way, so the turn starts a
 * revolution early instead and ends exactly where the product is standing now.
 * Nothing about the picture changes; it is the same directions in the same
 * order.
 */
function turnStart(spin: number): number {
  return spin > 0 ? spin - 360 : spin;
}

/**
 * One revolution, at one speed.
 *
 * The move this product exists to make, and the only one here that ends
 * somewhere other than where it started — 360 degrees on, which is the same
 * place. Turning from wherever the product is already facing, so a phone angled
 * to catch the light keeps that angle as it comes round.
 */
export function turntable(subject: MotionSubject, _tuning: MotionTuning): MotionTrack[] {
  const from = turnStart(subject.spin);

  return [
    track("device.spin", "Spin", [
      [0, from, linear],
      [1, from + 360, linear],
    ]),
  ];
}

/**
 * Alive rather than moving.
 *
 * A slow rise and fall, with a tilt running a quarter of a cycle behind it so
 * the two never reach their extremes together. In phase they read as one
 * mechanism; out of phase the product looks like it is hanging in air. This is
 * the cheapest way to stop a render looking like a photograph somebody left
 * playing.
 */
export function float(subject: MotionSubject, tuning: MotionTuning): MotionTrack[] {
  const top = clamp(subject.positionY + tuning.floatRise, -200, 200);
  const lean = tuning.floatRise / 3;

  return [
    track("device.positionY", "Position Y", [
      [0, subject.positionY, settle],
      [0.5, top, settle],
      [1, subject.positionY, linear],
    ]),
    track("device.tilt", "Tilt", [
      [0, subject.tilt, through],
      [0.25, clamp(subject.tilt + lean, -90, 90), settle],
      [0.5, subject.tilt, through],
      [0.75, clamp(subject.tilt - lean, -90, 90), settle],
      [1, subject.tilt, linear],
    ]),
  ];
}

/**
 * Hanging, and not quite still.
 *
 * A pendulum: furthest at the sides, fastest through the middle, which is why
 * the crossings carry through and only the extremes rest. The body shifts with
 * the lean rather than pivoting on its own centre, because a bag on a handle or
 * a card on a cord swings from a point above itself.
 */
export function sway(subject: MotionSubject, tuning: MotionTuning): MotionTrack[] {
  const lean = tuning.swayDegrees;
  // A tenth of the lean, in percent of the product's size. Enough to move the
  // pivot off the object's own middle; more and it reads as sliding.
  const shift = lean / 10;

  return [
    track("device.roll", "Roll", [
      [0, subject.roll, through],
      [0.25, clamp(subject.roll + lean, -180, 180), settle],
      [0.5, subject.roll, through],
      [0.75, clamp(subject.roll - lean, -180, 180), settle],
      [1, subject.roll, linear],
    ]),
    track("device.positionX", "Position X", [
      [0, subject.positionX, through],
      [0.25, clamp(subject.positionX + shift, -200, 200), settle],
      [0.5, subject.positionX, through],
      [0.75, clamp(subject.positionX - shift, -200, 200), settle],
      [1, subject.positionX, linear],
    ]),
  ];
}

/**
 * Both sides, each held long enough to read.
 *
 * A turn that pauses is a different thing from a turn that does not: the holds
 * are what let somebody see the print on the back of a shirt or the cameras on
 * the back of a phone, and without them a flip is just a slow turntable. It
 * keeps going the same way round rather than turning back, because the loop
 * only runs forwards — reversing would make the second half play backwards
 * against the first.
 */
export function flip(subject: MotionSubject, tuning: MotionTuning): MotionTrack[] {
  const hold = clamp(tuning.flipHold, 0.05, 0.3);
  // What is left over after two holds, split between the two half-turns.
  const turn = (1 - hold * 2) / 2;
  const from = turnStart(subject.spin);

  return [
    track("device.spin", "Spin", [
      [0, from, considered],
      [hold, from, considered],
      [hold + turn, from + 180, considered],
      [hold * 2 + turn, from + 180, considered],
      [1, from + 360, linear],
    ]),
  ];
}

/**
 * The camera moves and the product does not.
 *
 * The difference between this and a turntable is the whole of it: a turntable
 * spins the object on a plinth, and this walks around it. Shadows stay put, the
 * light stays where it was placed, and the parallax between the front and back
 * of the object is real. It is the shot most product films are made of, and
 * until the camera could be keyframed this app could not make it.
 *
 * Out to one side and back rather than the whole way round, so it reads as a
 * camera being carried rather than as the turntable it would otherwise be.
 */
export function arc(subject: MotionSubject, tuning: MotionTuning): MotionTrack[] {
  const half = tuning.arcDegrees / 2;

  return [
    track("camera.orbit", "Camera", [
      [0, turnByDegrees(subject.orbit, -half, 0), settle],
      [0.5, turnByDegrees(subject.orbit, half, 0), settle],
      [1, turnByDegrees(subject.orbit, -half, 0), linear],
    ]),
  ];
}

/**
 * In a little, and back.
 *
 * Almost nothing, on purpose. A slow push toward the subject and away again
 * reads as attention rather than as movement, and it is what stops a locked-off
 * product shot feeling like a still. Big enough to see and small enough that
 * nobody watching could tell you what it was.
 */
export function breathe(subject: MotionSubject, tuning: MotionTuning): MotionTrack[] {
  return [
    track("camera.zoom", "Zoom", [
      [0, subject.zoom, settle],
      [0.5, clamp(subject.zoom + tuning.breatheZoom, 40, 260), settle],
      [1, subject.zoom, linear],
    ]),
  ];
}

/**
 * The highlight travels instead of the object.
 *
 * Nothing moves at all: the key rakes across and back, and the specular runs
 * over whatever the product is made of. On anodised aluminium or a steel bottle
 * that is the entire shot — it is how a surface is shown to be a surface rather
 * than a colour. Horizontally, and never under the product: a key that swings
 * below the floor lights it from beneath, which reads as a fault rather than a
 * choice.
 */
export function lightSweep(subject: MotionSubject, tuning: MotionTuning): MotionTrack[] {
  const y = subject.keyDirection.y;
  const left = { x: clamp(subject.keyDirection.x - tuning.lightSweep, -1, 1), y };
  const right = { x: clamp(subject.keyDirection.x + tuning.lightSweep, -1, 1), y };

  return [
    track("light.keyDirection", "Direction", [
      [0, left, settle],
      [0.5, right, settle],
      [1, left, linear],
    ]),
  ];
}

export const MOTION_TECHNIQUES = {
  arc,
  breathe,
  flip,
  float,
  "light-sweep": lightSweep,
  sway,
  turntable,
} as const;

export type MotionTechniqueId = keyof typeof MOTION_TECHNIQUES;

export function buildMotionTechnique(
  id: MotionTechniqueId,
  subject: MotionSubject,
  tuning: MotionTuning,
): MotionTrack[] {
  return MOTION_TECHNIQUES[id](subject, tuning);
}
