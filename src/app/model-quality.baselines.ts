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

/** What a print zone's unwrap must eventually do. */
export const ZONE_TARGET = {
  /** Fill its own square, so no part of the template is lost off the product. */
  coverage: 0.95,
  /** Arrive in one piece, so artwork is never cut across an atlas gap. */
  islands: 1,
  /** Read the same way round throughout, or the artwork folds back on itself. */
  mirroredTriangles: 0,
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
 * Measured on the shirt: 310 run down the side seams and 53 round the armholes,
 * which is what a sewn seam is -- two panels stitched together fold sharply.
 * Another 314 are the hems added in phase 3, one per corner of each rim, which
 * is what a fold is. Twenty sit in open cloth, and those are the ones worth
 * chasing. The tote's 922 are the seams, the mouth and the edges of the straps
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
      Card_Back: { coverage: 0.987, islands: 1, mirroredTriangles: 0, stretch: 1 },
      Card_Front: { coverage: 0.987, islands: 1, mirroredTriangles: 0, stretch: 1 },
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
    boundaryEdges: 124,
    coincidentFaces: 0,
    degenerateTriangles: 0,
    hardInteriorEdges: 158,
    nonManifoldEdges: 0,
    shadingSplitsOnFlat: 0,
    shells: 15,
    strayTrianglesOnHardware: 0,
    zones: {
      Folder_Pad: { coverage: 0.998, islands: 1, mirroredTriangles: 0, stretch: 1 },
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
  // Coverage reads a little under 1 rather than exactly 1 because a face
  // belongs to the side its middle is on. The folds are the smoothest part of
  // the bag and so the part the simplifier left the largest triangles on, so a
  // few at each fold reach up to three per cent past the end of their own side;
  // that cloth takes the last column of its own design, which is what the
  // clamped sampler gives it.
  //
  // Hard edges read 922 against the 1,839 the same bag measured before its
  // slivers were mended -- 1,906 four-cornered patches that a simplifier had
  // cut the wrong way, each leaving a triangle standing less than a fifth of a
  // millimetre tall over a two-millimetre edge. They print nothing, and until
  // they were mended a scatter of them landed reversed in the atlas, because
  // which way round a triangle that thin falls is decided by the last digits of
  // its corners. None of the 922 draws a line over anything flat, which is what
  // `shadingSplitsOnFlat` says.
  "tote-bag": {
    blackMaterials: [],
    boundaryEdges: 0,
    coincidentFaces: 0,
    degenerateTriangles: 0,
    hardInteriorEdges: 922,
    nonManifoldEdges: 0,
    shadingSplitsOnFlat: 0,
    shells: 3,
    strayTrianglesOnHardware: 0,
    zones: {
      Bag_Back: { coverage: 0.996, islands: 1, mirroredTriangles: 0, stretch: 1.12 },
      Bag_Front: { coverage: 0.996, islands: 1, mirroredTriangles: 0, stretch: 1.13 },
      Bag_Left: { coverage: 0.998, islands: 1, mirroredTriangles: 0, stretch: 1.12 },
      Bag_Right: { coverage: 1, islands: 1, mirroredTriangles: 0, stretch: 1.12 },
    },
  },
  // Phase 2. Every zone is a platen now, and every one of them fills its square
  // exactly: a 240 by 320mm chest print, a 180 by 320mm back print -- narrower
  // because the back panel wraps further round before its surface turns away --
  // and a 60mm patch on each sleeve. Mirrored triangles went from 156, 411, 667
  // and 678 to none, because artwork no longer reaches the sides of the chest or
  // the underside of a sleeve, which is where the cloth turned away from the
  // direction it was projected along.
  //
  // The sleeves are unwrapped on a plane laid across the patch rather than down
  // a world axis. A sleeve is a cone lying at an angle to all three, and down
  // any of them the tightest one per cent of the patch carried 1.6 times the ink
  // per square millimetre the middle did; making the patch smaller barely moved
  // that, because the fault was the direction.
  //
  // Free edges still total 4,440mm, exactly what they did before the cut. The
  // rise in the count, and in the hard edges from 348, is the same cloth divided
  // into more pieces.
  //
  // Phase 3 turned four rims under -- the hem, both cuffs and the neck -- which
  // is what the close-up shots this garment is for will show. Hard edges went
  // from 384 to 718, and the 334 new ones are one per corner of those rims.
  //
  // The two edges that were used by more than two faces are gone. They were
  // splinters left by the cut, at one spot on the top line of the chest print,
  // sitting right at the distance below which two points are the same point --
  // and no split tolerance removed them without opening seams elsewhere. What
  // removed them was fusing the near-duplicates instead of avoiding them:
  // `weldFaces` runs after every cut and pulls vertices closer together than
  // the weld onto each other, which turns a splinter into nothing and takes its
  // doubled edge with it.
  tshirt: {
    blackMaterials: [],
    boundaryEdges: 592,
    coincidentFaces: 0,
    degenerateTriangles: 0,
    hardInteriorEdges: 718,
    nonManifoldEdges: 0,
    shadingSplitsOnFlat: 0,
    shells: 4,
    strayTrianglesOnHardware: 0,
    zones: {
      Shirt_Back: { coverage: 1, islands: 1, mirroredTriangles: 0, stretch: 1.04 },
      Shirt_Front: { coverage: 1, islands: 1, mirroredTriangles: 0, stretch: 1.06 },
      Shirt_Sleeve_Left: { coverage: 1, islands: 1, mirroredTriangles: 0, stretch: 1.05 },
      Shirt_Sleeve_Right: { coverage: 1, islands: 1, mirroredTriangles: 0, stretch: 1.04 },
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
      Bottle_Body: { coverage: 1, islands: 1, mirroredTriangles: 0, stretch: 1.2 },
    },
  },
};
