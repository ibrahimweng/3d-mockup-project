/**
 * The geometry a zone split needs before it can decide anything.
 *
 * Two questions live here, and both are about the mesh rather than about the
 * product: which connected component each face belongs to, and which of its
 * edges are folds that want rounding. `prep-model-zones.mjs` asks them; the
 * per-product scripts answer in terms of the answers.
 */

export const mulP = (m, v) => [
  m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12],
  m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13],
  m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14],
];

export const mulN = (m, v) => {
  const r = [
    m[0] * v[0] + m[4] * v[1] + m[8] * v[2],
    m[1] * v[0] + m[5] * v[1] + m[9] * v[2],
    m[2] * v[0] + m[6] * v[1] + m[10] * v[2],
  ];
  const length = Math.hypot(...r) || 1;
  return [r[0] / length, r[1] / length, r[2] / length];
};

/** Inverse of a 4x4, so a world-space edit can be written back as local. */
export function inv4(m) {
  const a = m, o = new Array(16);
  const s0=a[0]*a[5]-a[1]*a[4], s1=a[0]*a[6]-a[2]*a[4], s2=a[0]*a[7]-a[3]*a[4];
  const s3=a[1]*a[6]-a[2]*a[5], s4=a[1]*a[7]-a[3]*a[5], s5=a[2]*a[7]-a[3]*a[6];
  const c5=a[10]*a[15]-a[11]*a[14], c4=a[9]*a[15]-a[11]*a[13], c3=a[9]*a[14]-a[10]*a[13];
  const c2=a[8]*a[15]-a[11]*a[12], c1=a[8]*a[14]-a[10]*a[12], c0=a[8]*a[13]-a[9]*a[12];
  const i = 1 / (s0*c5-s1*c4+s2*c3+s3*c2-s4*c1+s5*c0);
  o[0]=( a[5]*c5-a[6]*c4+a[7]*c3)*i;  o[1]=(-a[1]*c5+a[2]*c4-a[3]*c3)*i;
  o[2]=( a[13]*s5-a[14]*s4+a[15]*s3)*i; o[3]=(-a[9]*s5+a[10]*s4-a[11]*s3)*i;
  o[4]=(-a[4]*c5+a[6]*c2-a[7]*c1)*i;  o[5]=( a[0]*c5-a[2]*c2+a[3]*c1)*i;
  o[6]=(-a[12]*s5+a[14]*s2-a[15]*s1)*i; o[7]=( a[8]*s5-a[10]*s2+a[11]*s1)*i;
  o[8]=( a[4]*c4-a[5]*c2+a[7]*c0)*i;  o[9]=(-a[0]*c4+a[1]*c2-a[3]*c0)*i;
  o[10]=( a[12]*s4-a[13]*s2+a[15]*s0)*i; o[11]=(-a[8]*s4+a[9]*s2-a[11]*s0)*i;
  o[12]=(-a[4]*c3+a[5]*c1-a[6]*c0)*i; o[13]=( a[0]*c3-a[1]*c1+a[2]*c0)*i;
  o[14]=(-a[12]*s3+a[13]*s1-a[14]*s0)*i; o[15]=( a[8]*s3-a[9]*s1+a[10]*s0)*i;
  return o;
}

const faceNormal = (f) => {
  const [a, b, c] = f.world;
  const u = [b[0]-a[0], b[1]-a[1], b[2]-a[2]];
  const v = [c[0]-a[0], c[1]-a[1], c[2]-a[2]];
  const n = [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]];
  const length = Math.hypot(...n) || 1;
  return [n[0]/length, n[1]/length, n[2]/length];
};

function makeUnionFind() {
  const parent = new Map();
  const rootOf = (a) => {
    let node = parent.get(a) ?? a;
    while (node !== (parent.get(node) ?? node)) {
      const up = parent.get(node) ?? node;
      parent.set(node, parent.get(up) ?? up);
      node = parent.get(node) ?? node;
    }
    parent.set(a, node);
    return node;
  };
  return {
    join: (a, b) => { const ra = rootOf(a), rb = rootOf(b); if (ra !== rb) parent.set(ra, rb); },
    rootOf,
  };
}

/**
 * Tag every face with the connected component it belongs to, largest first.
 *
 * This is what a part *is*, and it is why the classifiers need no measurement.
 * Deciding where the ID card's clasp begins by testing height against 1.73 is
 * guessing at a boundary the mesh already draws exactly: the clasp shares no
 * vertex with the card. The guess cut 176 triangles off on the wrong side, 97
 * of them wearing the printed faces, which is the artwork seen running over the
 * metal.
 *
 * Positions are welded at a hundred-thousandth of the model's own diagonal --
 * the same tolerance `src/app/model-measure-test-utils.ts` uses, so the prep
 * and the tests that check it agree about how many parts a file has.
 */
export function assignShells(faces) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const f of faces) for (const w of f.world) for (let q = 0; q < 3; q += 1) {
    if (w[q] < lo[q]) lo[q] = w[q];
    if (w[q] > hi[q]) hi[q] = w[q];
  }
  const step = (Math.hypot(hi[0]-lo[0], hi[1]-lo[1], hi[2]-lo[2]) || 1) * 1e-5;
  const key = (w) => `${Math.round(w[0]/step)},${Math.round(w[1]/step)},${Math.round(w[2]/step)}`;
  const sets = makeUnionFind();
  for (const f of faces) { const k = f.world.map(key); sets.join(k[0], k[1]); sets.join(k[0], k[2]); }

  const groups = new Map();
  for (const f of faces) {
    const root = sets.rootOf(key(f.world[0]));
    const group = groups.get(root);
    if (group) group.push(f); else groups.set(root, [f]);
  }
  return [...groups.values()]
    .sort((a, b) => b.length - a.length)
    .map((group, index) => {
      const slo = [Infinity, Infinity, Infinity], shi = [-Infinity, -Infinity, -Infinity];
      for (const f of group) for (const w of f.world) for (let q = 0; q < 3; q += 1) {
        if (w[q] < slo[q]) slo[q] = w[q];
        if (w[q] > shi[q]) shi[q] = w[q];
      }
      const info = {
        centre: [0,1,2].map((q) => (shi[q]+slo[q])/2), hi: shi, index, lo: slo,
        size: [0,1,2].map((q) => shi[q]-slo[q]), triangles: group.length,
      };
      for (const f of group) { f.shell = index; f.shellInfo = info; }
      return info;
    });
}

/**
 * Round the folds, and only the folds.
 *
 * A bag modelled as flat panels meets itself at a crease with no transition,
 * which reads as folded card rather than as canvas with something in it. A few
 * passes of Laplacian smoothing weighted by how sharply the faces disagree at
 * each vertex rounds those and leaves the flat panels alone, because a vertex
 * whose neighbours are coplanar has nothing to move toward.
 *
 * Boundary vertices are pinned. A handle is a ribbon two triangles wide and its
 * long edges read every bit as sharp as a fold, so smoothing them would pull
 * the ribbon into a thread. An edge used by one face is an edge of the cloth
 * rather than a fold in it, so every vertex on one stays put.
 *
 * Normals are recomputed afterwards over the same welded topology, which is
 * what carries the rounding into the shading rather than leaving a smooth
 * silhouette over faceted light.
 */
export function roundCreases(faces, { iterations = 6, strength = 0.5, thresholdDegrees = 25 } = {}) {
  const key = (w) => `${Math.round(w[0]*1e4)},${Math.round(w[1]*1e4)},${Math.round(w[2]*1e4)}`;
  const index = new Map(), point = [], neighbours = [];
  for (const f of faces) {
    f.wid = [];
    for (let k = 0; k < 3; k += 1) {
      const kk = key(f.world[k]);
      let id = index.get(kk);
      if (id === undefined) { id = point.length; index.set(kk, id); point.push([...f.world[k]]); neighbours.push(new Set()); }
      f.wid.push(id);
    }
  }
  const edges = new Map();
  const bump = (a, b) => { const k = a < b ? `${a}:${b}` : `${b}:${a}`; edges.set(k, (edges.get(k) ?? 0) + 1); };
  const around = point.map(() => []);
  for (const f of faces) {
    const [a, b, c] = f.wid;
    neighbours[a].add(b); neighbours[a].add(c); neighbours[b].add(a);
    neighbours[b].add(c); neighbours[c].add(a); neighbours[c].add(b);
    bump(a, b); bump(b, c); bump(c, a);
    const n = faceNormal(f);
    around[a].push(n); around[b].push(n); around[c].push(n);
  }
  const onBoundary = new Uint8Array(point.length);
  for (const [k, count] of edges) if (count === 1) {
    const [a, b] = k.split(':').map(Number);
    onBoundary[a] = 1; onBoundary[b] = 1;
  }
  const limit = Math.cos((thresholdDegrees * Math.PI) / 180);
  const sharpness = new Float64Array(point.length);
  for (let i = 0; i < point.length; i += 1) {
    if (onBoundary[i]) continue;
    let worst = 1;
    const list = around[i];
    for (let a = 0; a < list.length; a += 1) for (let b = a + 1; b < list.length; b += 1) {
      const d = list[a][0]*list[b][0] + list[a][1]*list[b][1] + list[a][2]*list[b][2];
      if (d < worst) worst = d;
    }
    sharpness[i] = Math.min(1, Math.max(0, (limit - worst) / (limit + 1)));
  }
  for (let pass = 0; pass < iterations; pass += 1) {
    const next = point.map((w) => [...w]);
    for (let i = 0; i < point.length; i += 1) {
      const w = sharpness[i] * strength;
      if (w <= 0) continue;
      let a = 0, b = 0, c = 0, n = 0;
      for (const j of neighbours[i]) { a += point[j][0]; b += point[j][1]; c += point[j][2]; n += 1; }
      if (!n) continue;
      next[i] = [point[i][0]*(1-w)+(a/n)*w, point[i][1]*(1-w)+(b/n)*w, point[i][2]*(1-w)+(c/n)*w];
    }
    for (let i = 0; i < point.length; i += 1) point[i] = next[i];
  }
  for (const f of faces) for (let k = 0; k < 3; k += 1) f.world[k] = [...point[f.wid[k]]];

  const smoothed = point.map(() => [0, 0, 0]);
  for (const f of faces) {
    const n = faceNormal(f);
    for (const id of f.wid) for (let q = 0; q < 3; q += 1) smoothed[id][q] += n[q];
  }
  for (const s of smoothed) { const L = Math.hypot(...s) || 1; s[0] /= L; s[1] /= L; s[2] /= L; }
  for (const f of faces) {
    const ivm = inv4(f.m);
    for (let k = 0; k < 3; k += 1) {
      f.P[k] = mulP(ivm, f.world[k]);
      f.N[k] = mulN(ivm, smoothed[f.wid[k]]);
    }
  }
}
