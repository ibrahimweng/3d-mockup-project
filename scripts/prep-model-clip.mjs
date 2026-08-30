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
 * Sutherland-Hodgman against one half-plane, given by a direction and how far
 * along it the plane sits.
 *
 * A crossing landing within `weld` of a corner it lies between is snapped to
 * that corner instead of being added as a new point. Left unsnapped it makes a
 * splinter: a piece a few millionths of a unit thick, whose corners weld into
 * two and whose two long edges then weld into one, so that edge comes out used
 * by four faces. Throwing the splinter away afterwards is worse, because its
 * long edge is a real edge and dropping it opens the seam.
 */
function clipHalfPlane(poly, normal, keepBelow, value, weld = 0) {
  const inside = (c) => (keepBelow ? along(normal, c.world) <= value : along(normal, c.world) >= value);
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
    const span = along(normal, b.world) - along(normal, a.world);
    if (span === 0) continue;
    const at = lerpCorner(a, b, (value - along(normal, a.world)) / span);
    if (apart(at, a) < weld) push(a);
    else if (apart(at, b) < weld) push(b);
    else push(at);
  }
  // The fan closes the polygon, so a repeat between the last point and the
  // first counts the same way the others do.
  while (out.length > 1 && apart(out[0], out[out.length - 1]) === 0) out.pop();
  return out;
}

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
  const out = [];
  for (const f of faces) {
    const poly = [0, 1, 2].map((k) => cornerAt(f, k));
    let mn = Infinity, mx = -Infinity;
    for (const c of poly) {
      const d = along(normal, c.world);
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
    if (mx <= value + tolerance || mn >= value - tolerance) { out.push(f); continue; }
    for (const keepBelow of [true, false]) {
      fanOut(f, clipHalfPlane(poly, normal, keepBelow, value, weld), out);
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
