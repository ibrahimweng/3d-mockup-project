/**
 * One flattening for a whole piece of cloth, however many zones it is cut into.
 *
 * A zone is a print area: the front of a shirt, the band round its hem, the
 * facings turned under that. Those are three zones and one piece of cotton, and
 * flattening each on its own is what makes an all-over pattern jump at the line
 * between them.
 *
 * It jumps because a flattening is only settled up to a rigid motion. Each
 * patch is relaxed from its own starting guess and comes to rest wherever that
 * guess left it, so two patches cut from the same cloth arrive in two frames
 * that have nothing to do with each other. Measured on the shirt, across the 59
 * vertices the front panel shares with the band below it, the two agreed with
 * each other to 0.9mm and sat 237mm apart -- one constant, unrecoverable from
 * either patch alone, and a pattern shifted by a quarter of a metre at the hem.
 *
 * So the pieces are laid out together. `weldCorners` inside the flattening
 * already tells two corners apart by their starting guess as well as by their
 * position, so faces from different zones that meet on the same millimetre of
 * cloth with the same guess are one vertex to it: hand it every face of the
 * piece at once and it relaxes them as the one surface they are. The zones then
 * take their own slice of the answer, and every slice is in the same frame.
 *
 * What still separates is what a garment separates: a sleeve is measured round
 * its own axis rather than round the body, so its guess disagrees with the
 * body's everywhere and it comes out a piece of its own. That is a seam on a
 * real shirt too.
 */

import { flattenZone } from "./prep-model-flatten.mjs";

/**
 * One face's three corners, all on the same side of the join.
 *
 * The same rule the per-zone unwrap uses, and it has to be the same one: a
 * measurement that goes all the way round starts over somewhere, and a face
 * lying across that line gets one corner at nearly none of the way round and
 * another at nearly all of it. Corners short of half way go round once more,
 * which is also what keeps the join open when the pieces are welded -- the two
 * lips of the cut hold different guesses and stay apart.
 */
function cornersOf(face, at) {
  const corners = face.world.map((w) => at(w, face));
  const us = corners.map((c) => c[0]);
  if (Math.max(...us) - Math.min(...us) <= 0.5) return corners;
  return corners.map((c) => (c[0] < 0.5 ? [c[0] + 1, c[1]] : c));
}

/**
 * Flatten every piece of cloth the zones declare, and hand back where each
 * face landed.
 *
 * A zone opts in with `cloth`, naming the piece it is part of. Zones naming the
 * same piece must be measured the same way round it, because the measurement is
 * what tells the flattening which faces are the same cloth.
 *
 * The answer is keyed by face, so a zone reads back exactly the corners it
 * contributed and nothing else.
 */
export function layCloth(byZone, zones, cloth, span) {
  const pieces = new Map();
  for (const [zoneName, faces] of byZone) {
    // A name, or a way of telling face by face: a shirt's cuffs are one zone
    // and two pieces, because the same band of cotton is sewn to the end of
    // each sleeve and the two sleeves are cut separately.
    const of = zones[zoneName]?.cloth;
    if (!of) continue;
    for (const face of faces) {
      const piece = typeof of === "function" ? of(face) : of;
      if (!piece || !cloth?.[piece]) continue;
      pieces.set(piece, (pieces.get(piece) ?? []).concat([face]));
    }
  }

  const placed = new Map();
  for (const [name, faces] of pieces) {
    // The piece's own measurement rather than whichever of its zones happened
    // to be reached first: they are one piece precisely because one
    // measurement describes all of them, and which zone supplies it must not
    // depend on the order a map iterates in.
    const at = cloth[name];
    const laid = flattenZone(
      faces.map((f) => f.world),
      faces.map((f) => cornersOf(f, at)),
      { span },
    );
    for (const [i, face] of faces.entries()) placed.set(face, laid[i]);
    console.log(`  ${String(name).padEnd(20)} ${String(faces.length).padStart(6)} tris  laid as one piece`);
  }
  return placed;
}
