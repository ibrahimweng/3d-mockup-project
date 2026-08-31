#!/usr/bin/env node
/**
 * Build the clipboard: a hardboard panel with a spring clip, a writing pad, a
 * couple of loose sheets and a pen.
 *
 * Usage:
 *   node scripts/prep-tablet-folder.mjs
 *
 * Reads the bought source named in `sourceModel` below and writes
 * `public/models/tablet-folder.glb`.
 *
 * The file paints all five of its parts with one material, `blinn2`, at
 * metallic 1 and roughness 1 -- which has neither diffuse nor highlight left
 * and renders near black -- and hangs a baked texture off it that is a
 * photograph of somebody's document. So the parts are separated here, in the
 * file, and each is given the material it is actually made of.
 *
 * Four materials, from what the shape is: a clipboard is a hardboard panel
 * with a nickel-plated steel clip, paper on it and a plastic pen. Each one is
 * a tiling map from `make-material-textures.mjs` rather than a flat colour and
 * a roughness number, because a flat colour is the reason every part of this
 * read as the same white slab whatever number it was given.
 */

import { prepZones, repoPath, sourceModel } from "./prep-model-zones.mjs";

const texture = (name) => repoPath("public", "textures", name);

/**
 * How many times a map repeats across one unit of this model.
 *
 * The board is 43.97 units on its long side and a clipboard is about 320mm, so
 * a unit is a little over 7mm. These are chosen as a tile size in millimetres
 * and divided back: hardboard flecking reads at about 40mm, a sheet's cockle
 * at 110mm, and the brush on the clip at 12mm because the clip is small and
 * its streaks have to be finer than it is.
 */
const MM_PER_UNIT = 320 / 43.97;
const TILE = (mm) => MM_PER_UNIT / mm;

const HARDBOARD = {
  metalness: 0,
  roughness: 0.62,
  surface: {
    albedo: texture("hardboard-albedo.jpg"),
    normal: texture("hardboard-normal.png"),
    rough: texture("hardboard-rough.png"),
  },
  weaveRepeatsPerUnit: TILE(40),
  weaveScale: 0.7,
};
const PAPER = {
  metalness: 0,
  roughness: 0.88,
  // Relief and finish only. The pad is the face a design prints on, so its
  // base colour belongs to the design and a picture of paper underneath would
  // multiply into it.
  surface: { normal: texture("paper-normal.png"), rough: texture("paper-rough.png") },
  // A far bigger tile than the others. What reads as paper at the distance a
  // product is photographed from is the sheet's own cockle, and a tile small
  // enough to hold fibre is a tile too small to hold that.
  weaveRepeatsPerUnit: TILE(110),
  weaveScale: 1.1,
};
const PLASTIC = {
  metalness: 0,
  roughness: 0.33,
  surface: {
    albedo: texture("plastic-albedo.jpg"),
    normal: texture("plastic-normal.png"),
    rough: texture("plastic-rough.png"),
  },
  weaveRepeatsPerUnit: TILE(18),
  weaveScale: 0.4,
};
const STEEL = {
  metalness: 1,
  roughness: 0.3,
  surface: {
    albedo: texture("nickel-albedo.jpg"),
    normal: texture("nickel-normal.png"),
    rough: texture("nickel-rough.png"),
  },
  weaveRepeatsPerUnit: TILE(12),
  weaveScale: 0.6,
};

/** Which part of the clipboard each mesh in the file is. */
const PARTS = {
  Paper_blinn2_0: "Folder_Sheet",
  Pen_blinn2_0: "Folder_Pen",
  Pin_blinn2_0: "Folder_Clip",
  StackOfPaper_blinn2_0: "Folder_Pad",
  Tablet_blinn2_0: "Folder_Board",
};

const report = await prepZones({
  classify: (f) => {
    const part = PARTS[f.mesh];
    // The pad prints on its face and not on its four edges. Unwrapping the
    // edges with it would project them onto nothing -- they stand square to the
    // face -- and the design would smear down the side of the block.
    if (part === "Folder_Pad") return f.WN[1] > 0.7 ? "Folder_Pad" : "Folder_Pad_Edge";
    return part;
  },
  input: sourceModel("tablet-folder.glb"),
  leftover: "Folder_Board",
  material: "blinn2",
  output: repoPath("public", "models", "tablet-folder.glb"),
  // The rim of the pad, where the sheets meet the block, carries one shading
  // line drawn across geometry that is flat.
  smoothCreases: { thresholdDegrees: 40 },
  // The file's normal map is the relief of that same baked document, so it
  // would emboss somebody else's page into whatever a user prints.
  weaveDefault: false,
  zones: {
    // Hardboard: pressed wood fibre, laid out across the panel it lies in. The
    // main colour slot paints over this, and because the colour multiplies the
    // map rather than replacing it, picking one stains the board rather than
    // painting the grain out. The slot's default is a near-white, so out of the
    // box the board is the brown the map says it is.
    Folder_Board: { ...HARDBOARD, baseColor: [1, 1, 1, 1], weaveAxes: ["x", "z"] },
    // The face a design lands on: the top of the pad, flat in y, so it is
    // projected straight down onto it and then flattened.
    Folder_Pad: { ...PAPER, flatten: true, baseColor: [0.97, 0.97, 0.96, 1], unwrap: ["x", "z"], weaveAxes: ["x", "z"] },
    // The cut edge of the block, which stands vertical -- so its map is laid
    // out across x and y rather than across the face, or every tile would be
    // one row of texels dragged down the side.
    Folder_Pad_Edge: { ...PAPER, baseColor: [0.95, 0.94, 0.92, 1], weaveAxes: ["x", "y"] },
    Folder_Sheet: { ...PAPER, baseColor: [0.97, 0.97, 0.96, 1], weaveAxes: ["x", "z"] },
    Folder_Pen: { ...PLASTIC, baseColor: [1, 1, 1, 1], weaveAxes: ["x", "z"] },
    // Nickel plate over steel. Fully metallic in the file and brought back by
    // the map, whose blue channel holds 0.85: a plated part is a coat over the
    // metal and keeps a little diffuse, which is the difference between a clip
    // and a silhouette. The brush runs across x and y because the clip stands
    // up off the board rather than lying in it.
    Folder_Clip: { ...STEEL, baseColor: [1, 1, 1, 1], weaveAxes: ["x", "y"] },
  },
});

for (const [zone, { span, tris }] of Object.entries(report)) {
  console.log(`  ${zone.padEnd(18)} ${String(tris).padStart(4)} tris  span ${span ? span.join(" x ") : "-"}`);
}
