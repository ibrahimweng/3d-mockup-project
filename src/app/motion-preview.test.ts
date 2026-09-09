import { expect, test } from "vitest";

import { DEVICE_OPTIONS } from "./product-domain";
import { MOTION_PRESET_OPTIONS, getMotionHeroTechniques } from "./motion-presets";
import {
  getMotionPreviewTracks,
  getMotionPreviewTransform,
  isSceneChannel,
  type MotionPreviewChannel,
} from "./motion-preview";

/**
 * The little animations on the picker's tiles.
 *
 * The point of them is that they cannot lie: they are derived from the same
 * `buildMotionPreset` the timeline gets, so a tile that advertises a turn is
 * drawn from the turn. These are the tests that keep that true — that the
 * shape and timing come from the preset rather than from a second hand-drawn
 * copy, and that the one distinction only a diagram can make is made.
 */
const devices = DEVICE_OPTIONS.map((option) => option.value);
const presets = MOTION_PRESET_OPTIONS.map((option) => option.value);

test("every named move has something to show, and None has nothing", () => {
  // A tile that did not move would read as a broken button — except for None,
  // where not moving is exactly the answer.
  for (const device of devices) {
    for (const preset of presets) {
      const tracks = getMotionPreviewTracks(preset, device);

      if (preset === "none") {
        expect(tracks, `${device}/none stands still`).toEqual([]);
        continue;
      }

      expect(tracks.length, `${device}/${preset}`).toBeGreaterThan(0);
      for (const track of tracks) {
        expect(track.steps.length, `${device}/${preset}/${track.channel}`).toBeGreaterThan(1);
      }
    }
  }
});

test("the timing is the preset's own, not a second drawing of it", () => {
  // The whole reason these are derived. A flip holds on each face for a share
  // of the loop, and the tile has to hold for the same share — otherwise the
  // two drift the first time anybody retunes one.
  const flip = getMotionPreviewTracks("flip", "tshirt")[0]!;
  const offsets = flip.steps.map((step) => step.at);

  expect(offsets[0]).toBe(0);
  expect(offsets[offsets.length - 1]).toBe(1);
  // Five keyframes: hold, turn, hold, turn — the flip's own shape.
  expect(offsets).toHaveLength(5);
  expect(offsets[1]! - offsets[0]!, "the first hold").toBeCloseTo(
    offsets[3]! - offsets[2]!,
    9,
  );

  // And a turntable is two keyframes at constant speed, which is what linear
  // means on both of them.
  const turntable = getMotionPreviewTracks("turntable", "mac-studio")[0]!;
  expect(turntable.steps).toHaveLength(2);
  expect(turntable.steps.every((step) => step.easing === "cubic-bezier(0, 0, 1, 1)")).toBe(true);
});

test("a pendulum carries through the middle in the tile too", () => {
  // `continuous` has no CSS equivalent — it solves its curve from its
  // neighbours at evaluation time — and linear is the honest approximation:
  // what it means here is "do not rest at this keyframe", which is what a
  // sway's crossings need.
  const roll = getMotionPreviewTracks("sway", "id-card").find(
    (track) => track.channel === "roll",
  )!;

  expect(roll.steps.map((step) => step.easing)).toEqual([
    "linear",
    "cubic-bezier(0.45, 0, 0.55, 1)",
    "linear",
    "cubic-bezier(0.45, 0, 0.55, 1)",
    "cubic-bezier(0, 0, 1, 1)",
  ]);
});

test("a camera move turns the scene and a turntable turns the product", () => {
  // The one thing a diagram says better than a render would at this size. Both
  // are a rotation; what differs is what rotates, and the floor coming with it
  // is the whole visible difference between the two moves.
  const arc = getMotionPreviewTracks("arc", "macbook");
  const turntable = getMotionPreviewTracks("turntable", "macbook");

  expect(arc.every((track) => isSceneChannel(track.channel))).toBe(true);
  expect(turntable.every((track) => !isSceneChannel(track.channel))).toBe(true);
  // A breath is the camera too: it comes closer, the product does not grow.
  expect(getMotionPreviewTracks("breathe", "macbook").every((t) => isSceneChannel(t.channel))).toBe(
    true,
  );
});

test("the per-product tuning is visible in the tiles", () => {
  // If every tile moved the same amount the picker would flatten the one
  // judgement the library exists to record. A card on a cord swings further
  // than a bag, and an iMac barely rises at all.
  const swayOf = (device: (typeof devices)[number]) =>
    Math.max(
      ...getMotionPreviewTracks("sway", device)
        .find((track) => track.channel === "roll")!
        .steps.map((step) => Math.abs(step.value)),
    );

  expect(swayOf("id-card")).toBeGreaterThan(swayOf("tote-bag"));
  expect(swayOf("tote-bag")).toBeGreaterThan(swayOf("macbook"));

  const liftOf = (device: (typeof devices)[number]) =>
    Math.max(
      ...getMotionPreviewTracks("float", device)
        .find((track) => track.channel === "lift")!
        .steps.map((step) => Math.abs(step.value)),
    );

  expect(liftOf("imac")).toBeLessThan(liftOf("tote-bag"));
  // And it is still visible rather than scaled to nothing: the gain exists so
  // the smallest move in the library reads at tile size.
  expect(liftOf("imac")).toBeGreaterThan(4);
});

test("a hero tile shows the moves that hero is made of", () => {
  // Hero is the option whose name says least, so its tile has to say most.
  for (const device of devices) {
    const techniques = getMotionHeroTechniques(device);
    const channels = new Set(
      getMotionPreviewTracks("hero", device).map((track) => track.channel),
    );

    if (techniques.includes("turntable") || techniques.includes("flip")) {
      expect(channels, `${device} turns`).toContain("spin");
    }
    if (techniques.includes("breathe")) {
      expect(channels, `${device} breathes`).toContain("dolly");
    }
    if (techniques.includes("light-sweep")) {
      expect(channels, `${device} is lit across`).toContain("light");
    }
    if (techniques.includes("arc")) {
      expect(channels, `${device} is arced around`).toContain("orbit");
    }
  }
});

test("each channel draws as the transform it means", () => {
  const cases: readonly [MotionPreviewChannel, number, string][] = [
    ["spin", 180, "rotateY(180deg)"],
    ["tilt", 12, "rotateX(12deg)"],
    ["roll", -9, "rotate(-9deg)"],
    // Up is negative in screen coordinates and positive in the product's, so
    // this is the one that would be silently upside down if it were wrong.
    ["lift", 20, "translateY(-20%)"],
    ["shift", 8, "translateX(8%)"],
    ["dolly", 1.16, "scale(1.16)"],
    ["orbit", 24, "rotateY(24deg)"],
  ];

  for (const [channel, value, expected] of cases) {
    expect(getMotionPreviewTransform(channel, value), channel).toBe(expected);
  }

  // The highlight is not a transform on the product; it moves on its own.
  expect(getMotionPreviewTransform("light", 30)).toBe("");
});

test("a float lifts the product up rather than down", () => {
  // Worth its own test because the sign convention differs between the two
  // ends: the product's Y is up, the screen's is down.
  const lift = getMotionPreviewTracks("float", "tote-bag").find(
    (track) => track.channel === "lift",
  )!;
  const peak = lift.steps.reduce((best, step) =>
    Math.abs(step.value) > Math.abs(best.value) ? step : best,
  );

  expect(peak.value, "the product rises at the top of a float").toBeGreaterThan(0);
  expect(getMotionPreviewTransform("lift", peak.value)).toContain("translateY(-");
});
