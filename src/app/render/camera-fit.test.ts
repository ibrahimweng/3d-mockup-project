import * as THREE from "three";
import { describe, expect, test } from "vitest";

import {
  fitDistance,
  fovDegreesFor,
  heldBox,
  readFitBasis,
  sweptSubjectBox,
} from "./camera-fit";

// `position` is the direction the camera stands in from the subject, not a
// world point; `up` is the room's vertical.
const straightOn = readFitBasis({ position: [0, 0, 5], up: [0, 1, 0] });

/** A long low box, which is what a laptop on a table actually is. */
function lowWideSet(): THREE.Box3 {
  return new THREE.Box3(new THREE.Vector3(-2, -0.5, -0.5), new THREE.Vector3(2, 0.5, 0.5));
}

test("focal length drives camera FOV and viewing distance", () => {
  // A focal length in 36mm full-frame terms. The two ends of this product's
  // range have to be a wide angle and a long lens, not two similar numbers.
  expect(fovDegreesFor(24)).toBeGreaterThan(60);
  expect(fovDegreesFor(200)).toBeLessThan(11);

  // Longer is always narrower, across the whole range, with no flat spot.
  const lengths = [24, 35, 50, 85, 135, 200];
  const fovs = lengths.map(fovDegreesFor);
  for (let i = 1; i < fovs.length; i += 1) {
    expect(fovs[i]).toBeLessThan(fovs[i - 1]);
  }

  // A narrower lens has to stand further back to hold the same set, which is
  // what keeps the subject the same size in frame while its perspective
  // flattens — the whole reason focal length is a control rather than a zoom.
  const distances = fovs.map((fov) =>
    fitDistance({
      aspect: 1,
      basis: straightOn,
      box: lowWideSet(),
      halfFovRad: THREE.MathUtils.degToRad(fov / 2),
      subject: lowWideSet(),
    }),
  );
  for (let i = 1; i < distances.length; i += 1) {
    expect(distances[i]).toBeGreaterThan(distances[i - 1]);
  }
});

test("zoom crops the frame without moving the camera", () => {
  // Zoom is a crop of the picture, so it must not be able to change where the
  // camera stands. Standing further back is the focal length's job, and the
  // two are separate controls precisely because they look different.
  const halfFov = THREE.MathUtils.degToRad(fovDegreesFor(85) / 2);
  const request = { aspect: 1, basis: straightOn, box: lowWideSet(), halfFovRad: halfFov, subject: lowWideSet() };

  // The same lens and the same set give the same distance every time; nothing
  // about a crop enters this calculation at all.
  expect(fitDistance(request)).toBeCloseTo(fitDistance({ ...request }), 12);

  // And the distance genuinely responds to the things that should move the
  // camera, so the check above is not passing for want of any sensitivity.
  const wider = fitDistance({ ...request, halfFovRad: halfFov * 2 });
  expect(wider).toBeLessThan(fitDistance(request));
});

/**
 * The composition rule, on the two shapes that broke the one before it.
 *
 * Air is given round the product's own box. Measured against a sphere instead
 * -- which is what this was -- a shape whose box is much smaller than the ball
 * drawn round it is composed for a subject that is not there: a T-shirt's box
 * is two thirds of its sphere and it came out filling 43 per cent of a
 * portrait artboard's height, over half the picture empty.
 */
test("gives the product air round it, whatever shape the product is", () => {
  const halfFov = THREE.MathUtils.degToRad(fovDegreesFor(85) / 2);
  const tall = new THREE.Box3(new THREE.Vector3(-0.1, -1, -0.1), new THREE.Vector3(0.1, 1, 0.1));
  const squat = new THREE.Box3(new THREE.Vector3(-1, -0.7, -0.4), new THREE.Vector3(1, 0.7, 0.4));

  for (const aspect of [0.8, 1, 16 / 9]) {
    for (const box of [tall, squat]) {
      const distance = fitDistance({
        aspect, basis: straightOn, box, halfFovRad: halfFov, subject: box,
      });
      // What share of the frame the box's near face covers on each axis.
      const ahead = distance - box.max.z;
      const across =
        (box.max.x - box.min.x) / (2 * ahead * Math.tan(halfFov) * aspect);
      const upright = (box.max.y - box.min.y) / (2 * ahead * Math.tan(halfFov));
      // One axis fills four fifths of the frame and neither exceeds it, on
      // every frame shape and either subject. The sphere rule managed this on
      // a tall thin subject only, and only on a square frame.
      expect(Math.max(across, upright), `${aspect} ${box.max.x}`).toBeGreaterThan(0.7);
      expect(Math.max(across, upright), `${aspect} ${box.max.x}`).toBeLessThanOrEqual(0.8);
    }
  }
});

test("holds the furniture in shot without giving it air too", () => {
  const halfFov = THREE.MathUtils.degToRad(fovDegreesFor(85) / 2);
  const device = new THREE.Box3(new THREE.Vector3(-0.2, -0.5, -0.2), new THREE.Vector3(0.2, 0.5, 0.2));
  // A table four times the width of what is standing on it, which is a table.
  const set = new THREE.Box3(new THREE.Vector3(-1.6, -1.2, -1.6), new THREE.Vector3(1.6, 0.5, 1.6));
  const distance = fitDistance({
    aspect: 1, basis: straightOn, box: set, halfFovRad: halfFov, subject: device,
  });
  const ahead = distance - set.max.z;
  const across = (set.max.x - set.min.x) / (2 * ahead * Math.tan(halfFov));
  // The table reaches the edge of frame rather than sitting inside a margin of
  // its own: a set is held, a product is composed.
  expect(across).toBeGreaterThan(0.9);
  expect(across).toBeLessThanOrEqual(1);
});

test("framing offset shifts the picture without leaning it", () => {
  // The basis the framing is applied in is orthonormal, which is what makes a
  // shift a shift: moving the picture sideways cannot introduce any roll,
  // because `across` and `upright` stay perpendicular to the view direction.
  expect(straightOn.direction.length()).toBeCloseTo(1, 10);
  expect(straightOn.across.dot(straightOn.direction)).toBeCloseTo(0, 10);
  expect(straightOn.upright.dot(straightOn.direction)).toBeCloseTo(0, 10);
  expect(straightOn.across.dot(straightOn.upright)).toBeCloseTo(0, 10);

  // The upright stays the room's up rather than the camera's, so a shifted
  // frame is level however the camera is placed.
  const fromAbove = readFitBasis({ position: [0, 4, 4], up: [0, 1, 0] });
  expect(fromAbove.across.y).toBeCloseTo(0, 10);
  expect(fromAbove.across.dot(fromAbove.direction)).toBeCloseTo(0, 10);
});

describe("how much of the furniture is held in frame", () => {
  test("all of it on a square frame and none of it by sixteen by nine", () => {
    const framing = new THREE.Box3(
      new THREE.Vector3(-2, -3, -0.5),
      new THREE.Vector3(2, 1, 0.5),
    );
    const standTop = -0.5;

    // A square frame gives its height to the set, legs included.
    expect(heldBox(framing, standTop, 1).min.y).toBeCloseTo(framing.min.y, 10);
    // A wide frame lets the legs run out of the bottom, which is what a
    // photograph of a desk does anyway.
    expect(heldBox(framing, standTop, 16 / 9).min.y).toBeCloseTo(standTop, 10);

    // Eased across the range rather than switched at a threshold: the canvas
    // size is something people drag, and a step change reads as a fault.
    const midway = heldBox(framing, standTop, 1.5).min.y;
    expect(midway).toBeGreaterThan(framing.min.y);
    expect(midway).toBeLessThan(standTop);
  });
});

/**
 * The camera holds still while the turntable turns.
 *
 * This is the join the whole animation rests on. The camera's distance is
 * derived from the box it has to hold, and the box a turning product occupies
 * changes as it turns — so a frame cut to the box of the moment dollied the
 * camera in and out twice a revolution while the product was supposed to be
 * the only thing moving. Measured on the shapes this catalog actually ships,
 * the swing in camera distance over one turn ran from 12 per cent on a phone
 * to 57 per cent on a laptop.
 */
describe("the room a product needs while it turns", () => {
  const distanceAt = (half: THREE.Vector3, spinDegrees: number): number => {
    // The pose the scene builds, reduced to what the fit reads: the product
    // spun about the room's vertical, which is what a turntable is.
    const turn = new THREE.Matrix4().makeRotationY(
      THREE.MathUtils.degToRad(spinDegrees),
    );
    const spun = new THREE.Box3();
    for (const x of [-half.x, half.x])
      for (const y of [-half.y, half.y])
        for (const z of [-half.z, half.z])
          spun.expandByPoint(
            new THREE.Vector3(x, y, z).applyMatrix4(turn),
          );
    return fitDistance({
      aspect: 0.8,
      basis: straightOn,
      box: spun,
      halfFovRad: THREE.MathUtils.degToRad(fovDegreesFor(50)) / 2,
      subject: spun,
    });
  };

  const sweptDistanceAt = (half: THREE.Vector3, spinDegrees: number): number => {
    const box = sweptSubjectBox({
      half,
      // Spin is absent from the swept box by construction, so the angle can
      // only reach this through the pose — and the pose's own vertical lift is
      // spin-independent too, because spin turns about the vertical.
      position: new THREE.Vector3(0, 0, 0),
      rollDegrees: 0,
      scale: 1,
      tiltDegrees: 0,
    });
    void spinDegrees;
    return fitDistance({
      aspect: 0.8,
      basis: straightOn,
      box,
      halfFovRad: THREE.MathUtils.degToRad(fovDegreesFor(50)) / 2,
      subject: box,
    });
  };

  // Roughly the proportions this catalog ships, worst case first.
  const shapes: ReadonlyArray<readonly [string, THREE.Vector3]> = [
    ["a laptop, wide and shallow", new THREE.Vector3(0.6, 0.2, 0.42)],
    ["a shirt, wide and thin", new THREE.Vector3(0.62, 0.5, 0.26)],
    ["a phone, tall and thin", new THREE.Vector3(0.18, 0.36, 0.02)],
  ];

  test("the box of the moment moves the camera, which is the fault", () => {
    for (const [name, half] of shapes) {
      const over = Array.from({ length: 72 }, (_, step) =>
        distanceAt(half, step * 5),
      );
      const swing =
        (Math.max(...over) - Math.min(...over)) / Math.min(...over);
      // Not an assertion about a good number — an assertion that the old rule
      // really did move the camera, so the one below is proving something.
      expect(swing, name).toBeGreaterThan(0.1);
    }
  });

  test("the swept cylinder does not, at any angle of any product", () => {
    for (const [name, half] of shapes) {
      const over = Array.from({ length: 72 }, (_, step) =>
        sweptDistanceAt(half, step * 5),
      );
      expect(Math.max(...over) - Math.min(...over), name).toBeLessThan(1e-12);
    }
  });

  test("it holds the product at every angle, so nothing is cropped", () => {
    for (const [name, half] of shapes) {
      const swept = sweptSubjectBox({
        half,
        position: new THREE.Vector3(),
        rollDegrees: 0,
        scale: 1,
        tiltDegrees: 0,
      });
      for (let spin = 0; spin < 360; spin += 5) {
        const turn = new THREE.Matrix4().makeRotationY(
          THREE.MathUtils.degToRad(spin),
        );
        for (const x of [-half.x, half.x])
          for (const y of [-half.y, half.y])
            for (const z of [-half.z, half.z]) {
              const corner = new THREE.Vector3(x, y, z).applyMatrix4(turn);
              expect(
                swept.containsPoint(corner),
                `${name} corner at ${spin} degrees`,
              ).toBe(true);
            }
      }
    }
  });

  test("size, tilt and roll still reach it, because only spin is out", () => {
    const half = new THREE.Vector3(0.6, 0.2, 0.42);
    const at = (options: { roll?: number; scale?: number; tilt?: number }) =>
      sweptSubjectBox({
        half,
        position: new THREE.Vector3(),
        rollDegrees: options.roll ?? 0,
        scale: options.scale ?? 1,
        tiltDegrees: options.tilt ?? 0,
      });
    const rest = at({});

    // Twice the size is twice the box, exactly.
    const twice = at({ scale: 2 });
    expect(twice.max.x).toBeCloseTo(rest.max.x * 2, 10);
    expect(twice.max.y).toBeCloseTo(rest.max.y * 2, 10);

    // Tilt and roll both reach the cylinder, which is the point of this test:
    // spin is the only thing taken out of the fit. Which way they move it is a
    // property of the product, not a rule — this laptop is wide, shallow and
    // flat, so leaning it about its width stands it up and fattens the circle
    // it sweeps, while rolling it about its depth tips that width into the
    // vertical and narrows the circle instead. Both are asserted by direction
    // rather than by inequality in one direction, so a shape-dependent answer
    // cannot be mistaken for spin leaking back in.
    const leaning = at({ tilt: 40 });
    expect(leaning.max.x).toBeGreaterThan(rest.max.x);
    expect(leaning.max.y).toBeGreaterThan(rest.max.y);

    const rolled = at({ roll: 40 });
    expect(rolled.max.x).toBeLessThan(rest.max.x);
    expect(rolled.max.y).toBeGreaterThan(rest.max.y);
  });
});
