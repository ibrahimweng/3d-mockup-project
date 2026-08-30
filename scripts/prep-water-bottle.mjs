#!/usr/bin/env node
/**
 * Build the water bottle: powder-coated steel with a screw cap and swing latch.
 *
 * Usage:
 *   node scripts/prep-water-bottle.mjs
 *
 * Reads the bought source named in `sourceModel` below and writes
 * `public/models/water-bottle.glb`.
 *
 * Unlike the other products this one is not split into zones. The bottle is
 * already four materials and they already line up with its parts; what it needs
 * is one continuous wrap around the body, which is a cylindrical unwrap rather
 * than a projection onto two axes.
 */

import { readFileSync } from "node:fs";

import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";

import { mulP } from "./prep-model-geometry.mjs";
import { repoPath, sourceModel } from "./prep-model-zones.mjs";

const BODY = "02_-_Default";
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(sourceModel("water-bottle.glb"));

const bodyPrimitives = [];
for (const node of doc.getRoot().listNodes()) {
  const mesh = node.getMesh();
  if (!mesh) continue;
  const m = node.getWorldMatrix();
  for (const prim of mesh.listPrimitives()) {
    if (prim.getMaterial()?.getName() === BODY) bodyPrimitives.push({ m, prim });
  }
}

// Pass 1: the body's axis and extent, in world space.
let yMin = Infinity, yMax = -Infinity, cx = 0, cz = 0, count = 0;
const wallRadius = [];
const p = [0, 0, 0], nv = [0, 0, 0];
for (const { m, prim } of bodyPrimitives) {
  const pos = prim.getAttribute("POSITION");
  for (let i = 0; i < pos.getCount(); i += 1) {
    pos.getElement(i, p);
    const w = mulP(m, p);
    yMin = Math.min(yMin, w[1]); yMax = Math.max(yMax, w[1]);
    cx += w[0]; cz += w[2]; count += 1;
  }
}
cx /= count; cz /= count;
// Radius sampled only from wall vertices, so the base disc does not inflate it.
for (const { m, prim } of bodyPrimitives) {
  const pos = prim.getAttribute("POSITION"), nor = prim.getAttribute("NORMAL");
  for (let i = 0; i < pos.getCount(); i += 1) {
    nor.getElement(i, nv);
    if (Math.abs(nv[1]) > 0.5) continue;
    pos.getElement(i, p);
    const w = mulP(m, p);
    wallRadius.push(Math.hypot(w[0] - cx, w[2] - cz));
  }
}
wallRadius.sort((a, b) => a - b);
const radius = wallRadius[Math.floor(wallRadius.length / 2)];
const height = yMax - yMin;
const circumference = 2 * Math.PI * radius;
console.log(`  body height ${height.toFixed(4)}  median wall radius ${radius.toFixed(5)}`);
console.log(`  wrap aspect ${(circumference / height).toFixed(4)} : 1`);

// Pass 2: rebuild the body non-indexed with a cylindrical unwrap. Non-indexed
// so every triangle owns its vertices, which is what lets the seam triangles
// pick the branch that keeps them continuous instead of wrapping the whole
// texture backwards across the join.
let rebuilt = 0;
for (const { m, prim } of bodyPrimitives) {
  const pos = prim.getAttribute("POSITION"), nor = prim.getAttribute("NORMAL");
  const idx = prim.getIndices();
  const n = idx ? idx.getCount() : pos.getCount();
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3), UV = new Float32Array(n * 2);
  for (let i = 0; i < n; i += 3) {
    const us = [], vs = [], keepP = [], keepN = [];
    for (let k = 0; k < 3; k += 1) {
      const vi = idx ? idx.getScalar(i + k) : i + k;
      pos.getElement(vi, p); nor.getElement(vi, nv);
      keepP.push([...p]); keepN.push([...nv]);
      const w = mulP(m, p);
      // Negated so u increases the way a viewer reads across the front. Taken
      // straight from atan2 the wrap runs the other way and every glyph on it
      // comes out mirrored. 0.75 rather than 0.5 puts u=0.5 on the +Z face the
      // camera looks at, which lands the middle of the artwork on the front and
      // the seam at the back where nobody photographs it.
      us.push(0.75 - Math.atan2(w[2] - cz, w[0] - cx) / (2 * Math.PI));
      vs.push(1 - (w[1] - yMin) / height);
    }
    // Seam repair. Every corner is put on the branch nearest the first one,
    // which is what "the same way round the bottle" means -- half a turn is the
    // furthest two points on a cylinder can be, so anything more is the wrap
    // counted the long way. Lifting whichever corners happened to fall below
    // the middle instead, as a first version did, moved a corner past its
    // neighbours on sixteen triangles and turned their slice of the label round.
    for (let k = 1; k < 3; k += 1) {
      while (us[k] - us[0] > 0.5) us[k] -= 1;
      while (us[k] - us[0] < -0.5) us[k] += 1;
    }
    for (let k = 0; k < 3; k += 1) {
      P.set(keepP[k], (i + k) * 3); N.set(keepN[k], (i + k) * 3);
      UV[(i + k) * 2] = us[k]; UV[(i + k) * 2 + 1] = vs[k];
    }
  }
  prim.setIndices(null);
  prim.setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(P));
  prim.setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(N));
  prim.setAttribute("TEXCOORD_0", doc.createAccessor().setType("VEC2").setArray(UV));
  rebuilt += n / 3;
}
console.log(`  rebuilt ${rebuilt} triangles with a cylindrical unwrap`);

// Pass 3: name the parts and give them their finishes.
const template = doc.createTexture("bottle-body-template")
  .setImage(readFileSync(repoPath("public", "templates", "water-bottle-body.png")))
  .setMimeType("image/png");

const HEAD = { Chrome_Clean: "Bottle_Head_Ring", PVC_Black_Matte: "Bottle_Head_Cap", PVC_Black_Matte0: "Bottle_Head_Latch" };
for (const mat of doc.getRoot().listMaterials()) {
  const name = mat.getName();
  if (name === BODY) {
    mat.setName("Bottle_Body").setBaseColorTexture(template).setBaseColorFactor([1, 1, 1, 1]);
    // REPEAT (10497), so the seam triangles whose u runs past 1 join the far
    // edge instead of clamping the last column across the join.
    mat.getBaseColorTextureInfo().setWrapS(10497).setWrapT(10497);
    // Printed aluminium rather than chrome. At full metalness the base colour
    // only tints a reflection, so a design on it is unreadable; this keeps the
    // sheen while letting ink read as ink.
    mat.setMetallicFactor(0.3).setRoughnessFactor(0.38).setMetallicRoughnessTexture(null);
  } else if (HEAD[name]) {
    mat.setName(HEAD[name]).setMetallicFactor(0).setRoughnessFactor(0.42).setMetallicRoughnessTexture(null);
  }
}

await io.write(repoPath("public", "models", "water-bottle.glb"), doc);
for (const mat of doc.getRoot().listMaterials()) {
  console.log(`  ${mat.getName().padEnd(20)} metal=${mat.getMetallicFactor().toFixed(2)} rough=${mat.getRoughnessFactor().toFixed(2)} baseTex=${mat.getBaseColorTexture() ? "yes" : "no"}`);
}
