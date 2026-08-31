/**
 * Cutting a mesh against a print area.
 *
 * A print zone is a rectangle because a printer's platen is a rectangle, and
 * the artwork has to stop where the platen does. Deciding that per whole
 * triangle would leave the print edge a sawtooth at triangle scale, so
 * triangles crossing the line are split and the boundary is the line itself.
 *
 * The rectangle also has to sit somewhere the surface still faces the way it is
 * projected. Where a panel curves past that -- the sides of a shirt's chest,
 * the underside of a sleeve -- its triangles project back to front, and the
 * slice of artwork on them reads mirrored.
 */

import { faceNormal, inv4, mulP } from "./prep-model-geometry.mjs";

const AXIS = { x: 0, y: 1, z: 2 };

/** How far along a direction a point lies. */
export const along = (n, w) => n[0] * w[0] + n[1] * w[1] + n[2] * w[2];

/** The pair of directions a zone is measured and unwrapped across. */
export function axisBasis([uAxis, vAxis]) {
  const unit = (axis) => [0, 1, 2].map((q) => (q === AXIS[axis] ? 1 : 0));
  return { u: unit(uAxis), v: unit(vAxis) };
}

/** One vertex of a face being cut, carrying everything the rebuild needs. */
const cornerAt = (f, k) => ({ N: f.N[k], UV0: f.UV0[k], world: f.world[k] });

function lerpCorner(a, b, t) {
  const mix = (p, q) => p.map((v, i) => v + (q[i] - v) * t);
  return { N: mix(a.N, b.N), UV0: mix(a.UV0, b.UV0), world: mix(a.world, b.world) };
}

/**
 * Sutherland-Hodgman against one half of a cut, given as a signed depth: a
 * number that is negative on one side of the cut, positive on the other, and
 * zero on it.
 *
 * A crossing landing within `weld` of a corner it lies between is snapped to
 * that corner instead of being added as a new point. Left unsnapped it makes a
 * splinter: a piece a few millionths of a unit thick, whose corners weld into
 * two and whose two long edges then weld into one, so that edge comes out used
 * by four faces. Throwing the splinter away afterwards is worse, because its
 * long edge is a real edge and dropping it opens the seam.
 */
function clipHalf(poly, depth, keepBelow, weld = 0) {
  const inside = (c) => (keepBelow ? depth(c) <= 0 : depth(c) >= 0);
  /**
   * Where along an edge the cut falls.
   *
   * One step of proportion, then three of secant. A flat cut is found exactly
   * by the first and the rest do not move it; a cut that follows a surface is
   * not, and the corner it leaves has to land on the cut rather than merely
   * near it. Near it is enough to draw and not enough to cut along twice: the
   * next pass sees a corner a tenth of a millimetre off the line, slices there
   * too, and leaves a splinter between the two. Cutting this tote's four folds
   * that way opened 262 free edges in a mesh that had none.
   *
   * Walked from whichever end of the edge sorts first, never from whichever end
   * this triangle happens to start at. The two faces either side of an edge
   * meet it in opposite directions, and starting from opposite ends of a
   * measurement that changes quickly lands in different places and tears them
   * apart. This way both get the same answer to the last bit.
   */
  const meet = (from, to) => {
    const [a, b] = order(from.world) > order(to.world) ? [to, from] : [from, to];
    let lowT = 0, highT = 1, low = depth(a), high = depth(b);
    let t = low / (low - high);
    for (let step = 0; step < 3; step += 1) {
      const d = depth(lerpCorner(a, b, t));
      if (d === 0) break;
      if ((d < 0) === (low < 0)) { lowT = t; low = d; } else { highT = t; high = d; }
      t = lowT + ((highT - lowT) * low) / (low - high);
    }
    return lerpCorner(a, b, t);
  };
  const out = [];
  const push = (c) => {
    const last = out[out.length - 1];
    if (!last || apart(last, c) > 0) out.push(c);
  };
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const aIn = inside(a), bIn = inside(b);
    if (aIn) push(a);
    if (aIn === bIn) continue;
    if (depth(a) === depth(b)) continue;
    const at = meet(a, b);
    if (apart(at, a) < weld) push(a);
    else if (apart(at, b) < weld) push(b);
    else push(at);
  }
  // The fan closes the polygon, so a repeat between the last point and the
  // first counts the same way the others do.
  while (out.length > 1 && apart(out[0], out[out.length - 1]) === 0) out.pop();
  return out;
}

/** A point's place in a fixed order, so an edge can be walked the same way twice. */
const order = (w) => `${w[0]},${w[1]},${w[2]}`;

const apart = (a, b) => Math.hypot(
  a.world[0] - b.world[0], a.world[1] - b.world[1], a.world[2] - b.world[2],
);

function fanOut(f, poly, into) {
  if (poly.length < 3) return;
  const ivm = inv4(f.m);
  for (let i = 1; i + 1 < poly.length; i += 1) {
    const corners = [poly[0], poly[i], poly[i + 1]];
    into.push({
      C: [0, 1, 2].map((q) => corners.reduce((sum, c) => sum + c.world[q] / 3, 0)),
      m: f.m,
      N: corners.map((c) => c.N),
      owner: f.owner,
      P: corners.map((c) => mulP(ivm, c.world)),
      shell: f.shell,
      shellInfo: f.shellInfo,
      UV0: corners.map((c) => c.UV0),
      world: corners.map((c) => [...c.world]),
      WN: f.WN,
    });
  }
}

/**
 * Cut a zone against a rectangle in the two axes it unwraps across.
 *
 * A print zone is a rectangle because a printer's platen is a rectangle, and
 * the artwork has to stop where the platen does. Deciding that per whole
 * triangle would leave the print edge a sawtooth at triangle scale, so
 * triangles crossing the line are split and the boundary is the line itself.
 *
 * The rectangle also has to be somewhere the surface still faces the way it is
 * projected. Where a panel curves past that -- the sides of a shirt's chest,
 * the underside of a sleeve -- its triangles project back to front, and the
 * slice of artwork on them reads mirrored.
 */
export function splitFacesByPlane(faces, normal, value, tolerance = 0, weld = 0) {
  return splitFacesByField(faces, (w) => along(normal, w) - value, tolerance, weld);
}

/**
 * Cut every face along a line drawn on the surface itself.
 *
 * `depth` is negative on one side of the cut, positive on the other, and zero
 * on it. It need not be flat: a tote's four folds run up a bag that tapers, so
 * they lean, and no plane passes through one. A triangle is a couple of
 * millimetres of a surface the measurement varies smoothly over, so one step
 * along an edge already finds the crossing closely and `meet` finishes it.
 *
 * This is what makes a zone boundary a line rather than a sawtooth. Deciding
 * per whole triangle which side of a fold it is on leaves the design's edge
 * stepping in and out by however big the triangles are, and the folds are the
 * smoothest part of a bag and so the part a simplifier leaves the largest
 * triangles on -- 18mm of zigzag on a 155mm gusset.
 */
export function splitFacesByField(faces, depth, tolerance = 0, weld = 0) {
  const out = [];
  const at = (c) => depth(c.world);
  for (const f of faces) {
    const poly = [0, 1, 2].map((k) => cornerAt(f, k));
    let mn = Infinity, mx = -Infinity;
    for (const c of poly) {
      const d = at(c);
      mn = Math.min(mn, d); mx = Math.max(mx, d);
    }
    // Wholly on one side, or straddling by less than the tolerance: pass it
    // through. A face lying in the plane satisfies both halves, and clipping it
    // against both emits it twice, leaving every edge it owns used by four
    // faces. A face crossing by a hair is worse: it splits into a real piece and
    // a sliver of about 1e-12 area, whose three corners then weld to two points
    // and whose edges collapse onto a neighbour's. Nine of the shirt's edges
    // ended up used by four and six faces that way, all at one spot.
    //
    // The tolerance is a millionth of the model's own size -- far below any
    // feature, and far below the weld, so a neighbour cut at a point this one
    // was not still closes up.
    if (mx <= tolerance || mn >= -tolerance) { out.push(f); continue; }
    for (const keepBelow of [true, false]) {
      fanOut(f, clipHalf(poly, at, keepBelow, weld), out);
    }
  }
  return out;
}

/**
 * A plane laid on the surface itself, for a zone too curved to project down an
 * axis.
 *
 * A sleeve is a cone lying at an angle to every world axis, so projecting it
 * down one hits the cloth edge-on over much of the patch and the artwork there
 * is squeezed: measured, the tightest one per cent of the patch carried 1.6
 * times the ink per square millimetre that the middle did, and shrinking the
 * patch barely moved it, because the fault is the direction rather than the
 * size. Projecting onto the patch's own average normal takes that out.
 *
 * The second axis is world up, leaned into the plane, so a design still arrives
 * the right way up rather than rotated by however the surface happens to sit.
 */
export function tangentBasis(faces) {
  const sum = [0, 0, 0];
  for (const f of faces) {
    const n = faceNormal(f);
    for (let q = 0; q < 3; q += 1) sum[q] += n[q];
  }
  const length = Math.hypot(...sum) || 1;
  const normal = sum.map((c) => c / length);
  const up = Math.abs(normal[1]) > 0.95 ? [0, 0, 1] : [0, 1, 0];
  const dot = up[0] * normal[0] + up[1] * normal[1] + up[2] * normal[2];
  const raw = up.map((c, q) => c - dot * normal[q]);
  const vLen = Math.hypot(...raw) || 1;
  const v = raw.map((c) => c / vLen);
  const u = [
    v[1] * normal[2] - v[2] * normal[1],
    v[2] * normal[0] - v[0] * normal[2],
    v[0] * normal[1] - v[1] * normal[0],
  ];
  return { u, v };
}

/** Whether a face sits inside a rectangle, once every cut has been made. */
export function faceInBox(f, basis, min, max) {
  const c = [basis.u, basis.v].map((n) => f.world.reduce((sum, w) => sum + along(n, w) / 3, 0));
  return c[0] >= min[0] && c[0] <= max[0] && c[1] >= min[1] && c[1] <= max[1];
}

/**
 * Cut a mesh along every line its zones will be divided on, and leave it sound.
 *
 * Before anything is classified, because these are the boundaries the
 * classifier is about to use: cutting first is what lets it answer per whole
 * triangle and still land exactly on the line. `cutPrintRegions` cuts later and
 * for a different reason -- it takes a rectangle out of a zone that has already
 * been chosen.
 *
 * Three passes, and each earns its place.
 *
 * The mend before, because a simplifier leaves triangles with their three
 * corners nearly in a line, and one of those crossing a seam hangs half its
 * length over it.
 *
 * The cut with no tolerance. On a plane, passing through a face that straddles
 * by a millionth costs nothing, because its neighbours straddle by the same
 * millionth and are passed through too. On a cut that follows a surface they
 * are not, and every face passed through beside one that was cut leaves their
 * shared edge split on one side only: at a millionth of a turn round a tote,
 * 20 free edges, and at a ten-thousandth, 123. The snap is what keeps the
 * splinters out instead -- a crossing landing within it of a corner takes that
 * corner, so the cut wanders by up to that much and never leaves a piece
 * thinner than it.
 *
 * And the mend again after, on what the cut itself left: a crossing landing
 * just outside the snap adds a corner a hundredth of a millimetre from one
 * already there, and the needle that leaves shades against all three of its
 * neighbours -- six lines drawn over flat cloth along a tote's base seam.
 *
 * Returns the snap, because anything the cut may move a corner by is also
 * something the weld afterwards has to close: two corners a snap apart are the
 * same corner, and left unfused they shade as two.
 */
export function cutAlongSeams(faces, seams) {
  const mended = mendSlivers(faces);
  if (mended) console.log(`  mended ${mended} slivers left over from simplifying`);
  if (!seams?.length) return 0;

  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const f of faces) for (const w of f.world) for (let q = 0; q < 3; q += 1) {
    lo[q] = Math.min(lo[q], w[q]); hi[q] = Math.max(hi[q], w[q]);
  }
  const snap = (Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) || 1) * 2e-5;
  const was = faces.length;
  let cut = faces;
  for (const seam of seams) cut = splitFacesByField(cut, seam, 0, snap);
  faces.length = 0;
  faces.push(...cut);
  console.log(`  cut ${faces.length - was} faces out of the seams`);

  const after = mendSlivers(faces);
  if (after) console.log(`  mended ${after} slivers the cut left`);
  return snap;
}
