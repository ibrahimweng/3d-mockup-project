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
  // Phase 1 gave both handles back to the webbing. Front and back unwrap as one
  // island each now, and reclaimed the atlas the strays were holding -- but the
  // panels still do not fill their squares, which is phase 2's to close.
  "tote-bag": {
    blackMaterials: [],
    boundaryEdges: 288,
    coincidentFaces: 0,
    degenerateTriangles: 0,
    hardInteriorEdges: 25,
    nonManifoldEdges: 0,
    shadingSplitsOnFlat: 0,
    shells: 3,
    strayTrianglesOnHardware: 0,
    zones: {
      Bag_Back: { coverage: 0.837, islands: 1, mirroredTriangles: 0, stretch: 1.06 },
      Bag_Front: { coverage: 0.814, islands: 1, mirroredTriangles: 0, stretch: 1.06 },
      Bag_Left: { coverage: 0.755, islands: 1, mirroredTriangles: 0, stretch: 1.05 },
      Bag_Right: { coverage: 0.743, islands: 1, mirroredTriangles: 0, stretch: 1.05 },
    },
  },
  // The sleeves are the outlier: a cone forced into a square, so a fifth of
  // their triangles read backwards and the tightest of them carry twice the
  // artwork per centimetre that the median does.
  tshirt: {
    blackMaterials: [],
    boundaryEdges: 554,
    coincidentFaces: 0,
    degenerateTriangles: 0,
    hardInteriorEdges: 348,
    nonManifoldEdges: 0,
    shadingSplitsOnFlat: 0,
    shells: 4,
    strayTrianglesOnHardware: 0,
    zones: {
      Shirt_Back: { coverage: 0.869, islands: 1, mirroredTriangles: 411, stretch: 1.13 },
      Shirt_Front: { coverage: 0.858, islands: 1, mirroredTriangles: 156, stretch: 1.18 },
      Shirt_Sleeve_Left: { coverage: 0.81, islands: 1, mirroredTriangles: 667, stretch: 2.11 },
      Shirt_Sleeve_Right: { coverage: 0.809, islands: 1, mirroredTriangles: 678, stretch: 2.06 },
    },
  },
  // The wrap runs past 1 in u because it goes all the way round, which is what
  // a wrap does. Coverage is measured on the area it fills, not the box.
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
      Bottle_Body: { coverage: 1.002, islands: 1, mirroredTriangles: 16, stretch: 1.35 },
    },
  },
};
