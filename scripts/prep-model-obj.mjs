/**
 * Read a Wavefront OBJ into a glTF document the prep pipeline can work on.
 *
 * Two of the bought sources arrive as OBJ rather than glTF, and an OBJ says
 * less: no scene graph, no units, no agreement about which way is up. It is
 * still the better source when it is the better mesh, so this reads one in and
 * puts it where the product expects to find it.
 *
 * What comes back is one indexed primitive under one material, which is what
 * the rest of prep already knows how to take apart. Normals are computed here
 * because an OBJ often has none; they are smooth everywhere, and the crease
 * angle in `prepZones` is what decides afterwards which edges are folds.
 */

import { readFileSync } from "node:fs";

import { Document } from "@gltf-transform/core";

const AXIS = { x: 0, y: 1, z: 2 };

/**
 * The positions and triangles of an OBJ.
 *
 * Faces are triangulated by fanning from the first corner. Every source these
 * are read from is quads, and a quad from a modelling package is planar or very
 * near it, so a fan is the same surface either way it is cut.
 */
export function readObj(file) {
  const positions = [];
  const triangles = [];
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (line.startsWith("v ")) {
      const parts = line.trim().split(/\s+/);
      positions.push([Number(parts[1]), Number(parts[2]), Number(parts[3])]);
    } else if (line.startsWith("f ")) {
      // "f 1/2/3" is position/texture/normal, and only the position is wanted.
      // A negative index counts back from the end of what has been read so far.
      const corners = line.trim().split(/\s+/).slice(1).map((s) => {
        const i = Number.parseInt(s.split("/")[0], 10);
        return i > 0 ? i - 1 : positions.length + i;
      });
      for (let k = 2; k < corners.length; k += 1) {
        triangles.push([corners[0], corners[k - 1], corners[k]]);
      }
    }
  }
  return { positions, triangles };
}

/** The box a set of positions occupies, as `{ hi, lo, size }`. */
export function boxOf(positions) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of positions) for (let q = 0; q < 3; q += 1) {
    if (p[q] < lo[q]) lo[q] = p[q];
    if (p[q] > hi[q]) hi[q] = p[q];
  }
  return { hi, lo, size: [0, 1, 2].map((q) => hi[q] - lo[q]) };
}

/**
 * Move a mesh into the space the product is built in.
 *
 * `axes` names, for each of x, y and z of the result, which source axis it
 * comes from -- `["y", "z", "x"]` for a model authored z-up and turned a
 * quarter turn, and a leading `-` to reverse one. Only permutations are
 * allowed, and a permutation with an odd number of reversals turns the mesh
 * inside out, so this refuses one rather than quietly flipping every face.
 *
 * `scale` is how many units of the result one unit of the source becomes, and
 * `rest` is where the result stands: the point its horizontal middle and its
 * lowest surface arrive at.
 */
export function placeObj(mesh, { axes, rest, scale }) {
  const from = axes.map((a) => AXIS[a.replace("-", "")]);
  const sign = axes.map((a) => (a.startsWith("-") ? -1 : 1));
  if (new Set(from).size !== 3) throw new Error(`axes must be a permutation, not ${axes.join(",")}`);
  // A permutation's own sign, times the reversals. xyz -> yzx is a rotation;
  // xyz -> yxz is a mirror, and a mirror leaves every triangle wound the wrong
  // way round, which renders as a bag with its inside surface facing out.
  const cyclic = from[0] === (from[1] + 2) % 3 && from[1] === (from[2] + 2) % 3;
  if ((cyclic ? 1 : -1) * sign[0] * sign[1] * sign[2] < 0) {
    throw new Error(`axes ${axes.join(",")} mirror the mesh; reverse one more axis`);
  }
  const moved = mesh.positions.map((p) => [0, 1, 2].map((q) => sign[q] * p[from[q]] * scale));
  const box = boxOf(moved);
  const shift = [
    rest[0] - (box.lo[0] + box.hi[0]) / 2,
    rest[1] - box.lo[1],
    rest[2] - (box.lo[2] + box.hi[2]) / 2,
  ];
  return {
    positions: moved.map((p) => [p[0] + shift[0], p[1] + shift[1], p[2] + shift[2]]),
    triangles: mesh.triangles,
  };
}

/**
 * Smooth normals, weighted by the area of each triangle.
 *
 * Cross-product length is twice a triangle's area, so summing the unnormalised
 * cross products already weights each face by how much surface it contributes,
 * and a strip of slivers stops out-voting the broad face beside it.
 */
function normalsOf({ positions, triangles }) {
  const normals = positions.map(() => [0, 0, 0]);
  for (const [i, j, k] of triangles) {
    const a = positions[i], b = positions[j], c = positions[k];
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    for (const corner of [i, j, k]) for (let q = 0; q < 3; q += 1) normals[corner][q] += n[q];
  }
  return normals.map((n) => {
    const len = Math.hypot(n[0], n[1], n[2]);
    return len > 0 ? [n[0] / len, n[1] / len, n[2] / len] : [0, 1, 0];
  });
}

/**
 * One indexed primitive, one material, one node.
 *
 * Indexed, and sharing the source's own vertices, because the simplifier that
 * runs next can only collapse an edge whose two ends are the same vertex. Split
 * the mesh into loose corners first and it has nothing to work with.
 */
export function objDocument(mesh, { material }) {
  const doc = new Document();
  doc.createBuffer();
  const normals = normalsOf(mesh);
  const P = new Float32Array(mesh.positions.length * 3);
  const N = new Float32Array(mesh.positions.length * 3);
  mesh.positions.forEach((p, i) => { P.set(p, i * 3); N.set(normals[i], i * 3); });
  const I = new Uint32Array(mesh.triangles.length * 3);
  mesh.triangles.forEach((t, i) => I.set(t, i * 3));
  const prim = doc.createPrimitive()
    .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(P))
    .setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(N))
    .setIndices(doc.createAccessor().setType("SCALAR").setArray(I))
    .setMaterial(doc.createMaterial(material));
  const node = doc.createNode(material).setMesh(doc.createMesh(material).addPrimitive(prim));
  // Named, and set as the default. A glTF with scenes but no `scene` index has
  // nothing to show by default, and a reader that asks a file what it contains
  // gets an empty answer from it.
  const scene = doc.createScene(material).addChild(node);
  doc.getRoot().setDefaultScene(scene);
  return doc;
}
