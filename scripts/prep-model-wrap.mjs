/**
 * Unroll a closed, upright surface around its own cross-sections.
 *
 * A print zone is normally unwrapped by projecting it onto two world axes,
 * which is exactly right for a panel that is flat and wrong the moment the
 * panel turns. A tote bag printed edge to edge turns twice on every side: the
 * cloth rounds through the corner fold and carries on into the gusset. Project
 * a gusset onto the plane it faces and half its area arrives at an angle to
 * that plane -- measured on this bag, the typical face carried 1.42 times less
 * ink per square millimetre than the flat middle of the same panel, which is
 * the design squeezed into the folds.
 *
 * Cloth does not stretch, so what a design should follow is distance along the
 * cloth. That is what this measures: the model is sliced into horizontal rings,
 * each ring is walked round to give distance travelled, and a point's position
 * across its side is how far along its own ring it sits. A fold costs the
 * design exactly the cloth it takes up, and no more.
 *
 * Ring by ring rather than one outline for the whole model, because a tote is
 * not a prism: this one is 152mm deep at its base and 118mm at its mouth. One
 * outline stretched to fit them all measures a point near the mouth against a
 * cross-section a centimetre wider than the one it is actually on, and the
 * design arrives sheared.
 */

import { castOnto, frameOf, ringArc, sliceAt } from "./prep-model-rings.mjs";

const TAU = Math.PI * 2;

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * The four ways a side can face, in the order they come round the model and
 * with the quarter of the way round that each one's middle sits at. Clockwise
 * seen from above, starting at +x, because that is what makes a side's unwrap
 * run left to right for somebody standing in front of it.
 */
const FACES = { "+x": 0, "-z": 0.25, "-x": 0.5, "+z": 0.75 };

/**
 * Measure a model's rings, and answer where a point sits on it.
 *
 * `triangles` are the world-space corners of the surface to measure -- for the
 * tote, the bag without its handles, which stand outside the rings they would
 * otherwise widen. Angles are measured clockwise seen from above, starting at
 * +x, so a side's unwrap runs left to right as somebody facing that side sees
 * it.
 */
export function unrollAround(triangles, {
  axis = [0, 1, 0], bands = 64, bins = 720, seam = [1, 0, 0],
} = {}) {
  // Everything below works in the frame's own coordinates: across, along, and
  // up. `place` is the only thing that knows about world space.
  const frame = frameOf(axis, seam);
  const place = (w) => [dot(w, frame.one), dot(w, frame.up), dot(w, frame.two)];
  const local = triangles.map((t) => t.map(place));

  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const t of local) for (const p of t) for (let q = 0; q < 3; q += 1) {
    if (p[q] < lo[q]) lo[q] = p[q];
    if (p[q] > hi[q]) hi[q] = p[q];
  }
  const centre = [(lo[0] + hi[0]) / 2, 0, (lo[2] + hi[2]) / 2];
  const step = (hi[1] - lo[1]) / bands;
  const rings = Array.from({ length: bands }, () => new Float64Array(bins));
  for (const t of local) {
    let low = Infinity, high = -Infinity;
    for (const p of t) { if (p[1] < low) low = p[1]; if (p[1] > high) high = p[1]; }
    const from = Math.max(0, Math.ceil((low - lo[1]) / step - 0.5));
    const to = Math.min(bands - 1, Math.floor((high - lo[1]) / step - 0.5));
    for (let b = from; b <= to; b += 1) {
      const seg = sliceAt(t, lo[1] + (b + 0.5) * step);
      if (seg) {
        castOnto(rings[b], bins, [seg[0][0] - centre[0], seg[0][1] - centre[2]],
          [seg[1][0] - centre[0], seg[1][1] - centre[2]]);
      }
    }
  }
  /**
   * A slice that did not come back a ring is not one, and borrows the nearest
   * that did.
   *
   * Every slice of a closed surface is a closed ring, and most of what this
   * measures is closed over most of its length. A sleeve is not: it is a tube
   * cut off at the armhole along a curve that runs a third of the way back down
   * its own axis, so the slices through that end meet the cloth on some sides
   * and not others. Measured as if they were rings, the last third of the
   * sleeve is read off an outline stitched together from whichever rays
   * happened to hit, and the design there arrived at three times the ink of the
   * rest and thirty-five triangles of it backwards.
   */
  const whole = rings.map((row) => row.reduce((n, r) => n + (r > 0 ? 1 : 0), 0) > bins * 0.6);
  const first = whole.indexOf(true), last = whole.lastIndexOf(true);
  const nearest = (b) => {
    for (let away = 1; away < bands; away += 1) {
      if (whole[b - away]) return b - away;
      if (whole[b + away]) return b + away;
    }
    return b;
  };
  for (let b = 0; b < bands; b += 1) {
    if (!whole[b] && whole.some(Boolean)) rings[b] = rings[nearest(b)];
    // A ray that met nothing takes its neighbour's answer rather than the
    // middle of the model, which would fold the ring in on itself.
    for (let i = 0; i < bins * 2; i += 1) {
      const k = i % bins;
      if (!rings[b][k]) rings[b][k] = rings[b][(k + bins - 1) % bins];
    }
  }
  const arcs = rings.map((row) => ringArc(row, bins));

  const arcAt = (cum, angle) => {
    const x = ((((angle / TAU) * bins - 0.5) % bins) + bins) % bins;
    const i = Math.floor(x);
    return cum[i] + (x - i) * (cum[i + 1] - cum[i]);
  };

  /**
   * How much of the way round each side goes.
   *
   * A ring tells you where its own folds are -- the corner is the ray where the
   * ring reaches as far along x as it does along z, which is the diagonal of
   * the box it fits in. But taking that ring by ring puts the seam in a
   * different place at every height, and on this bag that is not a seam moving,
   * it is cloth moving between panels: the mouth is pinched, so the box
   * diagonal hands the gussets 150mm of cloth at the base and 107mm at the
   * mouth while the front keeps 300mm throughout. A design filling that gusset
   * is squeezed by two fifths on the way up.
   *
   * A sewn bag does not do that. Four panels are cut and stitched, and each one
   * keeps its share of the girth wherever the girth goes: the seam is a fixed
   * fraction of the way round at every height. So the fraction is measured off
   * every ring and the typical one is used for all of them, which leaves each
   * side varying by no more than the whole girth does -- an eighth on this bag,
   * against the two fifths the gussets suffered.
   */
  const share = (() => {
    const seen = [];
    for (let b = 0; b < bands; b += 1) {
      let x = 0, z = 0;
      for (let i = 0; i < bins; i += 1) {
        const angle = ((i + 0.5) / bins) * TAU;
        x = Math.max(x, Math.abs(rings[b][i] * Math.cos(angle)));
        z = Math.max(z, Math.abs(rings[b][i] * Math.sin(angle)));
      }
      const corner = Math.atan2(z, x);
      const round = arcs[b][bins];
      seen.push((((arcAt(arcs[b], corner) - arcAt(arcs[b], -corner)) % round) + round) % round / round);
    }
    return seen.sort((a, b) => a - b)[seen.length >> 1];
  })();
  /** Each side's share of a ring, in the order `FACES` names them. */
  const width = { 0: share, 0.25: 0.5 - share, 0.5: share, 0.75: 0.5 - share };

  /** Which ring a height sits between, as a whole band and a fraction of one. */
  const ringAt = (y) => {
    const x = Math.min(bands - 1, Math.max(0, (y - lo[1]) / step - 0.5));
    const b = Math.min(bands - 2, Math.floor(x));
    return [b, Math.min(1, Math.max(0, x - b))];
  };

  /**
   * How far round the model a point lies, as a fraction of its own ring.
   *
   * Measured from the +x ray, clockwise. The two rings either side of the point
   * are read on the same branch before they are mixed, so a point sitting on
   * the seam at the back does not average nearly none of the way round with
   * nearly all of it.
   */
  const roundAt = (world) => {
    const w = place(world);
    const [b, f] = ringAt(w[1]);
    const angle = Math.atan2(w[2] - centre[2], w[0] - centre[0]);
    const on = (i) => {
      const round = arcs[i][bins];
      return ((((arcAt(arcs[i], angle) - arcAt(arcs[i], 0)) % round) + round) % round) / round;
    };
    const a = on(b), c = on(b + 1);
    const gap = c - a - Math.round(c - a);
    return (((a + gap * f) % 1) + 1) % 1;
  };

  /** How far a point is from the middle of one side: -0.5 to 0.5 of the way round. */
  const offset = (w, middle) => ((((roundAt(w) - middle + 0.5) % 1) + 1) % 1) - 0.5;

  return {
    /**
     * One measurement per side: negative on that side's own cloth, positive off
     * it, zero on the fold between. For cutting the mesh along the folds before
     * anything is classified.
     *
     * A face belongs to the side its middle is on, so without a cut the
     * boundary between one side's design and the next steps in and out by
     * however big the triangles are. The folds are the smoothest part of the
     * bag and so the part the simplifier left the largest triangles on -- up to
     * 18mm across a 155mm gusset -- which is a zigzag anyone can see. Cut, the
     * boundary is the fold itself.
     *
     * How far from the middle rather than which way, so the measurement has no
     * second zero anywhere else on the bag to cut the far side open along.
     */
    seams() {
      return Object.values(FACES).map((middle) => {
        const half = width[middle] / 2;
        return (w) => Math.abs(offset(w, middle)) - half;
      });
    },
    /**
     * Which way is out from the axis at a point, in world space.
     *
     * A printed face looks this way. One that looks the other way is on the
     * inside of a fold -- a seam allowance tucked under, the crease inside an
     * underarm -- and an unwrap measured round the outside has nothing to say
     * about it, so its slice of the design arrives backwards.
     */
    outward(world) {
      const p = place(world);
      const across = p[0] - centre[0], round = p[2] - centre[2];
      const length = Math.hypot(across, round) || 1;
      return [0, 1, 2].map((q) => (frame.one[q] * across + frame.two[q] * round) / length);
    },
    /**
     * The stretch along the axis over which the slices did come back as rings,
     * in the same measurement `across` hands back as its second number.
     *
     * Outside it there is nothing to measure a way round from, so it is also
     * the stretch a design can cover. On a sleeve that is the cuff up to where
     * the armhole curve starts, which is the part of a sleeve that is a tube.
     */
    tube() {
      return [lo[1] + (first + 0.5) * step, lo[1] + (last + 0.5) * step];
    },
    /**
     * The line the count starts at, as a signed measurement to cut along.
     *
     * A zone that goes all the way round has to start and stop somewhere, and
     * where it does the coordinate jumps from one end of the design to the
     * other. Cut along this and the jump lands on an edge instead of across the
     * middle of a triangle, which would otherwise smear the whole design over
     * it. On a sleeve, this is the underarm seam.
     */
    start() {
      return (w) => dot(w, frame.two) - centre[2];
    },
    /**
     * How far round the model a point lies and how far along it, raw.
     *
     * For a zone that is a piece the modeller already cut -- a shirt's front
     * panel, one of its sleeves -- where the boundary is a real seam and the
     * caller has only to measure across what is inside it. `sector` is for a
     * model that arrives in one piece and has to be divided.
     */
    across() {
      return (w) => [roundAt(w), dot(w, frame.up)];
    },
    /**
     * Which of the four sides a point is on, named by the way that side faces.
     *
     * The same fraction the unwrap uses, so what a face is classified as and
     * where the unwrap puts it cannot disagree: a side ends exactly where the
     * next one's cloth begins.
     */
    facing(w) {
      const round = roundAt(w);
      for (const [face, middle] of Object.entries(FACES)) {
        if (Math.abs(((((round - middle + 0.5) % 1) + 1) % 1) - 0.5) <= width[middle] / 2) return face;
      }
      return "+x";
    },
    /**
     * One side's unwrap: how far across the cloth between that side's two folds
     * a point lies, and how high it is.
     *
     * Across comes back as a fraction of the way between the side's two folds:
     * 0 at one fold, 1 at the other, and a little outside where a face hangs
     * over one. A face belongs to the side its middle is on, and the folds are
     * the smoothest part of the bag and so the part the simplifier left the
     * largest triangles on -- up to 18mm across a 155mm gusset -- so a few at
     * each fold reach three per cent past the end of their own side. That cloth
     * takes the last column of its own side's design, which is what a clamped
     * sampler gives it. Height is left in world units, which is the part a
     * projection can already do.
     */
    sector(face) {
      const middle = FACES[face];
      const span = width[middle];
      return (w) => [0.5 + offset(w, middle) / span, dot(w, frame.up)];
    },
  };
}
