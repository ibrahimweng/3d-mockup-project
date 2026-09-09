import { expect, test } from "vitest";

import {
  defaultMotionBlurFramesPerSecond,
  defaultMotionBlurShutterAngleDegrees,
  getMotionBlurSampleAlpha,
  readMotionBlurSettings,
  getMotionBlurSampleTimes,
  getMotionBlurShutterSeconds,
  hasMotionAcrossShutter,
  getMotionBlurFrameSeconds,
  motionBlurSampleCount,
  wrapMotionBlurTime,
} from "./render/motion-blur";

/**
 * The arithmetic behind a frame that covers the time it stands for.
 *
 * Every exported frame is currently a single sharp instant, which is why a
 * turntable reads as a stack of stills played quickly. These are the rules for
 * spreading one frame across its shutter: where the samples sit, what happens
 * at the seam of a loop, and when it is not worth taking more than one.
 */

test("a shutter angle is a fraction of the frame it opens for", () => {
  // The film convention, and the reason the control is in degrees at all:
  // 360 is a shutter open for the whole frame, 180 for half of it. Measured at
  // thirty frames a second; the same fractions at sixty are the test below.
  expect(getMotionBlurShutterSeconds(360)).toBeCloseTo(getMotionBlurFrameSeconds(30), 12);
  expect(getMotionBlurShutterSeconds(defaultMotionBlurShutterAngleDegrees)).toBeCloseTo(
    getMotionBlurFrameSeconds(30) / 2,
    12,
  );
  expect(getMotionBlurShutterSeconds(90)).toBeCloseTo(getMotionBlurFrameSeconds(30) / 4, 12);

  // Closed, or nonsense, means no shutter to spread anything across.
  for (const angle of [0, -10, Number.NaN, Number.POSITIVE_INFINITY]) {
    expect(getMotionBlurShutterSeconds(angle), String(angle)).toBe(0);
  }

  // Past a full frame is still a full frame; a shutter cannot be open longer
  // than the frame it belongs to.
  expect(getMotionBlurShutterSeconds(720)).toBeCloseTo(getMotionBlurFrameSeconds(30), 12);
});

test("samples are centred on the frame's own time", () => {
  // A blurred frame has to average to where the sharp one would have been.
  // Sampling from the frame's time forward would drag every frame late by half
  // a shutter, which across a loop is a visible lag against the audio-free but
  // still rhythmic seam.
  const times = getMotionBlurSampleTimes({
    durationSeconds: 6,
    shutterAngleDegrees: 360,
    timeSeconds: 3,
  });

  expect(times).toHaveLength(motionBlurSampleCount);
  const mean = times.reduce((total, time) => total + time, 0) / times.length;
  expect(mean).toBeCloseTo(3, 12);

  // Inside one shutter of the frame, and in order.
  const shutter = getMotionBlurShutterSeconds(360);
  for (const time of times) {
    expect(Math.abs(time - 3)).toBeLessThanOrEqual(shutter / 2);
  }
  expect([...times].sort((first, second) => first - second)).toEqual([...times]);
});

test("a shutter at the seam wraps round the loop instead of stopping at it", () => {
  // The loop is seamless and forward-only, so the instant after the last frame
  // is the first one. A frame blurred against a clamped edge shows a smear that
  // stops dead while the rest of the loop keeps moving.
  const times = getMotionBlurSampleTimes({
    durationSeconds: 6,
    shutterAngleDegrees: 360,
    timeSeconds: 0,
  });

  expect(times).toHaveLength(motionBlurSampleCount);
  // Half the samples fall before zero and come back near the end of the loop.
  expect(times.some((time) => time > 5.9)).toBe(true);
  expect(times.some((time) => time < 0.1)).toBe(true);
  expect(times.every((time) => time >= 0 && time < 6)).toBe(true);
});

test("wrapping carries a time round rather than clamping it", () => {
  expect(wrapMotionBlurTime(-0.01, 6)).toBeCloseTo(5.99, 12);
  expect(wrapMotionBlurTime(6.01, 6)).toBeCloseTo(0.01, 12);
  expect(wrapMotionBlurTime(3, 6)).toBe(3);
  expect(wrapMotionBlurTime(0, 6)).toBe(0);
  // A duration that cannot be wrapped against is left alone rather than
  // producing a NaN that would put a sample nowhere.
  expect(wrapMotionBlurTime(3, 0)).toBe(3);
});

test("a closed shutter draws the frame once, sharp", () => {
  // Which is what the switch being off has to mean: not a blur of width zero
  // costing eight renders, but one render.
  for (const shutterAngleDegrees of [0, -5]) {
    expect(
      getMotionBlurSampleTimes({ durationSeconds: 6, shutterAngleDegrees, timeSeconds: 2 }),
    ).toEqual([2]);
  }

  // And a timeline with no length to spread across is the same.
  expect(
    getMotionBlurSampleTimes({ durationSeconds: 0, shutterAngleDegrees: 180, timeSeconds: 2 }),
  ).toEqual([2]);
});

test("nothing moving means nothing to blur", () => {
  // The short circuit that keeps a still export, and a held track, free.
  // Eight identical renders averaged back into themselves are eight times the
  // work for the same pixels.
  const still = [{ "device.spin": 30 }, { "device.spin": 30 }];
  expect(hasMotionAcrossShutter(still, ["device.spin"])).toBe(false);

  const turning = [{ "device.spin": 30 }, { "device.spin": 31.5 }];
  expect(hasMotionAcrossShutter(turning, ["device.spin"])).toBe(true);

  // A target that moves but is not keyed cannot differ between samples within
  // one frame, so an empty keyed list is decisive rather than merely unknown.
  expect(hasMotionAcrossShutter(turning, [])).toBe(false);
  // And a single sample has nothing to compare against.
  expect(hasMotionAcrossShutter([{ "device.spin": 30 }], ["device.spin"])).toBe(false);
});

test("the export controls are validated, not trusted", () => {
  // These two are the only place a stored file can reach the shutter, so a
  // number that no slider could have produced has to be refused here.
  expect(readMotionBlurSettings({})).toEqual({
    enabled: false,
    framesPerSecond: defaultMotionBlurFramesPerSecond,
    shutterAngleDegrees: defaultMotionBlurShutterAngleDegrees,
  });
  expect(
    readMotionBlurSettings({
      "export.video.motionBlur": true,
      "export.video.shutterAngle": "90",
    }),
  ).toEqual({
    enabled: true,
    framesPerSecond: defaultMotionBlurFramesPerSecond,
    shutterAngleDegrees: 90,
  });

  // A number is taken too: a workspace written before the control was a select
  // carries one, and there is nothing to gain by refusing a value already right.
  expect(
    readMotionBlurSettings({
      "export.video.motionBlur": true,
      "export.video.shutterAngle": 270,
    }).shutterAngleDegrees,
  ).toBe(270);

  // Anything unusable falls back to the convention rather than to zero, which
  // would leave the switch reading on while nothing blurred.
  for (const bad of [null, "wide open", -1, Number.NaN, Number.POSITIVE_INFINITY, {}]) {
    expect(
      readMotionBlurSettings({
        "export.video.motionBlur": true,
        "export.video.shutterAngle": bad,
      }).shutterAngleDegrees,
      JSON.stringify(bad) ?? "undefined",
    ).toBe(defaultMotionBlurShutterAngleDegrees);
  }

  // And a shutter past a full frame is a full frame.
  expect(
    readMotionBlurSettings({
      "export.video.motionBlur": true,
      "export.video.shutterAngle": "720",
    }).shutterAngleDegrees,
  ).toBe(360);

  // The switch is strict about true: a truthy string is not a switch position.
  expect(readMotionBlurSettings({ "export.video.motionBlur": "yes" }).enabled).toBe(false);
});

test("the sample opacities average the shutter rather than trailing it", () => {
  // The subtlest thing here, and the one a screenshot would not catch. Canvas
  // compositing is source-over: drawing sample n at opacity a leaves the canvas
  // holding a*sample + (1-a)*whatever was there. Simulating that is the only
  // way to check every sample really ends up weighing the same.
  for (const sampleCount of [2, 4, 8]) {
    const weights = new Array<number>(sampleCount).fill(0);

    for (let index = 0; index < sampleCount; index += 1) {
      const alpha = getMotionBlurSampleAlpha(index);

      for (let earlier = 0; earlier < index; earlier += 1) {
        weights[earlier] *= 1 - alpha;
      }

      weights[index] = alpha;
    }

    for (const [index, weight] of weights.entries()) {
      expect(weight, `sample ${index} of ${sampleCount}`).toBeCloseTo(1 / sampleCount, 12);
    }
    // And the frame is fully covered: nothing of the destination shows through.
    expect(weights.reduce((total, weight) => total + weight, 0)).toBeCloseTo(1, 12);
  }

  // A constant fraction, which is the obvious thing to write, does not do this:
  // over eight samples the last ends up weighing about two and a half times the
  // first, and the eight together cover only two thirds of the frame, so the
  // destination shows through what should be an opaque picture.
  const naive = new Array<number>(8).fill(0);
  for (let index = 0; index < 8; index += 1) {
    for (let earlier = 0; earlier < index; earlier += 1) naive[earlier] *= 1 - 1 / 8;
    naive[index] = 1 / 8;
  }
  expect(naive[7] / naive[0]).toBeCloseTo(1 / 0.875 ** 7, 6);
  expect(naive[7]).toBeGreaterThan(naive[0] * 2.5);
  expect(naive.reduce((total, weight) => total + weight, 0)).toBeLessThan(0.7);

  // The first sample is opaque, so it covers rather than blending with an
  // uninitialised destination.
  expect(getMotionBlurSampleAlpha(0)).toBe(1);
});

test("the shutter follows the frame rate, because a shutter is part of a frame", () => {
  // The coupling this whole change exists to make honest. A frame at sixty is
  // half as long as a frame at thirty, so the same shutter angle is half the
  // time — which is a real part of why sixty looks crisper and not only
  // smoother. Left uncoupled, every sixty-frame export would have been smeared
  // across twice the time it stands for and read as a soft render.
  expect(getMotionBlurFrameSeconds(60)).toBeCloseTo(1 / 60, 12);
  expect(getMotionBlurShutterSeconds(180, 60)).toBeCloseTo(1 / 120, 12);
  expect(getMotionBlurShutterSeconds(360, 60)).toBeCloseTo(1 / 60, 12);
  expect(getMotionBlurShutterSeconds(180, 60)).toBeCloseTo(
    getMotionBlurShutterSeconds(180, 30) / 2,
    12,
  );

  // And the samples land inside that shorter shutter rather than the old one.
  const times = getMotionBlurSampleTimes({
    durationSeconds: 6,
    framesPerSecond: 60,
    shutterAngleDegrees: 360,
    timeSeconds: 3,
  });
  for (const time of times) {
    expect(Math.abs(time - 3)).toBeLessThanOrEqual(1 / 120 + 1e-12);
  }

  // A rate that could not have come from the control falls back rather than
  // dividing by it.
  for (const bad of [0, -30, Number.NaN, Number.POSITIVE_INFINITY]) {
    expect(getMotionBlurFrameSeconds(bad), String(bad)).toBeCloseTo(
      1 / defaultMotionBlurFramesPerSecond,
      12,
    );
  }
});

test("the frame rate is read from the same control the runtime resolves it from", () => {
  // Two numbers that have to agree, so they come from one place. The select
  // hands back a string; a workspace written before the control existed has
  // nothing and falls back to what the runtime always encoded at.
  expect(
    readMotionBlurSettings({ "export.video.frameRate": "60" }).framesPerSecond,
  ).toBe(60);
  expect(readMotionBlurSettings({ "export.video.frameRate": 60 }).framesPerSecond).toBe(60);
  expect(readMotionBlurSettings({ "export.video.frameRate": "30" }).framesPerSecond).toBe(30);

  for (const bad of [null, "fast", 24, 120, {}]) {
    expect(
      readMotionBlurSettings({ "export.video.frameRate": bad }).framesPerSecond,
      JSON.stringify(bad) ?? "undefined",
    ).toBe(defaultMotionBlurFramesPerSecond);
  }
});
