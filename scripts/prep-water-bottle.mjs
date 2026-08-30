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
 * The label covers the whole outside of the body: the base roll, the straight
 * wall, the shoulder and the short neck above it, up to the height where the
 * chrome ring begins and takes over. What it does not cover is the flat disc
 * the bottle stands on and the annulus at the top, both of which face along the
 * axis the wrap turns about, so their coordinates collapse and their slice of
 * the label would read backwards.
 *
 * Height is not the wrap's second coordinate; distance along the profile is.
 * The shoulder loses five millimetres of radius over eight of height, so its
 * surface is longer than its height, and measuring by height alone squeezed the
 * artwork into a band as it went over the turn.
 */

import { readFileSync } from "node:fs";

import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";

import { mulP } from "./prep-model-geometry.mjs";
import { repoPath, sourceModel } from "./prep-model-zones.mjs";

const BODY = "02_-_Default";
// How squarely a face has to look away from the axis to count as the outside of
// the bottle. The disc it stands on and the annulus under the ring read 0.
const OUTWARD = 0.2;
// Heights closer together than this are the same ring of the lathe. The model
// has two a thousandth of a millimetre apart; everywhere else the gap is at
// least twenty times that.
const SAME_RING = 2e-6;

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

// Pass 2: the axis, then the label -- everything on the body that faces away
// from that axis.
let cx = 0, cz = 0, count = 0;
for (const t of triangles) for (const w of t.world) { cx += w[0]; cz += w[2]; count += 1; }
cx /= count; cz /= count;

/**
 * How squarely a face looks away from the axis, from 1 for straight out to 0
 * for along it.
 *
 * This is what separates the label from the parts a wrap cannot hold, and it
 * says so directly. An earlier version asked instead how near vertical a face
 * was and took the largest patch of it, which threw away the shoulder and the
 * neck as well as the two discs -- and those are surfaces a label does go over,
 * so the bottle wore a white band under the ring and another round its foot.
 */
const outwardness = (world) => {
  const u = world[1].map((c, q) => c - world[0][q]);
  const v = world[2].map((c, q) => c - world[0][q]);
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const len = Math.hypot(...n) || 1;
  const mx = (world[0][0] + world[1][0] + world[2][0]) / 3 - cx;
  const mz = (world[0][2] + world[1][2] + world[2][2]) / 3 - cz;
  const r = Math.hypot(mx, mz);
  return r < 1e-9 ? 0 : (n[0] * mx + n[2] * mz) / (len * r);
};

const label = triangles.filter((t) => outwardness(t.world) > OUTWARD);
const ends = triangles.filter((t) => outwardness(t.world) <= OUTWARD);

/**
 * The profile the label is wrapped round, as distance along the surface.
 *
 * The body is a lathe, so its vertices sit on rings of constant height and
 * radius; walking those rings from the foot up gives the exact length of the
 * curve the label follows. Dividing by that length rather than by height is
 * what stops the shoulder, which is longer than it is tall, from squeezing its
 * share of the artwork into a band.
 */
function profileOf(faces) {
  const rings = new Map();
  for (const t of faces) for (const w of t.world) {
    const key = Math.round(w[1] / SAME_RING);
    const r = Math.hypot(w[0] - cx, w[2] - cz);
    const e = rings.get(key) ?? { n: 0, r: 0, y: 0 };
    e.n += 1; e.r += r; e.y += w[1]; rings.set(key, e);
  }
  const steps = [...rings.values()]
    .map((e) => ({ r: e.r / e.n, y: e.y / e.n }))
    .sort((a, b) => a.y - b.y);
  let s = 0;
  steps[0].s = 0;
  for (let i = 1; i < steps.length; i += 1) {
    s += Math.hypot(steps[i].y - steps[i - 1].y, steps[i].r - steps[i - 1].r);
    steps[i].s = s;
  }
  return { length: s, steps };
}

const profile = profileOf(label);
/** Distance along the profile at a height, straight-line between rings. */
function along(y) {
  const { steps } = profile;
  if (y <= steps[0].y) return 0;
  if (y >= steps[steps.length - 1].y) return profile.length;
  let lo = 0, hi = steps.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (steps[mid].y <= y) lo = mid; else hi = mid;
  }
  const span = steps[hi].y - steps[lo].y;
  return span < 1e-12 ? steps[lo].s : steps[lo].s + (steps[hi].s - steps[lo].s) * (y - steps[lo].y) / span;
}

// The widest ring, not the average one. The aspect this reports is the shape a
// design has to be authored at to land undistorted, and the surface it has to
// land undistorted on is the straight wall -- which is the widest part and the
// only part anyone reads. Averaging pulls the radius down towards the shoulder
// and squashes the artwork on the wall to pay for it.
let radius = 0;
for (const t of label) for (const w of t.world) radius = Math.max(radius, Math.hypot(w[0] - cx, w[2] - cz));
const yLo = profile.steps[0].y, yHi = profile.steps[profile.steps.length - 1].y;
console.log(`  label ${label.length} tris, y ${yLo.toFixed(4)}..${yHi.toFixed(4)}, widest radius ${radius.toFixed(5)}`);
console.log(`  profile ${(profile.length * 1000).toFixed(2)}mm over ${((yHi - yLo) * 1000).toFixed(2)}mm of height`);
console.log(`  wrap aspect ${((2 * Math.PI * radius) / profile.length).toFixed(4)} : 1  (${ends.length} triangles on the two discs)`);

// Pass 3: rebuild both parts non-indexed, the label with a cylindrical unwrap.
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
      vs.push(1 - along(w[1]) / profile.length);
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

host.mesh.addPrimitive(pack(label, true).setMaterial(bodyMaterial));
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
