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
 * Only meaningful on cloth, which cannot hold an edge that hard. Hard-surface
 * products are supposed to have them, so they are excluded rather than given a
 * bigger number.
 */
export const SOFT_GOODS_HARD_EDGE_TARGET = 0;

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
  "id-card": {
    blackMaterials: [],
    boundaryEdges: 0,
    coincidentFaces: 0,
    degenerateTriangles: 0,
    hardInteriorEdges: 1434,
    nonManifoldEdges: 0,
    shadingSplitsOnFlat: 38,
    shells: 7,
    strayTrianglesOnHardware: 0,
    zones: {
      Card_Back: { coverage: 0.987, islands: 1, mirroredTriangles: 0, stretch: 1 },
      Card_Front: { coverage: 0.987, islands: 1, mirroredTriangles: 0, stretch: 1 },
    },
  },
  // One material for the whole folio, and it is metallic 1 at roughness 1,
  // which has neither diffuse nor highlight left to reflect. Its print zone is
  // the stack of paper, ten triangles reaching a quarter of the way across the
  // atlas, so three quarters of the template a user is handed lands nowhere.
  "tablet-folder": {
    blackMaterials: ["blinn2"],
    boundaryEdges: 124,
    coincidentFaces: 0,
    degenerateTriangles: 0,
    hardInteriorEdges: 158,
    nonManifoldEdges: 0,
    shadingSplitsOnFlat: 1,
    shells: 15,
    strayTrianglesOnHardware: 0,
    zones: {
      "blinn2@StackOfPaper_blinn2_0": {
        coverage: 0.23, islands: 1, mirroredTriangles: 0, stretch: 1.6,
      },
    },
  },
  // Phase 2 cut every zone down to a real platen: 240mm square on the panels,
  // 80 by 120 on the gussets. Each fills its own square exactly, so a template
  // is now a 1:1 preview instead of a shape that ran under the handles and over
  // the base fold. The right gusset reads 0.97 rather than 1 because the bag
  // tapers and its rectangle catches a little empty air at one corner.
  //
  // Boundary edges rose from 288 with no new hole: measured by length rather
  // than count, the free edges still total 4,036mm, exactly what they did
  // before -- the cut divides the same pre-existing corner gaps into more
  // pieces. The hard edges are unchanged, and phase 3 is what rounds them.
  "tote-bag": {
    blackMaterials: [],
    boundaryEdges: 296,
    coincidentFaces: 0,
    degenerateTriangles: 0,
    hardInteriorEdges: 25,
    nonManifoldEdges: 0,
    shadingSplitsOnFlat: 0,
    shells: 3,
    strayTrianglesOnHardware: 0,
    zones: {
      Bag_Back: { coverage: 1, islands: 1, mirroredTriangles: 0, stretch: 1.04 },
      Bag_Front: { coverage: 1, islands: 1, mirroredTriangles: 0, stretch: 1.03 },
      Bag_Left: { coverage: 1, islands: 1, mirroredTriangles: 0, stretch: 1.03 },
      Bag_Right: { coverage: 0.97, islands: 1, mirroredTriangles: 0, stretch: 1.02 },
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
  tshirt: {
    blackMaterials: [],
    boundaryEdges: 592,
    coincidentFaces: 0,
    degenerateTriangles: 0,
    hardInteriorEdges: 384,
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
  // The only product phase 2 did not finish. Its seam repair was rewritten to
  // put every corner on the branch nearest the first -- half a turn being the
  // furthest two points on a cylinder can be -- in place of lifting whichever
  // corners fell below the middle, which had turned one triangle's slice of the
  // label round. That leaves fifteen, and they are not on the wall: they are on
  // the base and the shoulder, where a cylinder's wrap has nowhere to go, and
  // the stretch of 1.35 is the taper for the same reason. Both want the body
  // split into the wall that prints and the ends that do not, which is a change
  // to what the product's materials are rather than to an unwrap.
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
      Bottle_Body: { coverage: 1.002, islands: 1, mirroredTriangles: 15, stretch: 1.35 },
    },
  },
};
