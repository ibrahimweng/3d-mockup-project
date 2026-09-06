import { describe, expect, it } from "vitest";

import { turn } from "./view-orbit";

/**
 * The turn a drag and a key press share.
 *
 * Shared on purpose: the keyboard used to have no way to rotate at all, and
 * giving it one that computed its own angles would be a second answer to the
 * same question, free to drift from the one the pointer gives.
 */
const front = { position: [0, 0, 4] as [number, number, number], up: [0, 1, 0] as [number, number, number] };

/** Distance from the subject, which a turn must never change. */
function radius(pose: { position: readonly number[] }): number {
  const [x, y, z] = pose.position;
  return Math.hypot(x ?? 0, y ?? 0, z ?? 0);
}

describe("turning the view", () => {
  it("keeps the camera the same distance away", () => {
    // Otherwise turning would also zoom, and a product would grow and shrink as
    // somebody looked around it.
    for (const [x, y] of [
      [120, 0],
      [0, 90],
      [-250, -140],
      [1000, 1000],
    ]) {
      const turned = turn(front, x ?? 0, y ?? 0);
      expect(radius(turned), `${x},${y}`).toBeCloseTo(radius(front), 6);
    }
  });

  it("turns the opposite way for the opposite movement", () => {
    const left = turn(front, -100, 0);
    const right = turn(front, 100, 0);
    expect(left.position[0]).toBeGreaterThan(0);
    expect(right.position[0]).toBeLessThan(0);
  });

  it("stops short of the pole rather than flipping over the top", () => {
    // Straight up is where the view direction and the up vector collapse into
    // each other, and the picture rolls over. A big drag has to stop below it.
    const overhead = turn(front, 0, 100_000);
    const underneath = turn(front, 0, -100_000);
    expect(overhead.position[1]).toBeLessThan(radius(front));
    expect(underneath.position[1]).toBeGreaterThan(-radius(front));
    expect(radius(overhead)).toBeCloseTo(radius(front), 6);
    expect(radius(underneath)).toBeCloseTo(radius(front), 6);
  });

  it("goes nowhere when nothing moved", () => {
    const still = turn(front, 0, 0);
    expect(still.position[0]).toBeCloseTo(front.position[0], 9);
    expect(still.position[1]).toBeCloseTo(front.position[1], 9);
    expect(still.position[2]).toBeCloseTo(front.position[2], 9);
  });

  it("gives a key press the same result as the drag it stands for", () => {
    // The keyboard asks for a turn in pixels, so one press is a short drag.
    // This is what makes the two the same gesture rather than two gestures
    // that happen to look alike.
    const oneShiftPress = turn(front, 45, 0);
    const threePlainPresses = turn(turn(turn(front, 15, 0), 15, 0), 15, 0);

    expect(oneShiftPress.position[0]).toBeCloseTo(threePlainPresses.position[0], 6);
    expect(oneShiftPress.position[2]).toBeCloseTo(threePlainPresses.position[2], 6);
  });
});
