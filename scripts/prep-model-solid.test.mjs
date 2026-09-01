import assert from "node:assert/strict";
import test from "node:test";

import { Document } from "@gltf-transform/core";

import { sweepProfile, worldBoxes } from "./prep-model-solid.mjs";

/**
 * What these prove.
 *
 * A part that is added to a bought file has one failure that costs nothing to
 * make and is invisible while you are making it: wound the wrong way round, the
 * solid is inside out, and with back faces culled it renders as a hole in the
 * shape of itself. Nothing about the numbers in the prep script says which way
 * round a profile went, so the winding is asserted here rather than looked at.
 *
 * The rest is closure. A swept profile is only a solid if every edge has two
 * faces; one free edge is a crack that catches the light along one seam and is
 * hard to see and harder to attribute.
 */

/** A square metre-ish box, which is the simplest thing the sweep can make. */
function box() {
  const doc = new Document();
  doc.createScene();
  const node = sweepProfile(doc, {
    material: doc.createMaterial("steel"),
    name: "Box",
    profile: [[0, 0], [2, 0], [2, 1], [0, 1]],
    z0: 0,
    z1: 3,
  });
  const prim = node.getMesh().listPrimitives()[0];
  const pos = prim.getAttribute("POSITION");
  const nor = prim.getAttribute("NORMAL");
  const tris = [];
  for (let i = 0; i < pos.getCount(); i += 3) {
    tris.push([0, 1, 2].map((k) => ({
      n: nor.getElement(i + k, [0, 0, 0]),
      p: pos.getElement(i + k, [0, 0, 0]),
    })));
  }
  return { doc, node, tris };
}

test("a swept profile closes: every edge has two faces", () => {
  const { tris } = box();
  // Four walls of two triangles and two ends of two, which is a box.
  assert.equal(tris.length, 12);
  const edges = new Map();
  const key = (p) => p.map((v) => v.toFixed(6)).join();
  for (const tri of tris) {
    for (let k = 0; k < 3; k += 1) {
      const [a, b] = [key(tri[k].p), key(tri[(k + 1) % 3].p)];
      const edge = a < b ? `${a}|${b}` : `${b}|${a}`;
      edges.set(edge, (edges.get(edge) ?? 0) + 1);
    }
  }
  const free = [...edges.values()].filter((n) => n !== 2);
  assert.deepEqual(free, [], `${free.length} edges are not shared by two faces`);
});

test("every face looks out of the solid, not into it", () => {
  const { tris } = box();
  // The box spans 0..2, 0..1, 0..3, so its middle is here.
  const middle = [1, 0.5, 1.5];
  for (const tri of tris) {
    const mid = [0, 1, 2].map((q) => (tri[0].p[q] + tri[1].p[q] + tri[2].p[q]) / 3);
    const out = [0, 1, 2].map((q) => mid[q] - middle[q]);
    const facing = [0, 1, 2].reduce((sum, q) => sum + out[q] * tri[0].n[q], 0);
    assert.ok(facing > 0, `a face at ${mid.join()} points inwards: normal ${tri[0].n.join()}`);
  }
});

test("a face is flat: one normal for all three of its corners", () => {
  // Pressed metal, whose edges are meant to read as edges. Sharing vertices
  // between faces would smooth them and the part would look like soap.
  for (const tri of box().tris) {
    for (const corner of tri) assert.deepEqual(corner.n, tri[0].n);
  }
});

test("a box is measured where its node puts it, not where it was drawn", () => {
  const { doc, node } = box();
  node.setTranslation([10, 0, -4]);
  const found = worldBoxes(doc).get("Box");
  assert.deepEqual(found.lo, [10, 0, -4]);
  assert.deepEqual(found.hi, [12, 1, -1]);
  assert.deepEqual(found.size, [2, 1, 3]);
  assert.deepEqual(found.mid, [11, 0.5, -2.5]);
  assert.equal(found.node, node);
});
