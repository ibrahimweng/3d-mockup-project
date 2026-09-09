import { expect, test } from "vitest";

import { DEVICE_OPTIONS, type DeviceId } from "./product-domain";
import {
  MOTION_PRESET_OPTIONS,
  PRODUCT_MOTION,
  buildMotionPreset,
  getMotionHeroReason,
  getMotionHeroTechniques,
  readMotionPresetId,
} from "./motion-presets";
import {
  MOTION_TECHNIQUES,
  type MotionSubject,
  type MotionTechniqueId,
} from "./motion-techniques";

/**
 * The moves this studio offers, held to the rules that make them usable.
 *
 * Three of these are not style opinions and would each produce a visible fault:
 * a loop that does not close hitches once a cycle, a preset that ignores where
 * the product is standing throws away the setup it was asked to animate, and a
 * pendulum eased at its crossings stops dead at the bottom of every swing.
 */
const subject: MotionSubject = {
  keyDirection: { x: 0.44, y: -0.52 },
  orbit: { position: [-0.36, 0.14, 1], up: [0, 1, 0] },
  positionX: 12,
  positionY: -7,
  roll: 5,
  spin: 40,
  tilt: -3,
  zoom: 115,
};

const devices = DEVICE_OPTIONS.map((option) => option.value);
const techniques = Object.keys(MOTION_TECHNIQUES) as MotionTechniqueId[];
const presets = MOTION_PRESET_OPTIONS.map((option) => option.value).filter(
  (preset) => preset !== "none",
);

const number = (value: unknown): number => value as number;
const isPose = (value: unknown): value is { position: number[] } =>
  typeof value === "object" && value !== null && "position" in value;

/** How far a keyframe's value is from where the loop started, on any track. */
function drift(target: string, first: unknown, last: unknown): number {
  if (target === "device.spin") {
    // A revolution on is the same place, which is the one way a track is
    // allowed to end somewhere other than where it began.
    return Math.abs(((number(last) - number(first)) % 360) + 360) % 360;
  }

  if (isPose(first) && isPose(last)) {
    return Math.hypot(
      ...[0, 1, 2].map((axis) => last.position[axis]! - first.position[axis]!),
    );
  }

  if (typeof first === "object" && first !== null && "x" in first) {
    const from = first as { x: number; y: number };
    const to = last as { x: number; y: number };
    return Math.hypot(to.x - from.x, to.y - from.y);
  }

  return Math.abs(number(last) - number(first));
}

test("every move closes its loop", () => {
  // The export is a seamless forward-only loop. A track whose last keyframe is
  // not its first hitches once a cycle, and the hitch is the first thing
  // anybody notices about an animation that is otherwise fine.
  for (const device of devices) {
    for (const preset of presets) {
      for (const item of buildMotionPreset(preset, device, subject)) {
        const first = item.keyframes[0]!;
        const last = item.keyframes[item.keyframes.length - 1]!;

        expect(first.at, `${device}/${preset}/${item.target} starts at zero`).toBe(0);
        expect(last.at, `${device}/${preset}/${item.target} ends at the loop's end`).toBe(1);
        expect(
          drift(item.target, first.value, last.value),
          `${device}/${preset}/${item.target} must end where it started`,
        ).toBeCloseTo(0, 6);
      }
    }
  }
});

test("keyframes are in order and inside the loop", () => {
  for (const device of devices) {
    for (const preset of presets) {
      for (const item of buildMotionPreset(preset, device, subject)) {
        const times = item.keyframes.map((keyframe) => keyframe.at);

        expect(times, `${device}/${preset}/${item.target}`).toEqual(
          [...times].sort((first, second) => first - second),
        );
        expect(new Set(times).size, `${device}/${preset}/${item.target} has no duplicates`).toBe(
          times.length,
        );
        expect(times.every((at) => at >= 0 && at <= 1)).toBe(true);
      }
    }
  }
});

test("a move is built around where the product already is", () => {
  // The alternative — every preset snapping to its own idea of a starting
  // pose — throws away the framing, the angle and the height somebody set up
  // before they asked for an animation.
  const moved: MotionSubject = {
    ...subject,
    positionX: -40,
    positionY: 60,
    roll: -22,
    spin: 200,
    tilt: 15,
    zoom: 70,
  };

  for (const technique of techniques) {
    const here = MOTION_TECHNIQUES[technique](subject, PRODUCT_MOTION.tshirt.tuning);
    const there = MOTION_TECHNIQUES[technique](moved, PRODUCT_MOTION.tshirt.tuning);

    for (const [index, item] of here.entries()) {
      const other = there[index]!;
      const startsHere = item.keyframes[0]!.value;
      const startsThere = other.keyframes[0]!.value;

      // The camera and the light are not moved by these subject fields, so
      // only the tracks that read them are expected to differ.
      if (item.target.startsWith("device.")) {
        expect(
          startsHere,
          `${technique} on ${item.target} must start from the product's own value`,
        ).not.toEqual(startsThere);
      }
    }
  }

  // And specifically: a float bobs about the height it found, not about zero.
  const bob = MOTION_TECHNIQUES.float(moved, PRODUCT_MOTION.tshirt.tuning).find(
    (item) => item.target === "device.positionY",
  );
  expect(number(bob?.keyframes[0]?.value)).toBe(60);
  expect(number(bob?.keyframes[1]?.value)).toBeGreaterThan(60);
});

test("a pendulum carries through the bottom of its swing", () => {
  // The single most common way a hand-built sway comes out wrong. Eased at the
  // crossings, the object stops dead in the middle of every swing; the extremes
  // are the only places it should rest.
  const roll = MOTION_TECHNIQUES.sway(subject, PRODUCT_MOTION["id-card"].tuning).find(
    (item) => item.target === "device.roll",
  );

  expect(roll?.keyframes.map((keyframe) => keyframe.easing.type)).toEqual([
    "continuous",
    "bezier",
    "continuous",
    "bezier",
    "bezier",
  ]);
  // Furthest at the quarters, back through the middle, and symmetric about
  // where it started.
  const values = roll!.keyframes.map((keyframe) => number(keyframe.value));
  expect(values[1]! - subject.roll).toBeCloseTo(subject.roll - values[3]!, 9);
  expect(values[0]).toBe(subject.roll);
  expect(values[2]).toBe(subject.roll);
});

test("a turntable turns at one speed", () => {
  // Eased at both ends it accelerates away, stops at the top of the revolution
  // and jerks into the next one, which is the opposite of what a turntable is.
  const spin = MOTION_TECHNIQUES.turntable(subject, PRODUCT_MOTION["mac-studio"].tuning)[0]!;

  expect(spin.keyframes.map((keyframe) => keyframe.easing)).toEqual([
    { controlPoints: [0, 0, 1, 1], type: "bezier" },
    { controlPoints: [0, 0, 1, 1], type: "bezier" },
  ]);
  expect(number(spin.keyframes[1]!.value) - number(spin.keyframes[0]!.value)).toBe(360);
  // And it comes to rest facing where the product was, rather than a turn on.
  expect(number(spin.keyframes[1]!.value)).toBe(subject.spin);
});

test("a flip holds on each face rather than sliding past it", () => {
  // Without the holds this is a slow turntable, and the back of the product —
  // the thing the flip exists to show — goes by too fast to read.
  const spin = MOTION_TECHNIQUES.flip(subject, PRODUCT_MOTION.tshirt.tuning)[0]!;
  const values = spin.keyframes.map((keyframe) => number(keyframe.value));
  // A revolution early, so the whole turn fits on a dial that stops at 360 and
  // still ends facing exactly where the product started.
  const from = subject.spin - 360;

  expect(values).toEqual([from, from, from + 180, from + 180, from + 360]);
  expect(values[4]).toBe(subject.spin);

  const holds = [
    spin.keyframes[1]!.at - spin.keyframes[0]!.at,
    spin.keyframes[3]!.at - spin.keyframes[2]!.at,
  ];
  for (const hold of holds) {
    expect(hold, "each face is held for the same share of the loop").toBeCloseTo(
      PRODUCT_MOTION.tshirt.tuning.flipHold,
      9,
    );
  }
});

test("the camera arc keeps its distance from the product", () => {
  // The claim the spherical evaluator makes, at the point the poses are
  // chosen: an arc swings the camera around the subject rather than pushing it
  // nearer at one end than the other.
  const poses = MOTION_TECHNIQUES.arc(subject, PRODUCT_MOTION.macbook.tuning)[0]!.keyframes.map(
    (keyframe) => keyframe.value as { position: number[] },
  );
  const radius = Math.hypot(...subject.orbit.position);

  for (const pose of poses) {
    expect(Math.hypot(...pose.position)).toBeCloseTo(radius, 9);
  }
  // And it really does sweep, measured as the yaw it travels rather than as the
  // angle it subtends. Those are not the same number: the camera walks a circle
  // on the ground, and a circle of constant elevation is smaller than a great
  // one, so an elevated camera sweeping 30 degrees of yaw covers slightly less
  // than 30 degrees as seen from the product. The yaw is what the tuning names
  // and what somebody carrying a camera around a table would step out.
  const yaw = (position: number[]) => (Math.atan2(position[0]!, position[2]!) * 180) / Math.PI;
  const swept = yaw(poses[0]!.position) - yaw(poses[1]!.position);

  expect(Math.abs(swept)).toBeCloseTo(PRODUCT_MOTION.macbook.tuning.arcDegrees, 9);
  // Level: an arc that drifted up or down would be a crane move, not an arc.
  for (const pose of poses) {
    expect(pose.position[1]).toBeCloseTo(subject.orbit.position[1]!, 9);
  }
  // Centred on where the camera was framed, so the arc swings either side of
  // the shot the user set up rather than starting from it.
  expect((yaw(poses[0]!.position) + yaw(poses[1]!.position)) / 2).toBeCloseTo(
    yaw([...subject.orbit.position]),
    9,
  );
});

test("values stay inside the controls they are written to", () => {
  // A preset built around a product already at the end of a slider's travel
  // must not key past it: the reducer normalizes on the way in, so a keyframe
  // out of range would silently become a different animation than the one
  // described here.
  const extreme: MotionSubject = {
    keyDirection: { x: 1, y: -1 },
    orbit: subject.orbit,
    positionX: 200,
    positionY: 200,
    roll: 180,
    spin: 360,
    tilt: 90,
    zoom: 260,
  };
  const ranges: Record<string, readonly [number, number]> = {
    "camera.zoom": [40, 260],
    "device.positionX": [-200, 200],
    "device.positionY": [-200, 200],
    "device.roll": [-180, 180],
    // Spin is the one that caught this. A turn adds a whole revolution, so a
    // product already facing anywhere but zero ended past the top of the dial
    // and the reducer dropped the keyframe: the animation simply had no end.
    "device.spin": [-360, 360],
    "device.tilt": [-90, 90],
  };

  for (const device of devices) {
    for (const preset of presets) {
      for (const item of buildMotionPreset(preset, device, extreme)) {
        const range = ranges[item.target];
        if (!range) continue;

        for (const keyframe of item.keyframes) {
          expect(
            number(keyframe.value),
            `${device}/${preset}/${item.target} at ${keyframe.at}`,
          ).toBeGreaterThanOrEqual(range[0]);
          expect(number(keyframe.value)).toBeLessThanOrEqual(range[1]);
        }
      }
    }
    // The light pad is square and clamped the same way.
    for (const item of buildMotionPreset("light-sweep", device, extreme)) {
      for (const keyframe of item.keyframes) {
        const pad = keyframe.value as { x: number; y: number };
        expect(Math.abs(pad.x)).toBeLessThanOrEqual(1);
        expect(Math.abs(pad.y)).toBeLessThanOrEqual(1);
      }
    }
  }
});

test("every product has a hero, and its moves do not fight each other", () => {
  // A hero is several techniques at once, and two techniques writing the same
  // control would mean the second silently replaced the first — a turntable and
  // a flip both own Spin, so a hero can have one or the other.
  const reasons = new Set<string>();

  for (const device of devices) {
    const heroTechniques = getMotionHeroTechniques(device);
    expect(heroTechniques.length, `${device} names its hero's moves`).toBeGreaterThan(0);

    const targets = buildMotionPreset("hero", device, subject).map((item) => item.target);
    expect(new Set(targets).size, `${device}'s hero writes each control once`).toBe(
      targets.length,
    );

    const reason = getMotionHeroReason(device);
    expect(reason.length, `${device} says why its hero is that move`).toBeGreaterThan(80);
    reasons.add(reason);
  }

  // Ten products, ten different arguments. A shared reason would mean one of
  // them had not actually been thought about.
  expect(reasons.size).toBe(devices.length);
});

test("the products that should not spin do not, and the ones that must do", () => {
  // The judgement the tuning table exists to record. Nobody turns an iMac
  // around to look at its back, and nobody reads a wrap-printed bottle without
  // turning it the whole way.
  const heroOf = (device: DeviceId) => getMotionHeroTechniques(device);

  expect(heroOf("imac")).not.toContain("turntable");
  expect(heroOf("imac")).not.toContain("flip");
  expect(heroOf("macbook")).not.toContain("turntable");
  expect(heroOf("water-bottle")).toContain("turntable");
  expect(heroOf("mac-studio")).toContain("turntable");
  // A wrap has no front, so holding on two arbitrary points of it is wrong.
  expect(heroOf("water-bottle")).not.toContain("flip");
  // Both faces printed: these are the flips.
  for (const printed of ["tshirt", "tote-bag", "id-card"] as const) {
    expect(heroOf(printed), printed).toContain("flip");
  }
});

test("a hanging product swings further than one standing on a surface", () => {
  // The mass judgement, checked rather than asserted in prose. A card on a cord
  // is grams; an iMac is furniture.
  const swayOf = (device: DeviceId) => PRODUCT_MOTION[device].tuning.swayDegrees;

  expect(swayOf("id-card")).toBeGreaterThan(swayOf("tote-bag"));
  expect(swayOf("tote-bag")).toBeGreaterThan(swayOf("macbook"));
  expect(swayOf("imac")).toBeLessThan(swayOf("iphone-17-pro-max"));

  const riseOf = (device: DeviceId) => PRODUCT_MOTION[device].tuning.floatRise;
  expect(riseOf("imac")).toBeLessThan(riseOf("tote-bag"));
});

test("an unknown preset is the one that does nothing", () => {
  // The select is the only way in, but a stored workspace can carry anything.
  expect(readMotionPresetId("hero")).toBe("hero");
  expect(readMotionPresetId("light-sweep")).toBe("light-sweep");
  for (const bad of [null, undefined, "spin-it", 4, {}]) {
    expect(readMotionPresetId(bad)).toBe("none");
  }
  expect(buildMotionPreset("none", "tshirt", subject)).toEqual([]);
});

test("every option in the picker builds something", () => {
  // A named preset that laid down nothing would read as a broken button.
  for (const device of devices) {
    for (const preset of presets) {
      const built = buildMotionPreset(preset, device, subject);
      expect(built.length, `${device}/${preset}`).toBeGreaterThan(0);
      for (const item of built) {
        expect(item.keyframes.length, `${device}/${preset}/${item.target}`).toBeGreaterThan(1);
      }
    }
  }
});
