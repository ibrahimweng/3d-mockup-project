import * as THREE from "three";
import { describe, expect, test } from "vitest";

import { tileArtwork } from "./artwork-binding";
import type { ScreenSlack } from "./screen-mapping";

/**
 * What these prove.
 *
 * An all-over print is one claim: a motif is the same size on every panel of
 * the garment. That is the whole difference between cloth printed before it was
 * cut and four separate prints, and it is easy to get wrong in a way that looks
 * plausible -- putting the same repeat count on every panel gives a sleeve
 * pattern half the size of the body's and reads as a mistake nobody can name.
 *
 * So the sizes here are two panels of a real bag, one two and a half times the
 * width of the other, and the claim is checked between them rather than each
 * being checked against a number of its own.
 */

/** A design of a stated shape, which is all the tiling maths reads off one. */
function design(width: number, height: number): THREE.Texture {
  const texture = new THREE.Texture();
  texture.image = { height, width };
  return texture;
}

const centred = { x: 0.5, y: 0.5 };

/**
 * Measured off the tote, whose four sides are two different widths.
 *
 * `u` is how far the cloth runs across one turn of the panel's coordinates and
 * `v` how far it runs up: 380mm across the front, 155mm across a side, 430mm up
 * either. Written as the two numbers they are, because a single one for both --
 * the square root of the area -- is what this was first, and it printed the
 * narrow side two thirds too large.
 */
const bag = {
  front: { u: 0.38, v: 0.43 },
  side: { u: 0.155, v: 0.43 },
};

describe("printing a design across cloth rather than onto a panel", () => {
  test("puts a motif the same size on panels that are not the same size", () => {
    // Three repeats across the front is the control; the tile that implies is
    // what every other panel is given.
    const tile = bag.front.u / 3;
    const slack: ScreenSlack = { x: 0, y: 0 };

    const front = design(1000, 1000);
    tileArtwork(front, { offset: centred, scale: bag.front, tile }, slack);
    expect(front.repeat.x).toBeCloseTo(3, 6);

    const side = design(1000, 1000);
    tileArtwork(side, { offset: centred, scale: bag.side, tile }, slack);

    // The side holds fewer repeats, and that is the point: fewer of the same
    // size, not the same number shrunk to fit a narrower panel.
    expect(side.repeat.x).toBeLessThan(front.repeat.x);
    expect(bag.side.u / side.repeat.x).toBeCloseTo(bag.front.u / front.repeat.x, 6);

    // And the same up the bag, where the two panels agree: a motif that
    // crosses a fold has to line up on the other side of it.
    expect(front.repeat.y).toBeCloseTo(side.repeat.y, 6);
  });

  test("reads each axis of the panel, because a panel is not square", () => {
    const slack: ScreenSlack = { x: 0, y: 0 };
    const square = design(1000, 1000);
    tileArtwork(square, { offset: centred, scale: bag.front, tile: 0.19 }, slack);
    // Two across the 380mm front, and as many up the 430mm as fit at that size.
    expect(square.repeat.x).toBeCloseTo(2, 6);
    expect(square.repeat.y).toBeCloseTo(0.43 / 0.19, 6);
    // Which is the whole claim: a square motif comes out square on the cloth.
    expect(square.repeat.y / square.repeat.x).toBeCloseTo(bag.front.v / bag.front.u, 6);
  });

  test("keeps the design's own proportions, whatever shape it is", () => {
    const slack: ScreenSlack = { x: 0, y: 0 };
    // A tile is as wide as the tile size and as tall as the design is tall, so
    // a design twice as wide as it is tall tiles half as often up the panel.
    const wide = design(2000, 1000);
    tileArtwork(wide, { offset: centred, scale: { u: 1, v: 1 }, tile: 0.5 }, slack);
    expect(wide.repeat.x).toBeCloseTo(2, 6);
    expect(wide.repeat.y).toBeCloseTo(4, 6);

    const tall = design(1000, 2000);
    tileArtwork(tall, { offset: centred, scale: { u: 1, v: 1 }, tile: 0.5 }, slack);
    expect(tall.repeat.x).toBeCloseTo(2, 6);
    expect(tall.repeat.y).toBeCloseTo(1, 6);
  });

  test("repeats rather than clamps, or the panel is one smeared edge", () => {
    const slack: ScreenSlack = { x: 0, y: 0 };
    const texture = design(1000, 1000);
    tileArtwork(texture, { offset: centred, scale: { u: 1, v: 1 }, tile: 0.25 }, slack);
    expect(texture.wrapS).toBe(THREE.RepeatWrapping);
    expect(texture.wrapT).toBe(THREE.RepeatWrapping);
  });

  test("leaves no slack, because an endless pattern crops nothing", () => {
    const slack: ScreenSlack = { x: 0.4, y: 0.4 };
    tileArtwork(design(1000, 1000), { offset: centred, scale: { u: 1, v: 1 }, tile: 0.5 }, slack);
    expect(slack).toEqual({ x: 0, y: 0 });
  });

  test("slides the pattern across the cloth, centred at the middle", () => {
    const slack: ScreenSlack = { x: 0, y: 0 };
    const still = design(1000, 1000);
    tileArtwork(still, { offset: centred, scale: { u: 1, v: 1 }, tile: 0.5 }, slack);
    expect(still.offset.x).toBeCloseTo(0, 6);
    expect(still.offset.y).toBeCloseTo(0, 6);

    const moved = design(1000, 1000);
    tileArtwork(moved, { offset: { x: 0.75, y: 0.25 }, scale: { u: 1, v: 1 }, tile: 0.5 }, slack);
    expect(moved.offset.x).toBeCloseTo(0.25, 6);
    expect(moved.offset.y).toBeCloseTo(-0.25, 6);
  });

  test("declines a zone it cannot size, rather than guessing at one", () => {
    const slack: ScreenSlack = { x: 0, y: 0 };
    // No unwrap to measure, so no honest tile size exists for this panel and
    // the caller falls back to fitting the design the ordinary way.
    expect(tileArtwork(design(1000, 1000), { offset: centred, scale: { u: 0, v: 0 }, tile: 0.2 }, slack))
      .toBe(false);
    expect(tileArtwork(design(1000, 1000), { offset: centred, scale: { u: 0.5, v: 0.5 }, tile: 0 }, slack))
      .toBe(false);
  });
});
