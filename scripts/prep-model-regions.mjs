/**
 * Cutting every print zone down to the area that actually prints.
 *
 * A rectangle of the stated size, centred on the zone's own extent and nudged
 * by `offset`. Sized against the panel it sits on rather than written as
 * coordinates, so a panel that moves takes its print area with it.
 *
 * Called after any reshaping, because the rectangle is measured in final world
 * space against the surface it will actually sit on.
 */

import { along, axisBasis, faceInBox, splitFacesByPlane, tangentBasis } from "./prep-model-clip.mjs";

export function cutPrintRegions({ byZone, faces, regions }) {
  const rectangles = [];
  const unwrapBasis = new Map();
  for (const [zoneName, region] of Object.entries(regions ?? {})) {
    const target = byZone.get(zoneName);
    if (!target?.length) continue;
    // A region measures itself either down two world axes or, where the surface
    // is too curved for any of them, on a plane laid across the zone itself.
    const basis = region.axes === "tangent" ? tangentBasis(target) : axisBasis(region.axes);
    // `from` lets zones that are the same panel in mirror image share one box.
    // The tote's front and back sit 2mm apart in y, and measured apart they put
    // their print areas 2mm out of line with each other.
    const extent = (region.from ?? [zoneName]).flatMap((name) => byZone.get(name) ?? []);
    const lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
    for (const f of extent) for (const w of f.world) for (const [i, n] of [basis.u, basis.v].entries()) {
      const d = along(n, w);
      lo[i] = Math.min(lo[i], d); hi[i] = Math.max(hi[i], d);
    }
    const offset = region.offset ?? [0, 0];
    const min = [0, 1].map((i) => (lo[i] + hi[i]) / 2 + offset[i] - region.size[i] / 2);
    const max = [0, 1].map((i) => min[i] + region.size[i]);
    rectangles.push({ basis, max, min, outside: region.outside, shell: target[0].shell, zone: zoneName });
    // The unwrap has to use the same plane the cut used, or the print area is a
    // rectangle on the product and a slanted quadrilateral in the atlas -- which
    // is what took the sleeve patch's coverage down to 0.62.
    unwrapBasis.set(zoneName, basis);
  }

  if (rectangles.length) {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const f of faces) for (const w of f.world) for (let q = 0; q < 3; q += 1) {
      lo[q] = Math.min(lo[q], w[q]); hi[q] = Math.max(hi[q], w[q]);
    }
    // A millionth of the model's own size: far below any feature, far below the
    // weld the quality tests use, and enough that a face grazing a plane is not
    // sliced into a real piece and a splinter.
    const diagonal = Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) || 1;
    const tolerance = diagonal * 1e-6;
    // The distance the quality tests weld at. A split-off piece thinner than
    // this collapses when welded, and is dropped rather than shipped.
    const weld = diagonal * 1e-5;
    // Cut along every distinct plane once, then decide which side each face
    // fell on. Cutting rectangle by rectangle instead makes a later pass slice
    // on lines an earlier one has already laid vertices along, and a face lying
    // in a plane it is cut by comes out on both sides of it.
    const planes = [];
    for (const rect of rectangles) {
      for (const [i, normal] of [rect.basis.u, rect.basis.v].entries()) {
        for (const value of [rect.min[i], rect.max[i]]) {
          const same = (p) => p.shell === rect.shell && Math.abs(p.value - value) < 1e-9
            && p.normal.every((c, q) => Math.abs(c - normal[q]) < 1e-9);
          if (!planes.some(same)) planes.push({ normal, shell: rect.shell, value });
        }
      }
    }
    for (const [name, list] of byZone) {
      // Only faces on the shell a print sits on. A face on another connected
      // component shares no vertex with it, so there is no seam between them to
      // keep closed -- the tote's handles are their own shells and were being
      // subdivided for nothing. Everything else on the shell is cut whether it
      // prints or not, because two faces sharing an edge have to agree about
      // where that edge divides: cutting one side and not the other opened
      // 900mm of hairline crack down the tote's corners.
      let cut = list;
      for (const plane of planes) {
        const near = cut.filter((f) => f.shell === plane.shell);
        if (!near.length) continue;
        cut = [
          ...cut.filter((f) => f.shell !== plane.shell),
          ...splitFacesByPlane(near, plane.normal, plane.value, tolerance, weld),
        ];
      }
      byZone.set(name, cut);
    }
    for (const rect of rectangles) {
      const list = byZone.get(rect.zone) ?? [];
      const inside = list.filter((f) => faceInBox(f, rect.basis, rect.min, rect.max));
      const outside = list.filter((f) => !faceInBox(f, rect.basis, rect.min, rect.max));
      byZone.set(rect.zone, inside);
      if (!byZone.has(rect.outside)) byZone.set(rect.outside, []);
      byZone.get(rect.outside).push(...outside);
    }
  }
  return unwrapBasis;
}
