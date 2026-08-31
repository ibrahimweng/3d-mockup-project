/**
 * Flatten a patch of surface, so a square printed on it arrives a square.
 *
 * Every unwrap before this one measured the model along something chosen from
 * outside it -- two world axes, or distance round a ring and up an axis -- and
 * a measurement is only as good as its agreement with the cloth. Where they
 * disagree the design pays: a shirt's neckline fans out because the coordinate
 * up the panel is height above the floor and the cloth there turns over the
 * shoulder, covering a lot of itself in very little height.
 *
 * What a flattening does instead is ask the surface. Cut a patch from a
 * garment, lay it on a table, and the shape it settles into is the answer; the
 * only reason it is not exact is that a shoulder is not developable and
 * something has to give. This finds the map that gives up as little as
 * possible: every triangle wants to arrive congruent to itself, and where two
 * neighbours cannot both have that, the disagreement is spread between them
 * rather than dumped on one.
 *
 * The method is as-rigid-as-possible parameterisation (Liu, Zhang, Xu, Gotsman
 * and Gortler, 2008). Each round fits the closest rotation to every triangle's
 * current map, then solves one linear system for the layout that best matches
 * all of them at once. It needs a starting guess and a patch it can flatten --
 * a disc, so a sleeve has to arrive already cut along its underarm -- and it
 * keeps the guess's orientation, so what was the top of a panel stays the top.
 */

/** Two vectors' dot and cross, in the plane. */
const dot2 = (a, b) => a[0] * b[0] + a[1] * b[1];
const cross2 = (a, b) => a[0] * b[1] - a[1] * b[0];

/**
 * One vertex per corner that is really the same corner.
 *
 * By position, and by the starting guess as well -- which is what keeps a cut
 * open. A sleeve is a tube until it is cut along the underarm, and after the
 * cut the two lips still sit on the same millimetre of the model. Welded on
 * position alone the tube closes up again and no flattening exists; the guess
 * is what tells them apart, because the whole point of that seam is that the
 * design's two ends meet there.
 */
function weldCorners(world, guess, span) {
  const step = (span || 1) * 1e-5;
  const at = new Map();
  const index = world.map(() => [0, 0, 0]);
  const points = [];
  const starts = [];
  for (let f = 0; f < world.length; f += 1) {
    for (let k = 0; k < 3; k += 1) {
      const p = world[f][k], g = guess[f][k];
      const key = `${Math.round(p[0] / step)},${Math.round(p[1] / step)},${Math.round(p[2] / step)}`
        + `|${Math.round(g[0] * 1e3)},${Math.round(g[1] * 1e3)}`;
      let id = at.get(key);
      if (id === undefined) {
        id = points.length;
        at.set(key, id);
        points.push(p);
        starts.push(g);
      }
      index[f][k] = id;
    }
  }
  return { index, points, starts };
}

/**
 * A triangle laid flat on its own, and the cotangents of its three angles.
 *
 * The flat copy is what every triangle is trying to arrive as, so it is built
 * once and never changes; the cotangents are the weights that decide, when two
 * neighbours pull in different directions, which of them gives way. They are
 * the standard ones: a sliver's long thin angle has a large cotangent and holds
 * its shape, a fat one gives.
 */
function layFlat(a, b, c) {
  const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const len = Math.hypot(...e1) || 1;
  const u = e1.map((v) => v / len);
  const along = e2[0] * u[0] + e2[1] * u[1] + e2[2] * u[2];
  const off = [e2[0] - along * u[0], e2[1] - along * u[1], e2[2] - along * u[2]];
  const flat = [[0, 0], [len, 0], [along, Math.hypot(...off)]];
  const cot = [];
  for (let i = 0; i < 3; i += 1) {
    const p = flat[i], q = flat[(i + 1) % 3], r = flat[(i + 2) % 3];
    const x = [q[0] - p[0], q[1] - p[1]], y = [r[0] - p[0], r[1] - p[1]];
    const area = Math.abs(cross2(x, y));
    cot.push(area > 1e-18 ? dot2(x, y) / area : 0);
  }
  return { cot, flat };
}

/**
 * Solve the layout, by conjugate gradients on the cotangent Laplacian.
 *
 * The matrix is the same every round -- only the right-hand side moves -- and
 * it is sparse and symmetric, so this never builds it: `apply` walks the
 * triangles and accumulates, which is the matrix-vector product and all that
 * conjugate gradients needs. One vertex is pinned, because a layout plus a
 * constant is the same layout and an unpinned system has nowhere to start.
 */
function solve(apply, b, x0, pin, rounds) {
  const n = b.length;
  const x = Float64Array.from(x0);
  const r = new Float64Array(n), p = new Float64Array(n), q = new Float64Array(n);
  apply(x, r);
  for (let i = 0; i < n; i += 1) r[i] = b[i] - r[i];
  r[pin] = 0;
  p.set(r);
  let rr = 0;
  for (let i = 0; i < n; i += 1) rr += r[i] * r[i];
  const stop = rr * 1e-12;
  for (let step = 0; step < rounds && rr > stop; step += 1) {
    apply(p, q);
    q[pin] = 0;
    let pq = 0;
    for (let i = 0; i < n; i += 1) pq += p[i] * q[i];
    if (Math.abs(pq) < 1e-30) break;
    const alpha = rr / pq;
    for (let i = 0; i < n; i += 1) { x[i] += alpha * p[i]; r[i] -= alpha * q[i]; }
    let next = 0;
    for (let i = 0; i < n; i += 1) next += r[i] * r[i];
    const beta = next / rr;
    for (let i = 0; i < n; i += 1) p[i] = r[i] + beta * p[i];
    rr = next;
  }
  return x;
}

/** The rotation closest to a 2x2 map, in closed form. */
function closestRotation(j) {
  const angle = Math.atan2(j[2] - j[1], j[0] + j[3]);
  return [Math.cos(angle), -Math.sin(angle), Math.sin(angle), Math.cos(angle)];
}

/**
 * Put the answer back the way round the guess had it.
 *
 * A flattening is only settled up to a turn of the whole panel: nothing in the
 * energy prefers one. The guess does -- it is where the top of the panel and
 * the direction a design reads were decided -- so the layout is turned to sit
 * as close to it as a single rotation can, which is the ordinary orthogonal
 * Procrustes fit.
 */
function faceTheSameWay(points, guess) {
  const mid = (ps) => {
    const m = [0, 0];
    for (const p of ps) { m[0] += p[0]; m[1] += p[1]; }
    return [m[0] / ps.length, m[1] / ps.length];
  };
  const a = mid(points), b = mid(guess);
  let sum = 0, diff = 0;
  for (let i = 0; i < points.length; i += 1) {
    const x = [points[i][0] - a[0], points[i][1] - a[1]];
    const y = [guess[i][0] - b[0], guess[i][1] - b[1]];
    sum += dot2(x, y); diff += cross2(x, y);
  }
  const angle = Math.atan2(diff, sum);
  const cos = Math.cos(angle), sin = Math.sin(angle);
  return points.map((p) => {
    const x = p[0] - a[0], y = p[1] - a[1];
    return [x * cos - y * sin, x * sin + y * cos];
  });
}

/**
 * Flatten one zone, starting from whatever unwrap it already had.
 *
 * `world` and `guess` are per face, three corners each. The answer comes back
 * the same shape, in the model's own units -- so the aspect it reports is the
 * shape the panel really is, which is what a print template has to be cut to.
 */
export function flattenZone(world, guess, { rounds = 24, span = 1 } = {}) {
  const { index, points, starts } = weldCorners(world, guess, span);
  const tris = world.map((t, f) => ({ ...layFlat(t[0], t[1], t[2]), at: index[f] }));

  // One coordinate at a time through the same matrix; assembling it twice would
  // be the same walk done twice for no reason.
  const n = points.length;
  /**
   * How many steps the solve is allowed, from how big the patch is.
   *
   * Conjugate gradients stops on its own when the residual is small, so this is
   * only a ceiling -- but a ceiling too low is a solve that returns something
   * that is not the answer, and it does not announce itself. At a flat 240 the
   * tote's back panel came back at 1.13 times the ink in its tightest hundredth
   * against 1.01 for its front, which is the same panel measured the same way
   * and simply not finished.
   */
  const solves = 200 + 8 * Math.ceil(Math.sqrt(n));
  const apply = (v, out) => {
    out.fill(0);
    for (const { at, cot } of tris) {
      for (let i = 0; i < 3; i += 1) {
        const j = at[(i + 1) % 3], k = at[(i + 2) % 3];
        const w = cot[i] * (v[j] - v[k]);
        out[j] += w; out[k] -= w;
      }
    }
  };

  let ux = Float64Array.from(starts.map((g) => g[0]));
  let uy = Float64Array.from(starts.map((g) => g[1]));
  const bx = new Float64Array(n), by = new Float64Array(n);
  for (let round = 0; round < rounds; round += 1) {
    bx.fill(0); by.fill(0);
    for (const { at, cot, flat } of tris) {
      // The map this triangle is currently under, as one 2x2, then the rotation
      // nearest it. Fitting a rotation rather than any old map is the whole
      // idea: a rotation is the one thing that leaves a square a square.
      const j = [0, 0, 0, 0];
      for (let i = 0; i < 3; i += 1) {
        const a = at[(i + 1) % 3], b = at[(i + 2) % 3];
        const dx = ux[a] - ux[b], dy = uy[a] - uy[b];
        const fx = flat[(i + 1) % 3][0] - flat[(i + 2) % 3][0];
        const fy = flat[(i + 1) % 3][1] - flat[(i + 2) % 3][1];
        j[0] += cot[i] * dx * fx; j[1] += cot[i] * dx * fy;
        j[2] += cot[i] * dy * fx; j[3] += cot[i] * dy * fy;
      }
      const r = closestRotation(j);
      for (let i = 0; i < 3; i += 1) {
        const a = at[(i + 1) % 3], b = at[(i + 2) % 3];
        const fx = flat[(i + 1) % 3][0] - flat[(i + 2) % 3][0];
        const fy = flat[(i + 1) % 3][1] - flat[(i + 2) % 3][1];
        const wx = cot[i] * (r[0] * fx + r[1] * fy);
        const wy = cot[i] * (r[2] * fx + r[3] * fy);
        bx[a] += wx; bx[b] -= wx;
        by[a] += wy; by[b] -= wy;
      }
    }
    ux = solve(apply, bx, ux, 0, solves);
    uy = solve(apply, by, uy, 0, solves);
  }

  const laid = faceTheSameWay([...ux].map((x, i) => [x, uy[i]]), starts);
  return world.map((_, f) => index[f].map((id) => laid[id]));
}
