/**
 * Folding a rim over, the way a garment's is.
 *
 * A panel cut out of a shell has a boundary one vertex thick, and from any
 * angle where it catches the light that reads as paper: cloth has a thickness,
 * and where it stops it is turned under and stitched rather than sliced. The
 * shirt is shot close up, which is exactly where that shows.
 *
 * So each rim gets the profile a hem has -- the cloth rolls over its own
 * thickness and runs back on the inside for the width of the hem. The roll
 * curls inward from the existing edge rather than out past it, because that is
 * what turning a hem does: the outermost point of the cloth stays where the
 * pattern put it.
 *
 * The rim stays an open edge afterwards. A hem does not close a garment; it
 * moves the raw edge inside where it is stitched down and never seen. Closing
 * it would mean giving the whole shell a thickness, which is a different and
 * much larger change.
 */

import { faceNormal, inv4, mulP } from "./prep-model-geometry.mjs";

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/**
 * The rims of a set of faces, longest first.
 *
 * A rim is a run of edges used by one face only, walked through the corners
 * they share. Longest first because that is how a product names them: the
 * mouth of a bag, the hem of a shirt, then its cuffs.
 *
 * Handed every face of the model, never one zone's. A zone's edge against its
 * neighbour is used by one face *of that zone* and by one of the neighbour's,
 * so looking at a zone alone reports the print areas cut out of it as rims and
 * hems the holes -- which on the shirt built a fold round the chest print and
 * left 583 edges used by more than two faces.
 */
export function boundaryLoops(faces, weld) {
  const key = (p) => `${Math.round(p[0] / weld)},${Math.round(p[1] / weld)},${Math.round(p[2] / weld)}`;
  const uses = new Map();
  for (const f of faces) {
    const k = f.world.map(key);
    for (let c = 0; c < 3; c += 1) {
      const a = k[c], b = k[(c + 1) % 3];
      const ek = a < b ? `${a}|${b}` : `${b}|${a}`;
      const seen = uses.get(ek);
      if (seen) seen.count += 1;
      else uses.set(ek, { at: [f.world[c], f.world[(c + 1) % 3]], count: 1, ends: [a, b], face: f, corner: c });
    }
  }
  const free = [...uses.values()].filter((e) => e.count === 1);
  const point = new Map();
  const nextAt = new Map();
  for (const e of free) {
    for (const [i, v] of e.ends.entries()) {
      point.set(v, e.at[i]);
      (nextAt.get(v) ?? nextAt.set(v, []).get(v)).push(e);
    }
  }
  // Which way is "into the cloth" at each rim corner: from the edge toward the
  // far corner of the one face that owns it, square to the edge itself.
  const inward = new Map();
  const normal = new Map();
  for (const e of free) {
    const [p, q] = e.at;
    const far = e.face.world[(e.corner + 2) % 3];
    const along = norm(sub(q, p));
    const raw = sub(far, p);
    const d = norm(sub(raw, scale(along, dot(raw, along))));
    const n = faceNormal(e.face);
    for (const v of e.ends) {
      inward.set(v, add(inward.get(v) ?? [0, 0, 0], d));
      normal.set(v, add(normal.get(v) ?? [0, 0, 0], n));
    }
  }

  const walked = new Set();
  const loops = [];
  for (const start of free) {
    if (walked.has(start)) continue;
    // Walk corner to corner. A rim is a cycle, so following the edge that is
    // not the one just used comes back to where it started.
    const order = [start.ends[0]];
    let edge = start, at = start.ends[1];
    walked.add(start);
    let length = 0;
    for (;;) {
      order.push(at);
      length += Math.hypot(...sub(point.get(order[order.length - 1]), point.get(order[order.length - 2])));
      const next = (nextAt.get(at) ?? []).find((e) => !walked.has(e));
      if (!next) break;
      walked.add(next);
      edge = next;
      at = edge.ends[0] === at ? edge.ends[1] : edge.ends[0];
    }
    if (order.length < 4) continue;
    loops.push({
      closed: order[0] === order[order.length - 1],
      length,
      zones: new Set(order.flatMap((v) => (nextAt.get(v) ?? []).map((e) => e.face.zone))),
      vertices: order.map((v) => ({
        inward: norm(inward.get(v)), key: v, normal: norm(normal.get(v)), world: point.get(v),
      })),
    });
  }
  return loops.sort((a, b) => b.length - a.length);
}

/**
 * The cross-section of a hem, as offsets from a rim corner and the direction
 * the surface faces at each of them.
 *
 * The shell is the outside of the cloth, so the edge is capped by a half circle
 * of the hem's own thickness that bulges *outwards*, and the band then runs
 * back along the inside for the width of the hem. Curling the cap inward
 * instead cuts a groove into the rim rather than rounding it off.
 *
 * Each step carries its own normal, taken from the cap's angle rather than from
 * the winding of the triangles built from it. Flat-shading a cap this small
 * turns it into a row of facets, and on the tote's 73-corner mouth that read as
 * a serrated edge -- worse than the paper edge it replaced.
 */
function profile(width, thickness, segments) {
  const radius = thickness / 2;
  const steps = [];
  for (let i = 0; i <= segments; i += 1) {
    const angle = (Math.PI * i) / segments;
    steps.push({
      alongNormal: radius * (Math.cos(angle) - 1),
      inward: -radius * Math.sin(angle),
      normalAlong: Math.cos(angle),
      normalInward: -Math.sin(angle),
    });
  }
  steps.push({ alongNormal: -thickness, inward: width, normalAlong: -1, normalInward: 0 });
  return steps;
}

/** Turn one rim into the strip of faces that folds it over. */
export function hemFaces(loop, { segments = 4, thickness, width }, template) {
  const steps = profile(width, thickness, segments);
  const at = (v, step) => add(v.world, add(scale(v.normal, step.alongNormal), scale(v.inward, step.inward)));
  const built = [];
  const ivm = inv4(template.m);
  const corner = (v, step) => ({
    N: norm(add(scale(v.normal, step.normalAlong), scale(v.inward, step.normalInward))),
    UV0: template.UV0[0],
    world: at(v, step),
  });
  const face = (a, b, c) => {
    built.push({
      C: [0, 1, 2].map((q) => (a.world[q] + b.world[q] + c.world[q]) / 3),
      m: template.m, N: [a.N, b.N, c.N], owner: template.owner,
      P: [a, b, c].map((v) => mulP(ivm, v.world)), shell: template.shell,
      shellInfo: template.shellInfo, source: template.source,
      UV0: [a.UV0, b.UV0, c.UV0], world: [a.world, b.world, c.world], WN: a.N,
    });
  };
  const ring = loop.vertices;
  for (let i = 0; i + 1 < ring.length; i += 1) {
    const [u, v] = [ring[i], ring[i + 1]];
    for (let s = 0; s + 1 < steps.length; s += 1) {
      const a = corner(u, steps[s]), b = corner(v, steps[s]);
      const c = corner(v, steps[s + 1]), d = corner(u, steps[s + 1]);
      face(a, b, c);
      face(a, c, d);
    }
  }
  return built;
}
