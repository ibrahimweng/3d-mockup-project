/**
 * Slicing a surface into rings, and walking one to measure it.
 *
 * The pieces `prep-model-wrap.mjs` builds an unroll out of, kept apart from it
 * because they are about geometry and it is about what a design should follow.
 */

const TAU = Math.PI * 2;

const cross2 = (a, b) => a[0] * b[1] - a[1] * b[0];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (v) => { const l = Math.hypot(...v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0],
];

/**
 * The axis of a limb, and its middle: which way a sleeve or a leg runs.
 *
 * From the middle of the fifth nearest the body to the middle of the fifth
 * furthest from it, which on a sleeve is armhole to cuff. Taking the direction
 * the piece is most spread along instead -- the obvious thing, and what a first
 * version did -- gives an axis six degrees steeper, because a flared sleeve is
 * spread across as much as along. Six degrees is enough to walk the axis out
 * through the cloth: the nearest point of the surface fell to 2mm from it, and
 * a ring measured about an axis lying on its own surface spins.
 *
 * `outward` points from the body towards the free end, and only its direction
 * is read -- it is what decides which fifth is which.
 */
export function limbAxis(points, outward) {
  const centre = [0, 1, 2].map((q) => points.reduce((sum, p) => sum + p[q], 0) / points.length);
  const reach = points.map((p) => dot(p, outward)).sort((a, b) => a - b);
  const middle = (of) => {
    const some = points.filter(of);
    return [0, 1, 2].map((q) => some.reduce((sum, p) => sum + p[q], 0) / some.length);
  };
  const near = middle((p) => dot(p, outward) <= reach[Math.floor(reach.length * 0.2)]);
  const far = middle((p) => dot(p, outward) >= reach[Math.floor(reach.length * 0.8)]);
  const along = [0, 1, 2].map((q) => far[q] - near[q]);
  const length = Math.hypot(...along) || 1;
  return { axis: along.map((c) => c / length), centre };
}

/**
 * The frame a model is measured in: rings lie across `axis`, and the count
 * round them starts at `from` and turns the way a clock does seen from along
 * the axis.
 *
 * Both are worth stating rather than assuming world up and world +x. A sleeve
 * is a tube lying at an angle to every world axis, so its rings are not
 * horizontal ones; and where the count starts is where a design that goes all
 * the way round has its seam, which for a sleeve is the underarm.
 */
export function frameOf(axis, from) {
  const up = unit(axis);
  const along = dot(from, up);
  const one = unit(from.map((c, q) => c - along * up[q]));
  return { one, two: cross(up, one), up };
}


/**
 * Where a triangle crosses a horizontal plane: two points, or nothing.
 *
 * A closed surface cut by a plane gives closed rings, so every ray from a
 * point inside meets one -- which is what lets a ring be read off by angle
 * below with none of it going missing.
 */
export function sliceAt(t, y) {
  const out = [];
  for (let k = 0; k < 3; k += 1) {
    const a = t[k], b = t[(k + 1) % 3];
    if ((a[1] > y) === (b[1] > y)) continue;
    const f = (y - a[1]) / (b[1] - a[1]);
    out.push([a[0] + (b[0] - a[0]) * f, a[2] + (b[2] - a[2]) * f]);
  }
  return out.length === 2 ? out : null;
}

/**
 * How far out the surface is, along every ray this segment crosses.
 *
 * The furthest hit wins. A bag is closed, so a ray leaving the middle passes
 * through the lining before it reaches the outside, and it is the outside that
 * is printed on.
 */
export function castOnto(row, bins, A, B) {
  const start = Math.atan2(A[1], A[0]);
  let turn = Math.atan2(B[1], B[0]) - start;
  // The short way round: a slice of one triangle is a few millimetres of a ring
  // hundreds of millimetres across, never the long way.
  while (turn > Math.PI) turn -= TAU;
  while (turn < -Math.PI) turn += TAU;
  const AB = [B[0] - A[0], B[1] - A[1]];
  const first = Math.ceil((Math.min(start, start + turn) / TAU) * bins - 0.5);
  const last = Math.floor((Math.max(start, start + turn) / TAU) * bins - 0.5);
  for (let i = first; i <= last; i += 1) {
    const angle = ((i + 0.5) / bins) * TAU;
    const ray = [Math.cos(angle), Math.sin(angle)];
    const den = cross2(AB, ray);
    if (den === 0) continue;
    const t = -cross2(A, ray) / den;
    const r = (A[0] + AB[0] * t) * ray[0] + (A[1] + AB[1] * t) * ray[1];
    const b = ((i % bins) + bins) % bins;
    if (r > row[b]) row[b] = r;
  }
}

/** Distance travelled round one ring, from the middle of bin zero. */
export function ringArc(row, bins) {
  const at = (i) => {
    const angle = ((i + 0.5) / bins) * TAU;
    return [row[i] * Math.cos(angle), row[i] * Math.sin(angle)];
  };
  const cum = new Float64Array(bins + 1);
  for (let i = 0; i < bins; i += 1) {
    const a = at(i), b = at((i + 1) % bins);
    cum[i + 1] = cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return cum;
}
