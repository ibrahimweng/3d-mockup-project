import * as THREE from "three";

import type { DeviceSurface } from "../product-domain";

/**
 * The table, written out rather than assembled from boxes.
 *
 * A tabletop needs its map in the table's own units and its edge turned rather
 * than cut, and a leg needs shared normals down its length; neither is
 * something a box helper will give you. Every face here is emitted with the
 * coordinates it actually wants, which is the only reason the arris carries
 * the grain over it and the posts read as turned metal.
 */

/**
 * How much narrower a leg is at the floor than at the top.
 *
 * A quarter was too much: read against a rail that is the same width all the
 * way along, a post losing a quarter of itself over its drop stops looking
 * turned and starts looking melted. Furniture legs are rarely parallel and
 * rarely dramatic — a tenth is enough to keep the highlight from running
 * dead straight, which is the only job the taper has.
 */
const LEG_TAPER = 0.88;
export function createSurfaceGeometry(
  surface: DeviceSurface,
  radius: number,
  legs: boolean,
  bevel: number,
): THREE.BufferGeometry {
  const west = -surface.left * radius;
  const east = surface.right * radius;
  const north = -surface.back * radius;
  const south = surface.front * radius;
  const top = surface.top * radius;
  // Sized against the subject rather than against the top, because the top
  // runs out of frame and would give a chamfer you could sit on.
  const ease = Math.min(radius * 0.04 * bevel, top * 0.45);
  // UVs are divided through by one length in both directions, so texels come
  // out square and a material declares one repeat count rather than two.
  const across = east - west;

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  type Point = readonly [number, number, number];

  /**
   * One quad, with its map read off whichever pair of axes it actually spans.
   *
   * This is the whole reason the geometry is written out rather than assembled
   * from boxes. A face needs its texture in the table's own units, and which
   * two coordinates carry it depends on which way the face points: a top is
   * read with x and z, a side with one of those and height. Share one set of
   * coordinates across both — which is what happens if the corners of the top
   * are reused for the sides beneath them — and the side gets no variation
   * down its height at all, so a single row of the map is smeared the whole
   * depth of the edge. On a tabletop that edge is the most looked-at surface
   * in the frame.
   */
  const quad = (a: Point, b: Point, c: Point, d: Point): void => {
    const base = positions.length / 3;
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const normal = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0],
    ].map(Math.abs);
    const flat = normal[1] >= normal[0] && normal[1] >= normal[2];
    const sideways = !flat && normal[0] >= normal[2];
    for (const [x, y, z] of [a, b, c, d]) {
      positions.push(x, y, z);
      if (flat) {
        uvs.push((x - west) / across, (z - north) / across);
      } else if (sideways) {
        // Facing along x, so width comes from z and the rest is the drop —
        // offset so the top of the face continues the top surface's own
        // reading rather than restarting at nought.
        uvs.push((z - north) / across, (a[0] - west - y) / across);
      } else {
        uvs.push((x - west) / across, (a[2] - north - y) / across);
      }
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };

  /** The four corners of the outline, inset by `offset`, at height `y`. */
  const ring = (offset: number, y: number): Point[] => [
    [west + offset, y, north + offset],
    [east - offset, y, north + offset],
    [east - offset, y, south - offset],
    [west + offset, y, south - offset],
  ];

  /**
   * A turned leg: a tapered post with enough sides to read as round.
   *
   * Built with shared vertices around the circumference rather than through
   * `quad`, because these are the one part of the table that should *not* be
   * flat shaded. Averaged normals give a post a continuous highlight running
   * down it, which is what says metal; four flat faces give four flat tones
   * and a black rectangle, which is what the first pass at these looked like
   * and what makes them read as bars drawn on the picture.
   *
   * The taper is small and does most of the work. Furniture legs are almost
   * never parallel-sided — the eye reads a perfectly parallel post as a pipe —
   * and a few percent over their length is enough.
   */
  const post = (
    centreX: number,
    centreZ: number,
    wide: number,
    high: number,
    low: number,
  ): void => {
    const SIDES = 14;
    const base = positions.length / 3;
    for (const [level, scale] of [
      [high, 1],
      [low, LEG_TAPER],
    ] as const) {
      for (let side = 0; side <= SIDES; side += 1) {
        const turn = (side / SIDES) * Math.PI * 2;
        positions.push(
          centreX + Math.cos(turn) * wide * scale,
          level,
          centreZ + Math.sin(turn) * wide * scale,
        );
        uvs.push((side / SIDES) * ((wide * 6) / across), (high - level) / across);
      }
    }
    const ring = SIDES + 1;
    for (let side = 0; side < SIDES; side += 1) {
      const a = base + side;
      const b = a + 1;
      const c = a + ring;
      const d = c + 1;
      indices.push(a, c, d, a, d, b);
    }
    // Capped top and bottom: the underside of a table is a place a low camera
    // goes, and an open tube there is worse than no leg at all.
    for (const [level, scale, up] of [
      [high, 1, true],
      [low, LEG_TAPER, false],
    ] as const) {
      const centre = positions.length / 3;
      positions.push(centreX, level, centreZ);
      uvs.push(0.5, 0.5);
      const rim = positions.length / 3;
      for (let side = 0; side <= SIDES; side += 1) {
        const turn = (side / SIDES) * Math.PI * 2;
        positions.push(
          centreX + Math.cos(turn) * wide * scale,
          level,
          centreZ + Math.sin(turn) * wide * scale,
        );
        uvs.push(0.5 + Math.cos(turn) * 0.5, 0.5 + Math.sin(turn) * 0.5);
      }
      for (let side = 0; side < SIDES; side += 1) {
        if (up) indices.push(centre, rim + side, rim + side + 1);
        else indices.push(centre, rim + side + 1, rim + side);
      }
    }
  };

  if (legs) {
    const thick = surface.leg * radius;
    // Flush: the leg's outer faces sit in the same plane as the top's sides.
    //
    // Not a style choice so much as the placement with no failure mode. A leg
    // set well under a top is hidden by that top from every camera above it,
    // so what reaches the frame is a post apparently starting in mid-air —
    // the join, which is the thing that says the leg belongs to the table, is
    // the one part never in view. Coplanar, the silhouette carries straight on
    // down and there is nothing left to hide.
    const floor = -surface.stand * radius;
    // Tucked into each corner so the post is tangent to both edges: flush with
    // the silhouette, and not hanging off it the way a circle inscribed on the
    // corner point itself would.
    for (const x of [west + thick, east - thick]) {
      for (const z of [north + thick, south - thick]) {
        post(x, z, thick, -top, floor);
      }
    }
    /**
     * The frame the legs are actually attached to.
     *
     * Without it the table is a slab resting on four posts that touch it and
     * nothing more: no bracket, no rail, no reason the thing stands up. That
     * is what "unreal" looks like on furniture — not the wrong proportion but
     * an absent joint. A rail set back from the edge is how every steel-framed
     * table of this kind is built, it puts a shadow line under the top so the
     * top reads as floating rather than as painted on, and it gives each post
     * something to run into instead of stopping in mid-air.
     *
     * Narrower than the posts and tucked inside their line, so from any camera
     * above the floor the silhouette is still four legs and a top; the frame
     * is what you find when you look under it.
     */
    const railHalf = thick * 0.5;
    const railDrop = thick * 2.3;
    // Buried a little way into the top rather than hung below it. Standing the
    // rail off by even a fraction leaves a slot you can see the room through,
    // and against a lit backdrop that is not a shadow line under a floating
    // top — it is a hard white stripe the width of the table. Overlapping also
    // keeps the two faces out of the same plane, so neither flickers against
    // the other.
    const railTop = -top + thick * 0.12;
    const railFoot = -top - railDrop;
    const bar = (x0: number, x1: number, z0: number, z1: number): void => {
      const upper: Point[] = [
        [x0, railTop, z0],
        [x1, railTop, z0],
        [x1, railTop, z1],
        [x0, railTop, z1],
      ];
      const lower: Point[] = [
        [x0, railFoot, z0],
        [x1, railFoot, z0],
        [x1, railFoot, z1],
        [x0, railFoot, z1],
      ];
      quad(upper[0], upper[3], upper[2], upper[1]);
      for (let corner = 0; corner < 4; corner += 1) {
        const next = (corner + 1) % 4;
        quad(upper[corner], upper[next], lower[next], lower[corner]);
      }
      quad(lower[0], lower[1], lower[2], lower[3]);
    };
    for (const z of [north + thick, south - thick]) {
      bar(west + thick, east - thick, z - railHalf, z + railHalf);
    }
    for (const x of [west + thick, east - thick]) {
      bar(x - railHalf, x + railHalf, north + thick, south - thick);
    }
  } else {
    // An inset top face, an arris rounded away from it, the sides, and a
    // closed underside — because with legs there is an angle that sees it.
    //
    // The arris is turned rather than cut flat. A single chamfer facet has one
    // normal down its whole length, so on anything polished it is one long
    // mirror pointed in one direction: the steel top came out with a blown
    // white band running the entire front edge, at the same brightness end to
    // end, with the brush lines aliasing into a barcode inside it. Real eased
    // edges are a radius, and a radius turns the reflection into a gradient
    // that is only fully bright where it actually faces the light.
    const ROUND = 4;
    const levels: Point[][] = [];
    for (let step = 0; step <= ROUND; step += 1) {
      const turn = (step / ROUND) * (Math.PI / 2);
      levels.push(ring(ease * (1 - Math.sin(turn)), -ease * (1 - Math.cos(turn))));
    }
    const face = levels[0];
    const brim = levels[ROUND];
    const under = ring(0, -top);
    quad(face[0], face[3], face[2], face[1]);
    // Written out with shared vertices rather than through `quad`, because the
    // whole point is that the normals blend across it. Independent faces would
    // give four narrow mirrors in place of one wide one.
    const arris = positions.length / 3;
    for (const level of levels) {
      for (const [x, y, z] of level) {
        positions.push(x, y, z);
        uvs.push((x - west) / across, (z - north) / across);
      }
    }
    for (let step = 0; step < ROUND; step += 1) {
      for (let corner = 0; corner < 4; corner += 1) {
        const next = (corner + 1) % 4;
        const upper = arris + step * 4;
        const lower = arris + (step + 1) * 4;
        indices.push(
          upper + corner, upper + next, lower + next,
          upper + corner, lower + next, lower + corner,
        );
      }
    }
    for (let corner = 0; corner < 4; corner += 1) {
      const next = (corner + 1) % 4;
      quad(brim[corner], brim[next], under[next], under[corner]);
    }
    quad(under[0], under[1], under[2], under[3]);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(positions), 3),
  );
  geometry.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(uvs), 2));
  geometry.setIndex(indices);
  // Flat, because the arris is the point. Smoothing it away would average the
  // top into the chamfer and put a soft gradient where the highlight belongs.
  geometry.computeVertexNormals();
  return geometry;
}
