import * as THREE from "three";
import { describe, expect, test } from "vitest";

import {
  applyScreenTransform,
  measureScreenAspect,
  measureZoneScale,
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
  allOver: false,
  fit: "fit",
  offset: { x: 0.5, y: 0.5 },
  repeats: 3,
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

test("a panel is measured where it ends up, not where it was modelled", () => {
  // The case the test above cannot catch, because it builds its panels already
  // standing the right way up at identity -- which is not how any of these
  // models are authored. The ID card's mesh is a flat slab lying down, 53.9 by
  // 85.5 in its own coordinates, and its node stands it upright and shrinks it
  // to a card 2.13 across and 3.38 tall. Measured locally that is 0.63; measured
  // where the card actually is it is 1.59, and 0.63 is its reciprocal. Fit and
  // Fill corrected the wrong axis for as long as this read the local box.
  const skin = new THREE.MeshStandardMaterial();
  const slab = new THREE.Mesh(new THREE.BoxGeometry(53.917, 0.12, 85.537), skin);
  const node = new THREE.Group();
  node.add(slab);
  node.rotation.x = -Math.PI / 2; // lay it down, then stand it up
  node.scale.setScalar(2.131 / 53.917);

  const measured = measureScreenAspect(node, [skin], 1);
  expect(measured).toBeCloseTo(3.381 / 2.131, 2);
  // And emphatically not what its own coordinates say.
  expect(measured).not.toBeCloseTo(53.917 / 85.537, 2);
});

test("a node's scale counts, even when it does not turn the panel", () => {
  // The clipboard's sheet is cut to A4 by scaling its node, not its geometry:
  // 27.9 by 21.1 in its own coordinates becomes 28.8 by 20.3 in the world,
  // which is 297 by 210mm. Read locally it measures 0.754 and a design authored
  // at A4 lands seven per cent out -- small enough to look like anything, which
  // is exactly what makes it worth pinning.
  const skin = new THREE.MeshStandardMaterial();
  const sheet = new THREE.Mesh(new THREE.BoxGeometry(27.912, 0.001, 21.057), skin);
  const node = new THREE.Group();
  node.add(sheet);
  node.scale.set(28.772 / 27.912, 1, 20.344 / 21.057);

  const measured = measureScreenAspect(node, [skin], 1);
  // A4 on its side: 210 over 297.
  expect(measured).toBeCloseTo(210 / 297, 3);
  expect(measured).not.toBeCloseTo(21.057 / 27.912, 3);
});

test("a design authored at the panel's own ratio lands on it untouched", () => {
  // The contract the whole of this file exists to keep, stated end to end:
  // measure the panel, fit a design cut to that shape, and nothing should move.
  // Measuring and fitting were each correct on their own and wrong together,
  // which is why neither of their own tests caught it.
  const skin = new THREE.MeshStandardMaterial();
  const slab = new THREE.Mesh(new THREE.BoxGeometry(53.917, 0.12, 85.537), skin);
  const node = new THREE.Group();
  node.add(slab);
  node.rotation.x = -Math.PI / 2;
  node.scale.setScalar(2.131 / 53.917);

  const aspect = measureScreenAspect(node, [skin], 1);
  const design = new THREE.Texture();
  // A card-shaped design: 2.131 across by 3.381 up.
  design.image = { height: 3381, width: 2131 };
  const slack: ScreenSlack = { x: 0, y: 0 };
  applyScreenTransform(design, aspect, neutral, slack);

  expect(design.repeat.x).toBeCloseTo(1, 2);
  expect(design.repeat.y).toBeCloseTo(1, 2);
  expect(slack.x).toBeCloseTo(0, 2);
  expect(slack.y).toBeCloseTo(0, 2);

  // Read from the local box instead and the same design is stretched to two
  // and a half times its width, which is what an ID card upload used to get.
  const local = 53.917 / 85.537;
  const wrong = new THREE.Texture();
  wrong.image = { height: 3381, width: 2131 };
  applyScreenTransform(wrong, local, { ...neutral }, { x: 0, y: 0 });
  expect(wrong.repeat.x).toBeGreaterThan(2.4);
});

/**
 * A panel of a stated size, unwrapped over the whole 0..1 square.
 *
 * Built by hand rather than loaded, because the number under test is the ratio
 * between two areas and a fixture that states both is the only one that can
 * fail for the right reason. The unwrap covers 0..1 exactly, which is what
 * every print zone in this catalog does.
 */
function panel(width: number, height: number): THREE.Object3D {
  const geometry = new THREE.PlaneGeometry(width, height);
  const skin = new THREE.MeshStandardMaterial();
  const mesh = new THREE.Mesh(geometry, skin);
  return mesh;
}

const skinOf = (object: THREE.Object3D) =>
  (object as THREE.Mesh).material as THREE.MeshStandardMaterial;

describe("how much world one turn of a zone's unwrap covers", () => {
  test("is how far the cloth runs, along each axis separately", () => {
    const square = panel(0.5, 0.5);
    expect(measureZoneScale(square, [skinOf(square)])).toEqual({ u: 0.5, v: 0.5 });

    // The case a single number gets wrong. This panel is two and a half times
    // taller than it is wide and its coordinates still run 0 to 1 both ways, so
    // the two axes are different distances; the square root of the area is
    // neither of them.
    const side = panel(0.155, 0.43);
    const measured = measureZoneScale(side, [skinOf(side)]);
    expect(measured.u).toBeCloseTo(0.155, 6);
    expect(measured.v).toBeCloseTo(0.43, 6);
    expect(measured.u).not.toBeCloseTo(Math.sqrt(0.155 * 0.43), 3);
  });

  test("reads the world, so the same panel scaled up measures larger", () => {
    const sleeve = panel(0.3, 0.3);
    sleeve.scale.setScalar(2);
    const measured = measureZoneScale(sleeve, [skinOf(sleeve)]);
    expect(measured.u).toBeCloseTo(0.6, 6);
    expect(measured.v).toBeCloseTo(0.6, 6);
  });

  test("is the middle of the cloth, so a fold cannot drag it", () => {
    /**
     * The case this exists for, as small as it goes.
     *
     * A panel of ordinary cloth with one strip of it turned under, which is
     * what a hem is. The turn runs the cloth a long way for very little height,
     * so those triangles answer with an enormous distance per unit of v -- and
     * they are a sliver of the area. Averaged in, they decide the answer for
     * the whole panel and everything on it prints at the wrong size.
     */
    const ordinary = new THREE.PlaneGeometry(0.5, 0.5, 1, 20);
    const position = ordinary.getAttribute("position");
    const uv = ordinary.getAttribute("uv");
    // The bottom row of the panel keeps its place in the world and is given a
    // sliver of the coordinate, which is the fold: cloth that goes somewhere
    // while the measurement barely moves.
    for (let i = 0; i < uv.count; i += 1) {
      if (position.getY(i) > -0.2) continue;
      uv.setY(i, uv.getY(i) * 0.02);
    }
    uv.needsUpdate = true;
    const hem = new THREE.Mesh(ordinary, new THREE.MeshStandardMaterial());

    const measured = measureZoneScale(hem, [skinOf(hem)]);
    // The cloth is half a metre either way, and that is what it answers.
    expect(measured.u).toBeCloseTo(0.5, 6);
    expect(measured.v).toBeCloseTo(0.5, 2);
  });

  test("answers zero for a panel with no unwrap to measure", () => {
    const bare = panel(1, 1);
    (bare as THREE.Mesh).geometry.deleteAttribute("uv");
    expect(measureZoneScale(bare, [skinOf(bare)])).toEqual({ u: 0, v: 0 });
  });
});
