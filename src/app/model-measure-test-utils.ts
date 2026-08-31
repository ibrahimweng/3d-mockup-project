import type { Triangle, Vec2, Vec3 } from "./model-file-test-utils";

/**
 * What a bag of triangles measures.
 *
 * The invariants in `docs/merchandise-models.md` are all statements about these
 * numbers, so they are computed once here rather than re-derived per test. Two
 * choices are worth knowing:
 *
 * Positions are welded before anything topological is asked of them. The models
 * come out of prep with split vertices along every texture seam, so two faces
 * that meet in space hold different indices for the same corner; without
 * welding, every seam would read as a hole.
 *
 * The weld is a fraction of the model's own diagonal, never a fixed distance.
 * These files disagree about units by three orders of magnitude — the water
 * bottle is 0.13 across and the tablet folder is 38 — so one absolute tolerance
 * is far too loose for one and far too tight for the other. A fixed tolerance
 * was what made an earlier probe report 404 non-manifold edges and 1,759
 * coincident faces on the bottle: at 1e-4 it was fusing vertices a thousandth
 * of the bottle apart, and the defects were the measurement's, not the file's.
 *
 * Nothing is measured per node. A part is a connected component of the whole
 * scene, because that is what a part is: the clasp of the ID card shares no
 * vertex with the card, whatever the node tree says about them.
 */

/** A hundred-thousandth of the diagonal: far above float noise, far below any
 * feature a modeller would author. */
const WELD_FRACTION = 1e-5;

/** The distance below which two corners of this model are the same corner. */
export function weldStepOf(triangles: Triangle[]): number {
  const lo: Vec3 = [Infinity, Infinity, Infinity];
  const hi: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const t of triangles) {
    for (const p of t.position) {
      for (let i = 0; i < 3; i += 1) {
        lo[i] = Math.min(lo[i], p[i]);
        hi[i] = Math.max(hi[i], p[i]);
      }
    }
  }
  const diagonal = Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
  return (diagonal || 1) * WELD_FRACTION;
}

function weldKeyAt(step: number): (p: Vec3) => string {
  return (p) => `${Math.round(p[0] / step)},${Math.round(p[1] / step)},${Math.round(p[2] / step)}`;
}

function faceNormal(t: Triangle): Vec3 {
  const [a, b, c] = t.position;
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n: Vec3 = [
    u[1] * v[2] - u[2] * v[1],
    u[2] * v[0] - u[0] * v[2],
    u[0] * v[1] - u[1] * v[0],
  ];
  const length = Math.hypot(n[0], n[1], n[2]) || 1;
  return [n[0] / length, n[1] / length, n[2] / length];
}

function worldArea(t: Triangle): number {
  const [a, b, c] = t.position;
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  return 0.5 * Math.hypot(
    u[1] * v[2] - u[2] * v[1],
    u[2] * v[0] - u[0] * v[2],
    u[0] * v[1] - u[1] * v[0],
  );
}

/** Signed, so its sign says which way round the triangle reads in the atlas. */
/**
 * How far from square one triangle's slice of the design arrives.
 *
 * `stretch` measures ink per square millimetre, which is area, and area cannot
 * see a square delivered as a rectangle: halve one side, double the other, and
 * the density is unchanged. That is exactly the fault a checkerboard shows and
 * the number missed -- the shirt's neckline read 1.25 while its checks were
 * drawn out into stripes.
 *
 * So this reads the map itself. The triangle is laid flat on its own, which is
 * exact for one triangle, and the linear map from that copy to the atlas has
 * two singular values: how much the design is scaled along each of two
 * perpendicular directions. Their ratio is 1 when a square arrives a square,
 * whatever size it arrives at.
 */
function mapOf(t: Triangle): number[] | null {
  const [a, b, c] = t.position;
  const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const len = Math.hypot(...e1);
  if (len < 1e-9) return null;
  const unit = e1.map((v) => v / len);
  const along = e2[0] * unit[0] + e2[1] * unit[1] + e2[2] * unit[2];
  const off = Math.hypot(...e2.map((v, i) => v - along * unit[i]));
  if (off < 1e-9) return null;
  // Edges of the flat copy, and of its slice of the atlas, then the map
  // between them: [du1 du2] = J [dx1 dx2], so J is the one divided by the other.
  const uv = t.uv as [Vec2, Vec2, Vec2];
  const d1 = [uv[1][0] - uv[0][0], uv[1][1] - uv[0][1]];
  const d2 = [uv[2][0] - uv[0][0], uv[2][1] - uv[0][1]];
  const j = [
    d1[0] / len, (d2[0] - (along / len) * d1[0]) / off,
    d1[1] / len, (d2[1] - (along / len) * d1[1]) / off,
  ];
  return j;
}

/** The two scales a 2x2 map applies, largest first. */
function scalesOf(j: number[]): [number, number] {
  const frobenius = j[0] * j[0] + j[1] * j[1] + j[2] * j[2] + j[3] * j[3];
  const determinant = Math.abs(j[0] * j[3] - j[1] * j[2]);
  const gap = Math.sqrt(Math.max(0, frobenius * frobenius - 4 * determinant * determinant));
  return [
    Math.sqrt(Math.max(0, (frobenius + gap) / 2)),
    Math.sqrt(Math.max(0, (frobenius - gap) / 2)),
  ];
}

/**
 * Every triangle's squareness, after allowing for the shape of the panel.
 *
 * A zone's unwrap fills a 0 to 1 square whatever shape the panel is, so a
 * gusset 158mm wide and 375mm tall is stretched by two and a half on its way
 * into the atlas. That is not distortion: the design is authored at the panel's
 * own proportions -- the template says 158 by 375 -- and the two cancel. Read
 * without allowing for it, a perfectly flat ID card scores 1.59, which is its
 * own aspect ratio and nothing to do with the unwrap.
 *
 * So the one stretch that best explains the whole panel is divided out first,
 * found by trying candidates and keeping the one that leaves the least
 * distortion behind. What is left is the part that varies from triangle to
 * triangle, which is the part a checkerboard shows.
 */
function squarenessAcross(maps: number[][]): number[] {
  if (maps.length === 0) return [];
  const worst = (k: number): number => {
    let sum = 0;
    for (const j of maps) {
      const [big, small] = scalesOf([j[0] * k, j[1] * k, j[2], j[3]]);
      if (small > 1e-12) sum += Math.log(big / small) ** 2;
    }
    return sum;
  };
  let best = 1;
  for (let pass = 0, span = 4, step = 0.05; pass < 3; pass += 1, step /= 8) {
    let found = best, low = worst(best);
    for (let e = -span; e <= span; e += step) {
      const k = best * Math.exp(e * Math.LN2 / 4);
      const here = worst(k);
      if (here < low) { low = here; found = k; }
    }
    best = found;
    span = step * 8;
  }
  const out: number[] = [];
  for (const j of maps) {
    const [big, small] = scalesOf([j[0] * best, j[1] * best, j[2], j[3]]);
    if (small > 1e-12) out.push(big / small);
  }
  return out;
}

function signedUvArea(uv: [Vec2, Vec2, Vec2]): number {
  const [a, b, c] = uv;
  return 0.5 * ((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]));
}

function degreesBetween(a: Vec3, b: Vec3): number {
  const dot = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  return (Math.acos(dot) * 180) / Math.PI;
}

/** Disjoint sets over vertex keys, so a component is found in one pass. */
function makeUnionFind(): { join: (a: string, b: string) => void; rootOf: (a: string) => string } {
  const parent = new Map<string, string>();
  const rootOf = (a: string): string => {
    let node = parent.get(a) ?? a;
    while (node !== (parent.get(node) ?? node)) {
      const next = parent.get(node) ?? node;
      parent.set(node, parent.get(next) ?? next);
      node = parent.get(node) ?? node;
    }
    parent.set(a, node);
    return node;
  };
  return {
    join: (a, b) => {
      const ra = rootOf(a);
      const rb = rootOf(b);
      if (ra !== rb) parent.set(ra, rb);
    },
    rootOf,
  };
}

/** One connected component: a part the modeller actually built as one piece. */
export type ShellSummary = {
  /** Where its middle sits, so a shell can be named in a failure message. */
  center: Vec3;
  /** How many triangles each material claims inside this one part. */
  materials: Record<string, number>;
  size: Vec3;
  triangles: number;
};

/** Every part of a model, largest first. */
export function shellsOf(triangles: Triangle[]): ShellSummary[] {
  const weldKey = weldKeyAt(weldStepOf(triangles));
  const sets = makeUnionFind();
  for (const t of triangles) {
    const [a, b, c] = t.position.map(weldKey);
    sets.join(a, b);
    sets.join(a, c);
  }
  const byRoot = new Map<string, Triangle[]>();
  for (const t of triangles) {
    const root = sets.rootOf(weldKey(t.position[0]));
    const bucket = byRoot.get(root);
    if (bucket) bucket.push(t);
    else byRoot.set(root, [t]);
  }
  const shells = [...byRoot.values()].map((group) => {
    const lo: Vec3 = [Infinity, Infinity, Infinity];
    const hi: Vec3 = [-Infinity, -Infinity, -Infinity];
    const materials: Record<string, number> = {};
    for (const t of group) {
      materials[t.material] = (materials[t.material] ?? 0) + 1;
      for (const p of t.position) {
        for (let i = 0; i < 3; i += 1) {
          lo[i] = Math.min(lo[i], p[i]);
          hi[i] = Math.max(hi[i], p[i]);
        }
      }
    }
    const round = (n: number): number => Number(n.toFixed(3));
    return {
      center: [round((lo[0] + hi[0]) / 2), round((lo[1] + hi[1]) / 2), round((lo[2] + hi[2]) / 2)] as Vec3,
      materials,
      size: [round(hi[0] - lo[0]), round(hi[1] - lo[1]), round(hi[2] - lo[2])] as Vec3,
      triangles: group.length,
    };
  });
  return shells.sort((a, b) => b.triangles - a.triangles);
}

export type UvSummary = {
  /**
   * Atlas area the unwrap fills, summed over its triangles. A zone that fills
   * its own 0 to 1 square exactly once reads 1.
   */
  coverage: number;
  /** Separate pieces in the atlas. More than one cuts artwork across a gap. */
  islands: number;
  /** Triangles reading the wrong way round, counted as the smaller side. */
  mirroredTriangles: number;
  /** The box the unwrap occupies, as `[minU, minV, maxU, maxV]`. */
  range: [number, number, number, number];
  /**
   * How far from square the design arrives, at the 99th percentile.
   *
   * 1 means a printed square is a square. Separate from `stretch`, which is
   * about how much design lands per square millimetre and is blind to a square
   * arriving as a rectangle of the same area.
   */
  squareness: number;
  /** Atlas area per unit of surface at the 99th percentile over the median. */
  stretch: number;
};

/**
 * How one zone's unwrap behaves. Null when the zone carries no UVs.
 *
 * Takes the zone's triangles already selected, because which triangles belong
 * to a zone is a product question -- a slot can name `material@mesh` to claim
 * one mesh out of a file that paints everything with a single material -- and
 * this module only measures what it is handed.
 */
export function uvOf(zone: Triangle[]): UvSummary | null {
  const mine = zone.filter((t) => t.uv);
  if (mine.length === 0) return null;
  const lo: Vec2 = [Infinity, Infinity];
  const hi: Vec2 = [-Infinity, -Infinity];
  const density: number[] = [];
  const maps: number[][] = [];
  let coverage = 0;
  let flipped = 0;
  for (const t of mine) {
    const uv = t.uv as [Vec2, Vec2, Vec2];
    const signed = signedUvArea(uv);
    if (signed < 0) flipped += 1;
    coverage += Math.abs(signed);
    const surface = worldArea(t);
    if (surface > 1e-9) density.push(Math.abs(signed) / surface);
    const map = mapOf(t);
    if (map !== null) maps.push(map);
    for (const p of uv) {
      for (let i = 0; i < 2; i += 1) {
        lo[i] = Math.min(lo[i], p[i]);
        hi[i] = Math.max(hi[i], p[i]);
      }
    }
  }
  density.sort((a, b) => a - b);
  const square = squarenessAcross(maps).sort((a, b) => a - b);
  const median = density[Math.floor(density.length / 2)] || 1;
  const round = (n: number): number => Number(n.toFixed(3));
  return {
    coverage: round(coverage),
    islands: uvIslandsOf(mine),
    mirroredTriangles: Math.min(flipped, mine.length - flipped),
    range: [round(lo[0]), round(lo[1]), round(hi[0]), round(hi[1])],
    squareness: Number((square[Math.floor(square.length * 0.99)] ?? 1).toFixed(2)),
    stretch: Number((density[Math.floor(density.length * 0.99)] / median).toFixed(2)),
  };
}

/** Pieces of the atlas that share no corner, so artwork cannot run between. */
function uvIslandsOf(triangles: Triangle[]): number {
  const sets = makeUnionFind();
  const key = (p: Vec2): string => `${p[0].toFixed(5)},${p[1].toFixed(5)}`;
  for (const t of triangles) {
    const uv = t.uv as [Vec2, Vec2, Vec2];
    sets.join(key(uv[0]), key(uv[1]));
    sets.join(key(uv[0]), key(uv[2]));
  }
  const roots = new Set<string>();
  for (const t of triangles) roots.add(sets.rootOf(key((t.uv as [Vec2, Vec2, Vec2])[0])));
  return roots.size;
}

export type EdgeSummary = {
  /** Edges used by exactly one face: a real opening, or a hole. */
  boundary: number;
  /** Interior edges by how hard the two faces meet, in degrees. */
  byAngle: { flat: number; hard: number; sharp: number; soft: number };
  interior: number;
  /** Edges used by three or more faces. */
  nonManifold: number;
  /** Shading breaks where the geometry is flat: a line drawn on nothing. */
  splitsOnFlat: number;
  /** Shading breaks at a material border. */
  splitsAtMaterialBorder: number;
};

/**
 * Every edge, and what the two faces either side of it agree about.
 *
 * A model can look creased for two unrelated reasons, and they need opposite
 * fixes. A *shading* break is stored normals disagreeing across an edge the
 * geometry says is flat, and it is fixed in the normals. A *geometric* crease
 * is the faces genuinely meeting at an angle, and no amount of normal work
 * softens it; the geometry needs a radius. So the two are counted apart.
 */
export function edgesOf(triangles: Triangle[]): EdgeSummary {
  const weldKey = weldKeyAt(weldStepOf(triangles));
  const uses = new Map<string, { corner: number; face: number }[]>();
  const keys = triangles.map((t) => t.position.map(weldKey));
  triangles.forEach((_, face) => {
    for (let corner = 0; corner < 3; corner += 1) {
      const a = keys[face][corner];
      const b = keys[face][(corner + 1) % 3];
      const edge = a < b ? `${a}|${b}` : `${b}|${a}`;
      const bucket = uses.get(edge);
      if (bucket) bucket.push({ corner, face });
      else uses.set(edge, [{ corner, face }]);
    }
  });
  const normals = triangles.map(faceNormal);
  const storedAt = (face: number, key: string): Vec3 | null => {
    const at = keys[face].indexOf(key);
    return at < 0 ? null : (triangles[face].normal?.[at] ?? null);
  };
  const summary: EdgeSummary = {
    boundary: 0,
    byAngle: { flat: 0, hard: 0, sharp: 0, soft: 0 },
    interior: 0,
    nonManifold: 0,
    splitsAtMaterialBorder: 0,
    splitsOnFlat: 0,
  };
  for (const [edge, faces] of uses) {
    if (faces.length === 1) {
      summary.boundary += 1;
      continue;
    }
    if (faces.length > 2) {
      summary.nonManifold += 1;
      continue;
    }
    summary.interior += 1;
    const [first, second] = faces;
    const angle = degreesBetween(normals[first.face], normals[second.face]);
    if (angle < 10) summary.byAngle.flat += 1;
    else if (angle < 30) summary.byAngle.soft += 1;
    else if (angle < 45) summary.byAngle.sharp += 1;
    else summary.byAngle.hard += 1;
    let split = 0;
    for (const key of edge.split("|")) {
      const a = storedAt(first.face, key);
      const b = storedAt(second.face, key);
      if (a && b) split = Math.max(split, degreesBetween(a, b));
    }
    if (split <= 5) continue;
    if (triangles[first.face].material !== triangles[second.face].material) {
      summary.splitsAtMaterialBorder += 1;
    } else if (angle < 10) {
      summary.splitsOnFlat += 1;
    }
  }
  return summary;
}

export type GeometrySummary = {
  /** Faces sitting on the same three corners. They fight over the same pixels. */
  coincident: number;
  /** Of those, the pairs wearing different materials, which fight visibly. */
  coincidentAcrossMaterials: number;
  /** Triangles with no area. */
  degenerate: number;
};

export function geometryOf(triangles: Triangle[]): GeometrySummary {
  const weldKey = weldKeyAt(weldStepOf(triangles));
  const seen = new Map<string, string[]>();
  let coincident = 0;
  let coincidentAcrossMaterials = 0;
  let degenerate = 0;
  for (const t of triangles) {
    if (worldArea(t) < 1e-12) degenerate += 1;
    const key = t.position.map(weldKey).sort().join("/");
    const before = seen.get(key);
    if (!before) {
      seen.set(key, [t.material]);
      continue;
    }
    coincident += 1;
    if (before.some((material) => material !== t.material)) coincidentAcrossMaterials += 1;
    before.push(t.material);
  }
  return { coincident, coincidentAcrossMaterials, degenerate };
}
