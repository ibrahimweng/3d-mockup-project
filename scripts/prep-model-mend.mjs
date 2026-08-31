/**
 * The two repairs a bought mesh needs before a print zone is cut out of it.
 *
 * Both exist because of the same thing: a model that renders perfectly well can
 * still be built out of pieces that no measurement agrees about. Two crossings
 * a ten-thousandth of a millimetre apart are one point to one check and two to
 * the next; a triangle whose corners are in a line has no direction to face.
 * Neither shows on screen, and both decide what a full-bleed unwrap does.
 *
 * `prep-model-geometry.mjs` answers questions about a mesh. This changes one.
 */

import { faceNormal, inv4, mulN, mulP } from "./prep-model-geometry.mjs";

/**
 * Pull vertices closer together than the weld onto one another, and drop what
 * that leaves with no area.
 *
 * Cutting a print area out of a dense mesh makes near-duplicates: two crossings
 * landing a ten-thousandth of a millimetre apart, or a crossing beside a corner
 * it did not quite snap to. Nothing renders them apart, but every check that
 * asks whether a mesh is closed has to decide first which points are the same
 * point, and a pair this close is exactly the case where two such checks
 * disagree -- so the tote came out with 32 edges used by four faces, all of
 * them at a spot where two vertices sat a thousandth of a weld apart.
 *
 * Merging rather than deleting. A piece with two corners in one place has two
 * edges running to its third corner, and once its corners are actually equal
 * those are one edge laid twice, so removing it takes the doubling with it and
 * leaves the neighbours' own edges untouched. Deleting the piece without
 * merging first does the opposite: its edges were the neighbours' edges too,
 * and the tote went from 32 edges used four times to 82 used once.
 *
 * Representatives are claimed in the order the faces are walked and never
 * chained, so no vertex travels further than one weld -- a thirtieth of a
 * millimetre on a bag, and less than the file's own float32 can hold apart.
 */
export function weldFaces(byZone, weld) {
  const claimed = new Map();
  const cell = (w, d) => `${Math.round(w[0] / weld) + d[0]},${Math.round(w[1] / weld) + d[1]},${Math.round(w[2] / weld) + d[2]}`;
  const nearby = [];
  for (let x = -1; x <= 1; x += 1) for (let y = -1; y <= 1; y += 1) for (let z = -1; z <= 1; z += 1) nearby.push([x, y, z]);
  const representative = (w) => {
    for (const d of nearby) {
      for (const other of claimed.get(cell(w, d)) ?? []) {
        if (Math.hypot(w[0] - other[0], w[1] - other[1], w[2] - other[2]) < weld) return other;
      }
    }
    const here = cell(w, [0, 0, 0]);
    const mine = claimed.get(here) ?? [];
    mine.push(w); claimed.set(here, mine);
    return w;
  };

  let dropped = 0;
  for (const [name, list] of byZone) {
    const kept = [];
    for (const f of list) {
      f.world = f.world.map(representative);
      if (f.world[0] === f.world[1] || f.world[1] === f.world[2] || f.world[2] === f.world[0]) {
        dropped += 1;
        continue;
      }
      const ivm = inv4(f.m);
      f.P = f.world.map((w) => mulP(ivm, w));
      f.C = [0, 1, 2].map((q) => f.world.reduce((sum, w) => sum + w[q] / 3, 0));
      kept.push(f);
    }
    byZone.set(name, kept);
  }
  return dropped;
}

/**
 * Mend the slivers a simplifier leaves behind.
 *
 * Collapsing edges to a fifth of the triangles is what makes a 301,100-triangle
 * source into a file a browser will pull down, and what it leaves behind is
 * triangles whose three corners are very nearly in a line: 1,906 of the tote's
 * 60,220 stand less than a fifth of a millimetre tall while being two and a
 * half millimetres wide, and one is eighteen millimetres long.
 *
 * They print nothing -- a fifth of a millimetre is a texel -- but they are not
 * harmless. Which way round such a triangle lands in the atlas is decided by
 * the last digits of its corners, so an unwrap that follows a curve rather than
 * a plane comes out with a scatter of them reversed: 136 of the tote's front
 * panel alone. They also draw lines. Mending them took the bag's hard interior
 * edges from 1,839 to 922 without touching a single edge that is a real seam or
 * a real fold, because a triangle this thin has no direction to face and so
 * disagrees with both its neighbours.
 *
 * The repair is the standard one and it moves nothing: the sliver and the face
 * on the far side of its long edge are two halves of a four-cornered patch, cut
 * the wrong way. Cutting the patch along its other diagonal gives two ordinary
 * triangles over exactly the same surface, so no vertex moves and the model is
 * the same shape afterwards. It is refused where it would fold the surface,
 * where the two corners it would join are already joined, or where it would not
 * actually leave both halves better than the sliver was.
 *
 * `limit` is a fraction of the model's own diagonal, so it means the same thing
 * on a bag and on a bottle. A fifth of a millimetre on this bag is a fifteenth
 * of the shortest edge anything else there has.
 */
export function mendSlivers(faces, { limit = 3e-4, rounds = 8 } = {}) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const f of faces) for (const w of f.world) for (let q = 0; q < 3; q += 1) {
    lo[q] = Math.min(lo[q], w[q]); hi[q] = Math.max(hi[q], w[q]);
  }
  const size = Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) || 1;
  const step = size * 1e-5;
  const key = (w) => `${Math.round(w[0] / step)},${Math.round(w[1] / step)},${Math.round(w[2] / step)}`;
  const span = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  /** How tall a triangle stands over its own longest edge. */
  const stand = (w) => {
    const longest = Math.max(span(w[0], w[1]), span(w[1], w[2]), span(w[2], w[0]));
    const n = faceNormal({ world: w });
    const [a, b, c] = w;
    const u = [b[0]-a[0], b[1]-a[1], b[2]-a[2]], v = [c[0]-a[0], c[1]-a[1], c[2]-a[2]];
    const twice = Math.hypot(u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]);
    return { height: longest > 0 ? twice / longest : 0, normal: n };
  };
  const corner = (f, k) => ({ N: f.N[k], P: f.P[k], UV0: f.UV0[k], world: f.world[k] });
  const rebuild = (f, corners) => {
    f.N = corners.map((c) => c.N);
    f.P = corners.map((c) => c.P);
    f.UV0 = corners.map((c) => c.UV0);
    f.world = corners.map((c) => c.world);
    f.C = [0, 1, 2].map((q) => f.world.reduce((sum, w) => sum + w[q] / 3, 0));
    const world = f.N.map((n) => mulN(f.m, n));
    f.WN = [0, 1, 2].map((q) => world.reduce((sum, n) => sum + n[q] / 3, 0));
    f.uvV = f.UV0.reduce((sum, a) => sum + a[1] / 3, 0);
  };

  let mended = 0;
  for (let round = 0; round < rounds; round += 1) {
    const edges = new Map();
    const at = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
    faces.forEach((f, i) => {
      const k = f.world.map(key);
      for (let c = 0; c < 3; c += 1) {
        const e = at(k[c], k[(c + 1) % 3]);
        (edges.get(e) ?? edges.set(e, []).get(e)).push({ corner: c, face: i });
      }
    });
    const touched = new Set();
    let did = 0;
    for (let i = 0; i < faces.length; i += 1) {
      const f = faces[i];
      const height = stand(f.world).height;
      if (height >= size * limit || touched.has(i)) continue;
      // The long edge, and the corner standing over it.
      let c = 0, longest = 0;
      for (let k = 0; k < 3; k += 1) {
        const d = span(f.world[k], f.world[(k + 1) % 3]);
        if (d > longest) { longest = d; c = k; }
      }
      const k = f.world.map(key);
      const users = edges.get(at(k[c], k[(c + 1) % 3])) ?? [];
      if (users.length !== 2) continue;
      const other = users.find((u) => u.face !== i);
      if (!other || touched.has(other.face)) continue;
      const g = faces[other.face];
      if (g.owner !== f.owner) continue;
      // f is A,B,C over the long edge A-B; g is B,A,D over the same edge. The
      // patch runs C,A,D,B, and the other way to cut it is along C-D.
      const A = corner(f, c), B = corner(f, (c + 1) % 3), C = corner(f, (c + 2) % 3);
      const D = corner(g, (other.corner + 2) % 3);
      if (edges.has(at(key(C.world), key(D.world)))) continue;
      const one = stand([C.world, A.world, D.world]), two = stand([C.world, D.world, B.world]);
      if (Math.min(one.height, two.height) <= height) continue;
      // Refused where it would fold the surface: the two halves have to still
      // face the way the patch did. Which way that is comes from the face on
      // the far side, not from the sliver -- a triangle a fifth of a millimetre
      // tall has no direction worth asking for, and asking it anyway refused
      // two fifths of the repairs.
      const was = faceNormal(g);
      const flat = (n) => n[0] * was[0] + n[1] * was[1] + n[2] * was[2] > 0.7;
      if (!flat(one.normal) || !flat(two.normal)) continue;
      rebuild(f, [C, A, D]);
      rebuild(g, [C, D, B]);
      touched.add(i); touched.add(other.face);
      edges.set(at(key(C.world), key(D.world)), [{ corner: 0, face: i }, { corner: 1, face: other.face }]);
      did += 1;
    }
    mended += did;
    if (!did) break;
  }
  return mended;
}
