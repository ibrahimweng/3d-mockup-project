import * as THREE from "three";
import { describe, expect, test } from "vitest";

import {
  applyScreenTransform,
  measureScreenAspect,
  type ScreenSlack,
  type ScreenTransform,
} from "./screen-mapping";

/**
 * The panel is measured height over width, so a screen twice as wide as it is
 * tall reports 0.5. A square design in it is the interesting case: fit and fill
 * have to do visibly different things, and an earlier version of this mapping
 * made them mirror images that both cropped.
 */
const wideScreenAspect = 0.5;

function squareDesign(): THREE.Texture {
  const texture = new THREE.Texture();
  texture.image = { height: 1000, width: 1000 };
  return texture;
}

const neutral: ScreenTransform = {
  fit: "fit",
  offset: { x: 0.5, y: 0.5 },
  scale: 100,
  stretch: { x: 0, y: 0 },
};

function map(patch: Partial<ScreenTransform>, screenAspect = wideScreenAspect) {
  const texture = squareDesign();
  const slack: ScreenSlack = { x: 0, y: 0 };
  applyScreenTransform(texture, screenAspect, { ...neutral, ...patch }, slack);
  return { slack, texture };
}

test("fit modes map to the display texture repeat", () => {
  // `repeat` is how much of the image spans the panel, so below one magnifies
  // and crops and above one leaves room. Fit and fill are reciprocals, not the
  // same number on opposite axes.
  const fit = map({ fit: "fit" });
  const fill = map({ fit: "fill" });
  const stretch = map({ fit: "stretch" });

  // Fitting a square design into a wide panel leaves margins at the sides and
  // crops nothing.
  expect(fit.texture.repeat.x).toBeGreaterThan(1);
  expect(fit.texture.repeat.y).toBeCloseTo(1, 10);
  expect(fit.slack.x).toBe(0);
  expect(fit.slack.y).toBe(0);

  // Filling the same panel crops the top and bottom and leaves no margin.
  expect(fill.texture.repeat.y).toBeLessThan(1);
  expect(fill.texture.repeat.x).toBeCloseTo(1, 10);
  expect(fill.slack.y).toBeGreaterThan(0);

  // Stretching ignores aspect entirely: the design is distorted to the panel,
  // so neither axis is scaled away from it.
  expect(stretch.texture.repeat.x).toBeCloseTo(1, 10);
  expect(stretch.texture.repeat.y).toBeCloseTo(1, 10);

  // Sampling must clamp, or a magnified design tiles around its own edges.
  expect(fill.texture.wrapS).toBe(THREE.ClampToEdgeWrapping);
  expect(fill.texture.wrapT).toBe(THREE.ClampToEdgeWrapping);
});

test("screen scale writes the display texture repeat", () => {
  const base = map({ fit: "stretch", scale: 100 });
  const zoomedIn = map({ fit: "stretch", scale: 200 });
  const zoomedOut = map({ fit: "stretch", scale: 50 });

  // Doubling the control halves the span, because repeat is inverted relative
  // to how the control reads.
  expect(zoomedIn.texture.repeat.x).toBeCloseTo(base.texture.repeat.x / 2, 10);
  expect(zoomedIn.texture.repeat.y).toBeCloseTo(base.texture.repeat.y / 2, 10);
  expect(zoomedOut.texture.repeat.x).toBeCloseTo(base.texture.repeat.x * 2, 10);

  // Zooming is uniform: it must not change the design's shape.
  expect(zoomedIn.texture.repeat.x).toBeCloseTo(zoomedIn.texture.repeat.y, 10);

  // Zoom happens about the middle, so the subject stays centred rather than
  // drifting towards a corner.
  expect(zoomedIn.texture.center.x).toBe(0.5);
  expect(zoomedIn.texture.center.y).toBe(0.5);

  // A scale of zero would divide the image by nothing, so there is a floor.
  expect(Number.isFinite(map({ fit: "stretch", scale: 0 }).texture.repeat.x)).toBe(true);
});

test("screen stretch scales each display axis independently", () => {
  const base = map({ fit: "stretch" });
  const wider = map({ fit: "stretch", stretch: { x: 1, y: 0 } });
  const taller = map({ fit: "stretch", stretch: { x: 0, y: 1 } });

  // One step extends that axis by exactly double and leaves the other alone.
  expect(wider.texture.repeat.x).toBeCloseTo(base.texture.repeat.x / 2, 10);
  expect(wider.texture.repeat.y).toBeCloseTo(base.texture.repeat.y, 10);
  expect(taller.texture.repeat.y).toBeCloseTo(base.texture.repeat.y / 2, 10);
  expect(taller.texture.repeat.x).toBeCloseTo(base.texture.repeat.x, 10);

  // It is a power rather than a line, so one step either way squashes and
  // extends by the same proportion and the centre really is untouched.
  const squashed = map({ fit: "stretch", stretch: { x: -1, y: 0 } });
  expect(squashed.texture.repeat.x).toBeCloseTo(base.texture.repeat.x * 2, 10);
  expect(map({ fit: "stretch", stretch: { x: 0, y: 0 } }).texture.repeat.x).toBeCloseTo(
    base.texture.repeat.x,
    10,
  );
});

test("position, scale and stretch remap the display texture only", () => {
  // Panning is expressed against whatever is actually cropped, so it can never
  // pull the design off its own edge.
  const filled = map({ fit: "fill" });
  expect(filled.slack.y).toBeGreaterThan(0);

  const panned = map({ fit: "fill", offset: { x: 0.5, y: 1 } });
  expect(panned.texture.offset.y).toBeCloseTo(filled.slack.y / 2, 10);

  // Past the end of the crop the pan stops rather than continuing.
  const overshot = map({ fit: "fill", offset: { x: 0.5, y: 5 } });
  expect(overshot.texture.offset.y).toBeCloseTo(panned.texture.offset.y, 10);

  // With nothing cropped on an axis there is no slack, and the offset on that
  // axis correctly does nothing at all.
  expect(filled.slack.x).toBe(0);
  expect(map({ fit: "fill", offset: { x: 1, y: 0.5 } }).texture.offset.x).toBe(0);

  // Everything here is a texture mapping. None of it is a change to geometry,
  // to the model, or to anything outside the display panel — which is what
  // makes it safe to drive from a drag on the screen.
  const { texture } = map({ fit: "fill", scale: 150, stretch: { x: 0.5, y: -0.5 } });
  expect(texture.repeat.x).toBeGreaterThan(0);
  expect(texture.repeat.y).toBeGreaterThan(0);
  expect(texture.version).toBeGreaterThan(0);
});

describe("a design with no transform", () => {
  test("is left exactly as it came", () => {
    const texture = squareDesign();
    const slack: ScreenSlack = { x: 0, y: 0 };
    applyScreenTransform(texture, wideScreenAspect, undefined, slack);

    expect(texture.repeat.x).toBe(1);
    expect(texture.repeat.y).toBe(1);
    expect(texture.offset.x).toBe(0);
    expect(texture.offset.y).toBe(0);
    expect(slack).toEqual({ x: 0, y: 0 });
  });
});

test("a panel taller than it is wide is measured as taller than it is wide", () => {
  // The ID card is 2.13 across and 3.38 up. Returning the smaller extent over
  // the larger reads that as 0.63, which is the reciprocal of the truth, and
  // every square upload arrived squeezed into a tall ellipse because Fit and
  // Fill then corrected the wrong axis. A square platen cannot catch this;
  // only a panel that is not square can.
  const panel = (x: number, y: number, z: number) => {
    const skin = new THREE.MeshStandardMaterial();
    return [new THREE.Mesh(new THREE.BoxGeometry(x, y, z), skin), skin] as const;
  };

  const [card, cardSkin] = panel(2.132, 3.38, 0.005);
  expect(measureScreenAspect(card, [cardSkin], 1)).toBeCloseTo(3.38 / 2.132, 4);

  const [wide, wideSkin] = panel(3.38, 2.132, 0.005);
  expect(measureScreenAspect(wide, [wideSkin], 1)).toBeCloseTo(2.132 / 3.38, 4);

  // A pad lying flat on a folio: what reads as height is the axis running away
  // from the viewer, not its thickness.
  const [pad, padSkin] = panel(27.9, 0.001, 21.1);
  expect(measureScreenAspect(pad, [padSkin], 1)).toBeCloseTo(21.1 / 27.9, 4);
});
