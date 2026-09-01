import type { DeviceId } from "./product-domain";

/**
 * What the merchandise models measure today, and what they have to reach.
 *
 * `docs/merchandise-models.md` states the invariants in prose; this is the same
 * list as numbers. Every entry is a ratchet. The test asserts the measurement
 * equals the baseline exactly, so a value moving in either direction fails and
 * names itself: a regression is caught the day it lands, and an improvement has
 * to be written down here before it can merge. That is the whole point — the
 * models have been repaired one symptom at a time before, and each repair
 * silently undid an earlier one.
 *
 * A phase edits only the baselines it is fixing. Anything already at target is
 * additionally held to the target itself, so it can never be loosened back.
 */

/**
 * Zones whose printable area is a panel the garment was cut from rather than a
 * rectangle a printer holds under a head.
 *
 * The coverage bar below assumes a print area is a rectangle, and for a platen,
 * a card face or a side of a tote it is. A shirt panel is not: it has a neck
 * curve and two armholes cut out of it, and a sleeve is a tube whose top is cut
 * along the armhole curve. Their unwraps fill their own square exactly as much
 * as their silhouettes fill their own bounding box -- 0.875 on the front, 0.879
 * on the back, 0.903 and 0.909 on the sleeves -- and no unwrap can raise that
 * without stretching the design into the shoulders. So the corners of a design
 * land where the neck and the armholes are, which is what printing a rectangle
 * on a cut panel does.
 *
 * Listed one by one, each with what its own silhouette allows, rather than
 * lowering the bar for everything: every other zone in the catalog is a
 * rectangle and has to stay at 0.95.
 */
export const CUT_PANELS: Readonly<Record<string, number>> = {
  // A tote's panel is a rectangle of canvas until it is sewn round a base and
  // pulled in at the mouth. Flattened it is the shape the cloth really is,
  // which is a little wider at the bottom than the top and does not fill the
  // box drawn round it.
  Bag_Back: 0.93,
  Bag_Front: 0.93,
  Bag_Left: 0.93,
  Bag_Right: 0.93,
  Shirt_Back: 0.8,
  Shirt_Front: 0.8,
  // A sleeve is the least rectangular panel in the catalog: a tube at the cuff
  // opening out into a cap cut along the armhole curve, and the curve runs a
  // third of the way back down the sleeve's own axis. Laid flat it is a bell,
  // and a bell fills not much more than half the box around it.
  Shirt_Sleeve_Left: 0.55,
  Shirt_Sleeve_Right: 0.55,
};

/** What a print zone's unwrap must eventually do. */
export const ZONE_TARGET = {
  /** Fill its own square, so no part of the template is lost off the product. */
  coverage: 0.95,
  /** Arrive in one piece, so artwork is never cut across an atlas gap. */
  islands: 1,
  /** Read the same way round throughout, or the artwork folds back on itself. */
  mirroredTriangles: 0,
  /**
   * Keep a square a square, allowing for the shape of the panel.
   *
   * The distortion a checkerboard shows and `stretch` cannot: halve a check's
   * width and double its height and the ink per square millimetre has not
   * moved at all.
   */
  squareness: 1.1,
  /** Keep a circle a circle. */
  stretch: 1.25,
} as const;

/** What every model must eventually be free of. */
export const MODEL_TARGET = {
  /** Materials that are fully metallic and fully rough, so they render black. */
  blackMaterials: 0,
  coincidentFaces: 0,
  degenerateTriangles: 0,
  nonManifoldEdges: 0,
  /** A shading break drawn across geometry that is flat: a line over nothing. */
  shadingSplitsOnFlat: 0,
  /** Anything but hardware painted onto a hardware part. */
  strayTrianglesOnHardware: 0,
} as const;

/**
 * Interior edges where two faces meet at 45 degrees or more.
 *
 * Pinned rather than driven to zero, because most of them are supposed to be
 * there and the count is only meaningful once you know what it is made of.
 * Measured on the shirt: most run down the side seams and round the armholes,
 * which is what a sewn seam is -- two panels stitched together fold sharply --
 * and the rest are the hems, one per corner of each rim, which is what a fold
 * is. The few in open cloth are the ones worth chasing. The tote's 985 are the seams, the mouth and the edges of the straps
 * on a bag that was modelled with all three.
 *
 * Shading is measured separately and is not affected: `shadingSplitsOnFlat` is
 * zero on both, so none of these draws a line where the surface is flat.
 */
export const SOFT_GOODS_HARD_EDGES_ARE_PINNED = true;

export const SOFT_GOODS: readonly DeviceId[] = ["tote-bag", "tshirt"];

/**
 * Parts that are hardware: a clasp, a webbing handle. Nothing else may appear
 * on the shell they belong to, and they never carry artwork.
 */
export const HARDWARE_MATERIALS: Partial<Record<DeviceId, readonly string[]>> = {
  "id-card": ["Clip"],
  "tote-bag": ["Bag_Handles"],
};

export type ZoneBaseline = {
  coverage: number;
  islands: number;
  mirroredTriangles: number;
  /** How far from square a printed square arrives, at the 99th percentile. */
  squareness: number;
  stretch: number;
};

export type ModelBaseline = {
  /**
   * Materials at metallic 1 and roughness 1. Metal takes its colour from what
   * it reflects, and a fully rough surface reflects nothing coherent, so such a
   * material has neither diffuse nor highlight left and renders black.
   */
  blackMaterials: readonly string[];
  /** Edges used by one face. An opening the product declares, not a hole. */
  boundaryEdges: number;
  coincidentFaces: number;
  degenerateTriangles: number;
  hardInteriorEdges: number;
  nonManifoldEdges: number;
  shadingSplitsOnFlat: number;
  /** Connected components: the parts the modeller actually built. */
  shells: number;
  strayTrianglesOnHardware: number;
  zones: Record<string, ZoneBaseline>;
};

export const MODEL_BASELINES: Partial<Record<DeviceId, ModelBaseline>> = {
  // Phase 1 moved the clasp jaw's 176 strays back onto the clasp, and both card
  // faces now unwrap as the single island a full-bleed face should be. Coverage
  // reads lower than it did only because it is finally measuring the card: the
  // old 0.998 was taken over an unwrap stretched to reach the strays.
  //
  // Phase 3 recomputed the shading normals with a 40-degree crease, which took
  // the 38 lines drawn across the flat of the rim to none while leaving the
  // right angle where the rim meets the face -- that turn is well past the
  // threshold, and the hard-edge count is unchanged at 1,434 to prove it.
  "id-card": {
    blackMaterials: [],
    boundaryEdges: 0,
    coincidentFaces: 0,
    degenerateTriangles: 0,
    hardInteriorEdges: 1434,
    nonManifoldEdges: 0,
    shadingSplitsOnFlat: 0,
    shells: 7,
    strayTrianglesOnHardware: 0,
    zones: {
      Card_Back: { coverage: 0.987, islands: 1, mirroredTriangles: 0, squareness: 1.02, stretch: 1.01 },
      Card_Front: { coverage: 0.987, islands: 1, mirroredTriangles: 0, squareness: 1.02, stretch: 1 },
    },
  },
  // Phase 4 prepped it like the rest, so the file says what its parts are
  // instead of the catalog correcting them on the way to the screen. The source
  // paints all five with one material at metallic 1 and roughness 1 -- which has
  // neither diffuse nor highlight left to reflect -- and hangs a photograph of
  // somebody's document off it. Three of the five were rescued at load time by
  // colour slots and a correction; the loose sheets were not, and shipped that
  // artwork in plain view.
  //
  // The print zone is the top of the pad, projected straight down onto it. It
  // filled 0.23 of its square before, in a corner of whatever atlas the model
  // was authored in, and now fills it.
  "tablet-folder": {
    blackMaterials: [],
    boundaryEdges: 88,
    coincidentFaces: 0,
    degenerateTriangles: 0,
    hardInteriorEdges: 153,
    nonManifoldEdges: 0,
    shadingSplitsOnFlat: 0,
    shells: 9,
    strayTrianglesOnHardware: 0,
    zones: {
      Folder_Pad: { coverage: 0.991, islands: 1, mirroredTriangles: 0, squareness: 1, stretch: 1 },
    },
  },
  // Rebuilt on a source that was modelled as a bag: closed, consistently wound,
  // with the two handles built as solid straps of their own rather than as
  // ribbons two triangles wide. Everything the old model needed doing to it --
  // inflating a flat panel into something with volume, hemming a mouth that was
  // one vertex thick, rounding folds that met with no transition -- the new one
  // already has, so all three passes are gone from its prep.
  //
  // Free edges went from 296 to none, which is the headline: the bag has no
  // holes in it at all now, and the 4,036mm of hairline gap along its corners
  // and its base went with them. It costs triangles -- 8,292 became 60,220, a
  // fifth of a 301,100-triangle source, kept at a fifth because that is what
  // holds the slack in the cloth that is the whole reason to prefer this one.
  //
  // The four sides now print edge to edge, fold to fold and base to mouth,
  // which is what replaced the 240mm platen that left three quarters of every
  // side plain. A plane cannot hold a fold, and each side runs round two, so
  // the unwrap measures the cloth instead: the bag is sliced into horizontal
  // rings and a point sits where it falls along its own ring. Projecting a
  // gusset onto the plane it faces put the typical face at 1.42 times less ink
  // per square millimetre than the flat middle of the same panel, and no
  // rectangle in that plane covered more than 0.92 of the panel. Measured round
  // the rings it is 1.12 and 0.996.
  //
  // Stretch reads 1.12 rather than 1 for the same reason the bottle's reads
  // 1.2: the bag is not a prism. Its girth is 935mm at the base and 825mm at
  // the mouth, so a design filling a side closes up by an eighth on the way up,
  // which is what happens to a real all-over print on a bag that tapers. The
  // seams are held at a fixed fraction of the way round at every height, which
  // is what a sewn bag does and what keeps that eighth from landing entirely on
  // the gussets -- by the bag's own corner diagonal they carried 150mm of cloth
  // at the base and 107mm at the mouth, and a design filling that was squeezed
  // by two fifths.
  //
  // Every boundary a design ends on is cut rather than decided per whole
  // triangle: the four folds, the base seam and the mouth's hem. A face belongs
  // to the side its middle is on, and the folds are the smoothest part of the
  // bag and so the part the simplifier left the largest triangles on, so left
  // uncut the edge of every design stepped in and out by up to 18mm on a 155mm
  // gusset -- a zigzag anyone can see. Cut, each side fills its own square
  // exactly, which is the coverage of 1.
  //
  // Hard edges read 985 against the 1,839 the same bag measured before its
  // slivers were mended -- 1,906 four-cornered patches that a simplifier had
  // cut the wrong way, and 996 more that the seam cuts left, each leaving a
  // triangle standing less than a fifth of a millimetre tall over a
  // two-millimetre edge. They print nothing, and until
  // they were mended a scatter of them landed reversed in the atlas, because
  // which way round a triangle that thin falls is decided by the last digits of
  // its corners. None of the 922 draws a line over anything flat, which is what
  // `shadingSplitsOnFlat` says.
  "tote-bag": {
    blackMaterials: [],
    boundaryEdges: 0,
    coincidentFaces: 0,
    degenerateTriangles: 0,
    hardInteriorEdges: 985,
    nonManifoldEdges: 0,
    shadingSplitsOnFlat: 0,
    shells: 3,
    strayTrianglesOnHardware: 0,
    zones: {
      Bag_Back: { coverage: 0.94, islands: 1, mirroredTriangles: 0, squareness: 1.02, stretch: 1.01 },
      Bag_Front: { coverage: 0.951, islands: 1, mirroredTriangles: 0, squareness: 1.02, stretch: 1.01 },
      Bag_Left: { coverage: 0.938, islands: 1, mirroredTriangles: 0, squareness: 1.14, stretch: 1.03 },
      Bag_Right: { coverage: 0.938, islands: 1, mirroredTriangles: 0, squareness: 1.14, stretch: 1.03 },
    },
  },
  // Every panel prints edge to edge now: the front and back from the shoulder
  // to the hem and side seam to side seam, each sleeve round the tube from the
  // cuff to the underarm curve. That replaced a 240 by 320mm platen on the
  // chest, a 180 by 320mm one on the back and a 60mm patch on each sleeve,
  // which between them printed on about an eighth of the cloth.
  //
  // The platen was there for a reason and this is the answer to it. A panel is
  // not flat: it wraps round the body, and where it curved past the direction
  // it was projected along -- the sides of the chest, the underside of a sleeve
  // -- its triangles projected back to front and their slice of the design came
  // out mirrored, 156 of them on the front, 411 on the back and about 670 on
  // each sleeve. So the design follows the cloth instead of a plane: the shirt
  // is sliced into rings, each ring is walked round to give distance travelled,
  // and a point sits where it falls along its own ring. Six triangles of the
  // whole garment now read the wrong way round, all of them cloth folded into a
  // seam where an unwrap measured round the outside has nothing to say.
  //
  // Rings across the body for the panels and across each sleeve's own axis for
  // the sleeves, because a sleeve lies at about forty degrees to every world
  // axis. A sleeve's axis is found armhole-to-cuff rather than by where it is
  // most spread: a flared sleeve is spread across as much as along, and the
  // axis that gives is six degrees steeper, which walks it out through the
  // cloth -- the nearest surface fell to 2mm from it, and a ring measured about
  // an axis lying on its own surface spins.
  //
  // Each sleeve prints cuff to shoulder, head included. The head is the part
  // of a sleeve that is not a tube -- cut along the armhole curve a third of
  // the way back down its own axis, so a slice through it meets the cloth on
  // some sides and not others -- and it used to stay plain for want of
  // anything to measure a way round from: a third of each arm in flat colour,
  // which on a printed garment reads as a contrast raglan yoke. Its slices are
  // closed now by borrowing the shape of a whole ring further down and sizing
  // it to the cloth that is there. Joining the two lips of the gap instead,
  // which was the first attempt, closes a head slice into a circle 237mm
  // around where the cuff is 430, and a fraction of 237 is nearly twice the
  // design per millimetre that a fraction of 430 is.
  //
  // What is left plain is the hem and the last 8mm of each cuff, which are
  // turned under -- and the fold is built out of cloth the print does not own,
  // so something has to hold those rims.
  //
  // Coverage: the body panels fill 0.875 to 0.879 of their square and the
  // sleeves 0.579 to 0.590, because none of them is a rectangle. A body panel
  // has a neck curve and two armholes taken out of it; a whole sleeve laid
  // flat is a bell. The corners of a design land where the cloth is not, which
  // is what printing a rectangle on a cut panel does, and each panel's
  // template draws its outline. `CUT_PANELS` holds each to its own figure.
  //
  // Stretch is 1.25 to 1.26 on the body, for the same reason the tote's is
  // 1.12: a body is not a cylinder, so a design filling one closes up where
  // the cloth narrows. On the sleeves it is 1.67, and all of it is in one
  // place -- the tongue of cloth at the shoulder point, about 7 of the
  // sleeve's 730 square centimetres, takes 1.6 to 1.8 times the design per
  // square millimetre the rest does. Trimming the print back off that tongue
  // brings it to 1.33 at 15 per cent of the sleeve's length left bare, which
  // is a 48mm blank band at the shoulder: worse to look at than the density it
  // buys. Free edges are 600 against 592 because the cuff band moved; hard
  // edges, shells and splits are where they were.
  tshirt: {
    blackMaterials: [],
    boundaryEdges: 600,
    coincidentFaces: 0,
    degenerateTriangles: 0,
    hardInteriorEdges: 679,
    nonManifoldEdges: 0,
    shadingSplitsOnFlat: 0,
    shells: 4,
    strayTrianglesOnHardware: 0,
    zones: {
      Shirt_Back: { coverage: 0.821, islands: 1, mirroredTriangles: 0, squareness: 1.02, stretch: 1.02 },
      Shirt_Front: { coverage: 0.817, islands: 1, mirroredTriangles: 0, squareness: 1.03, stretch: 1.02 },
      Shirt_Sleeve_Left: { coverage: 0.568, islands: 1, mirroredTriangles: 0, squareness: 1.08, stretch: 1.05 },
      Shirt_Sleeve_Right: { coverage: 0.574, islands: 1, mirroredTriangles: 0, squareness: 1.09, stretch: 1.04 },
    },
  },
  // The wrap runs past 1 in u because it goes all the way round, which is what
  // a wrap does. Coverage is measured on the area it fills, not the box.
  //
  // Phase 4 finished what phase 2 left, and then went too far the other way. It
  // separated the body into the wall a label goes round -- the largest run of
  // near-vertical surface that joins up with itself -- and the base, shoulder
  // and neck, which it decided a label does not. That killed the fifteen
  // backwards triangles, and it left the bottle wearing a white band under the
  // chrome ring and another round its foot: eight and a half per cent of the
  // body's height with no artwork on it.
  //
  // The label now covers the whole outside of the body, from the foot to the
  // height where the ring takes over, and only the two discs facing along the
  // axis are left out -- those are the surfaces a wrap genuinely cannot hold,
  // and they are the ones the backwards triangles were on. The second
  // coordinate is distance along the profile rather than height, because the
  // shoulder loses five millimetres of radius over eight of height and is
  // therefore longer than it is tall; by height alone its share of the artwork
  // arrived squeezed into a band. Measured that way the wrap is 1.37 to 1.
  //
  // Stretch reads 1.2 rather than 1 because the bottle is no longer being
  // treated as a cylinder. One turn of u is 137mm of surface at the wall and
  // 107mm at the neck, so the artwork closes up as it goes over the shoulder --
  // which is what happens to a real full-wrap print on a tapered bottle. It is
  // still inside the 1.25 a zone has to hold.
  "water-bottle": {
    blackMaterials: [],
    boundaryEdges: 112,
    coincidentFaces: 0,
    degenerateTriangles: 0,
    hardInteriorEdges: 374,
    nonManifoldEdges: 0,
    shadingSplitsOnFlat: 0,
    shells: 3,
    strayTrianglesOnHardware: 0,
    zones: {
      Bottle_Body: { coverage: 1, islands: 1, mirroredTriangles: 0, squareness: 1.22, stretch: 1.2 },
    },
  },
};
