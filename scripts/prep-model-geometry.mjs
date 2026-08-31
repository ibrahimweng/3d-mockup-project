/**
 * The geometry a zone split needs before it can decide anything.
 *
 * Three questions live here, and all three are about the mesh rather than about
 * the product: which connected component each face belongs to, which of its
 * edges are folds a shading break belongs on, and which of its vertices are
 * near enough to one another to be the same vertex. `prep-model-zones.mjs` asks
 * them; the per-product scripts answer in terms of the answers.
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

export const faceNormal = (f) => {
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
 * Recompute the shading normals, keeping the creases that are real.
 *
 * A normal that jumps across an edge draws a line there. Where the geometry
 * turns -- a card's face meeting its rim at a right angle -- that line is the
 * edge and belongs. Where the geometry is flat it is a line over nothing, and
 * the ID card ships 38 of them along its rim, inherited from however the
 * original was authored.
 *
 * So each corner takes the average of the faces it can reach from its own face
 * without crossing an edge sharper than the threshold. Faces on the far side of
 * a crease keep their own answer, which is what leaves the crease sharp.
 */
export function smoothNormals(faces, { thresholdDegrees = 40 } = {}) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const f of faces) for (const w of f.world) for (let q = 0; q < 3; q += 1) {
    lo[q] = Math.min(lo[q], w[q]); hi[q] = Math.max(hi[q], w[q]);
  }
  const step = (Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) || 1) * 1e-5;
  const key = (w) => `${Math.round(w[0] / step)},${Math.round(w[1] / step)},${Math.round(w[2] / step)}`;
  const normals = faces.map(faceNormal);
  const limit = Math.cos((thresholdDegrees * Math.PI) / 180);

  // Which faces meet at each corner, and which pairs of them meet across an
  // edge soft enough to shade as one surface.
  const around = new Map();
  const edges = new Map();
  faces.forEach((f, i) => {
    const k = f.world.map(key);
    for (let c = 0; c < 3; c += 1) {
      (around.get(k[c]) ?? around.set(k[c], []).get(k[c])).push({ corner: c, face: i });
      const [a, b] = [k[c], k[(c + 1) % 3]];
      const ek = a < b ? `${a}|${b}` : `${b}|${a}`;
      (edges.get(ek) ?? edges.set(ek, []).get(ek)).push(i);
    }
  });
  const soft = new Map();
  for (const [ek, users] of edges) {
    if (users.length !== 2) continue;
    const [x, y] = users;
    const d = normals[x][0] * normals[y][0] + normals[x][1] * normals[y][1] + normals[x][2] * normals[y][2];
    if (d >= limit) soft.set(ek, [x, y]);
  }

  for (const [corner, uses] of around) {
    // Faces sharing this corner, joined where a soft edge through the corner
    // runs between them. Grouping by how alike two normals are instead is not
    // transitive: neighbours each inside the threshold of the next end up in
    // different groups, and the card came out with 164 lines where it had 38.
    const group = new Map(uses.map((u) => [u.face, u.face]));
    const root = (a) => { let n = a; while (group.get(n) !== n) n = group.get(n); return n; };
    for (const u of uses) {
      const k = faces[u.face].world.map(key);
      for (const c of [u.corner, (u.corner + 2) % 3]) {
        const [a, b] = [k[c], k[(c + 1) % 3]];
        const pair = soft.get(a < b ? `${a}|${b}` : `${b}|${a}`);
        if (!pair) continue;
        const [ra, rb] = pair.map((f) => (group.has(f) ? root(f) : null));
        if (ra !== null && rb !== null && ra !== rb) group.set(ra, rb);
      }
    }
    const sums = new Map();
    for (const u of uses) {
      const r = root(u.face);
      const sum = sums.get(r) ?? [0, 0, 0];
      for (let q = 0; q < 3; q += 1) sum[q] += normals[u.face][q];
      sums.set(r, sum);
    }
    for (const u of uses) {
      const sum = sums.get(root(u.face));
      const length = Math.hypot(...sum) || 1;
      faces[u.face].N[u.corner] = mulN(inv4(faces[u.face].m), sum.map((c) => c / length));
    }
  }
}
