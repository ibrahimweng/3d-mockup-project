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
 * Unlike the other products this one is not split into print zones by a
 * rectangle. The bottle is already four materials and they already line up with
 * its parts; what it needs is one continuous wrap around the body, which is a
 * cylindrical unwrap rather than a projection onto a plane.
 *
 * The body is separated into the wall a label goes round and the ends it does
 * not. A cylindrical wrap has nowhere to put a base or a shoulder -- those
 * surfaces face along the axis it turns about, so their coordinates collapse,
 * and fifteen triangles came out reading their slice of the label backwards.
 * The neck goes with them: it is a narrower cylinder above the shoulder, and
 * leaving it in put the label in two pieces and, worse, dragged the radius the
 * wrap assumes down to the neck's, which stretched the label round the body by
 * a fifth.
 */

import { readFileSync } from "node:fs";

import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";

import { assignShells, mulP } from "./prep-model-geometry.mjs";
import { repoPath, sourceModel } from "./prep-model-zones.mjs";

const BODY = "02_-_Default";
// Where the wall ends: the surface turning more than 60 degrees off vertical.
const WALL_LIMIT = 0.5;

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(sourceModel("water-bottle.glb"));

// Pass 1: every triangle of the body, in world space, with the local positions
// and normals it will be rebuilt from.
const triangles = [];
for (const node of doc.getRoot().listNodes()) {
  const mesh = node.getMesh();
  if (!mesh) continue;
  const m = node.getWorldMatrix();
  for (const prim of mesh.listPrimitives()) {
    if (prim.getMaterial()?.getName() !== BODY) continue;
    const pos = prim.getAttribute("POSITION"), nor = prim.getAttribute("NORMAL");
    const idx = prim.getIndices();
    const count = idx ? idx.getCount() : pos.getCount();
    const p = [0, 0, 0], nv = [0, 0, 0];
    for (let i = 0; i < count; i += 3) {
      const P = [], N = [], world = [];
      for (let k = 0; k < 3; k += 1) {
        const vi = idx ? idx.getScalar(i + k) : i + k;
        pos.getElement(vi, p); nor.getElement(vi, nv);
        P.push([...p]); N.push([...nv]); world.push(mulP(m, p));
      }
      triangles.push({ m, mesh, N, P, prim, world });
    }
  }
}

const facing = (world) => {
  const u = world[1].map((c, q) => c - world[0][q]);
  const v = world[2].map((c, q) => c - world[0][q]);
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  return Math.abs(n[1] / (Math.hypot(...n) || 1));
};

/**
 * The wall a label goes round: the biggest run of near-vertical surface that
 * joins up with itself.
 *
 * Biggest rather than measured, for the same reason the card's clasp is found
 * by which piece of mesh it is rather than by how high it sits. What is left
 * over is the base, the shoulder and the neck.
 */
const upright = triangles.filter((t) => facing(t.world) < WALL_LIMIT);
const shells = assignShells(upright);
const wall = upright.filter((t) => t.shell === shells[0].index);
const ends = triangles.filter((t) => !wall.includes(t));

// Pass 2: the wall's axis, extent and radius -- measured on the wall alone, so
// the wrap is the size of the thing it wraps.
let yMin = Infinity, yMax = -Infinity, cx = 0, cz = 0, count = 0;
const radii = [];
for (const t of wall) for (const w of t.world) {
  yMin = Math.min(yMin, w[1]); yMax = Math.max(yMax, w[1]);
  cx += w[0]; cz += w[2]; count += 1;
}
cx /= count; cz /= count;
for (const t of wall) for (const w of t.world) radii.push(Math.hypot(w[0] - cx, w[2] - cz));
radii.sort((a, b) => a - b);
const radius = radii[Math.floor(radii.length / 2)];
const height = yMax - yMin;
console.log(`  wall ${wall.length} tris, y ${yMin.toFixed(4)}..${yMax.toFixed(4)}, median radius ${radius.toFixed(5)}`);
console.log(`  wrap aspect ${((2 * Math.PI * radius) / height).toFixed(4)} : 1  (${ends.length} triangles on the ends)`);

// Pass 3: rebuild both parts non-indexed, the wall with a cylindrical unwrap.
// Non-indexed so every triangle owns its vertices, which is what lets the seam
// triangles pick the branch that keeps them continuous instead of wrapping the
// whole texture backwards across the join.
function pack(list, withUv) {
  const P = new Float32Array(list.length * 9), N = new Float32Array(list.length * 9);
  const UV = new Float32Array(list.length * 6);
  list.forEach((t, i) => {
    const us = [], vs = [];
    for (let k = 0; k < 3; k += 1) {
      const w = t.world[k];
      // Negated so u increases the way a viewer reads across the front. Taken
      // straight from atan2 the wrap runs the other way and every glyph on it
      // comes out mirrored. 0.75 rather than 0.5 puts u=0.5 on the +Z face the
      // camera looks at, which lands the middle of the artwork on the front and
      // the seam at the back where nobody photographs it.
      us.push(0.75 - Math.atan2(w[2] - cz, w[0] - cx) / (2 * Math.PI));
      vs.push(1 - (w[1] - yMin) / height);
    }
    // Seam repair. Every corner goes on the branch nearest the first, which is
    // what "the same way round the bottle" means -- half a turn is the furthest
    // two points on a cylinder can be, so more than that is the wrap counted the
    // long way. Lifting whichever corners happened to fall below the middle
    // instead, as a first version did, moved a corner past its neighbours on
    // sixteen triangles and turned their slice of the label round.
    for (let k = 1; k < 3; k += 1) {
      while (us[k] - us[0] > 0.5) us[k] -= 1;
      while (us[k] - us[0] < -0.5) us[k] += 1;
    }
    for (let k = 0; k < 3; k += 1) {
      P.set(t.P[k], (i * 3 + k) * 3);
      N.set(t.N[k], (i * 3 + k) * 3);
      if (withUv) UV.set([us[k], vs[k]], (i * 3 + k) * 2);
    }
  });
  const prim = doc.createPrimitive()
    .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(P))
    .setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(N));
  if (withUv) prim.setAttribute("TEXCOORD_0", doc.createAccessor().setType("VEC2").setArray(UV));
  return prim;
}

const host = triangles[0];
for (const { mesh, prim } of new Map(triangles.map((t) => [t.prim, t])).values()) {
  mesh.removePrimitive(prim);
  prim.dispose();
}

// Pass 4: name the parts and give them their finishes.
const template = doc.createTexture("bottle-body-template")
  .setImage(readFileSync(repoPath("public", "templates", "water-bottle-body.png")))
  .setMimeType("image/png");

// Printed aluminium rather than chrome. At full metalness the base colour only
// tints a reflection, so a design on it is unreadable; this keeps the sheen
// while letting ink read as ink.
const COAT = { metallic: 0.3, roughness: 0.38 };
const bodyMaterial = doc.createMaterial("Bottle_Body")
  .setBaseColorTexture(template).setBaseColorFactor([1, 1, 1, 1])
  .setMetallicFactor(COAT.metallic).setRoughnessFactor(COAT.roughness).setDoubleSided(true);
// REPEAT (10497), so the seam triangles whose u runs past 1 join the far edge
// instead of clamping the last column across the join.
bodyMaterial.getBaseColorTextureInfo().setWrapS(10497).setWrapT(10497);
const endsMaterial = doc.createMaterial("Bottle_Body_Ends")
  .setBaseColorFactor([1, 1, 1, 1])
  .setMetallicFactor(COAT.metallic).setRoughnessFactor(COAT.roughness).setDoubleSided(true);

host.mesh.addPrimitive(pack(wall, true).setMaterial(bodyMaterial));
host.mesh.addPrimitive(pack(ends, false).setMaterial(endsMaterial));

const HEAD = { Chrome_Clean: "Bottle_Head_Ring", PVC_Black_Matte: "Bottle_Head_Cap", PVC_Black_Matte0: "Bottle_Head_Latch" };
for (const mat of doc.getRoot().listMaterials()) {
  const name = mat.getName();
  if (!HEAD[name]) continue;
  mat.setName(HEAD[name]).setMetallicFactor(0).setRoughnessFactor(0.42).setMetallicRoughnessTexture(null);
}
for (const mat of doc.getRoot().listMaterials()) {
  if (mat.listParents().every((parent) => parent.propertyType === "Root")) mat.dispose();
}
for (const tex of doc.getRoot().listTextures()) {
  if (tex.listParents().every((parent) => parent.propertyType === "Root")) tex.dispose();
}

await io.write(repoPath("public", "models", "water-bottle.glb"), doc);
for (const mat of doc.getRoot().listMaterials()) {
  console.log(`  ${mat.getName().padEnd(20)} metal=${mat.getMetallicFactor().toFixed(2)} rough=${mat.getRoughnessFactor().toFixed(2)} baseTex=${mat.getBaseColorTexture() ? "yes" : "no"}`);
}
