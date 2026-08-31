#!/usr/bin/env node
/**
 * Build the tablet folder: a folio holding a pad of paper, with a pen and a
 * clip.
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
 * photograph of somebody's document: a dark panel with red text, colour
 * swatches, an orange rule. Three of the five parts were rescued from that at
 * load time by catalog corrections and colour slots. The pad of loose sheets
 * was not, so it shipped that artwork in plain view.
 *
 * So the parts are separated here, in the file, the way every other product's
 * are, and each gets a finish that says what it is made of. Nothing is left
 * needing a correction on the way to the screen.
 */

import { prepZones, repoPath, sourceModel } from "./prep-model-zones.mjs";

// Board, paper, plastic and steel. None of them metal except the clip, and
// none of them mirror-smooth.
const BOARD = { metalness: 0, roughness: 0.55 };
const PAPER = { metalness: 0, roughness: 0.85 };
const PLASTIC = { metalness: 0, roughness: 0.4 };
const STEEL = { metalness: 1, roughness: 0.35 };

/** Which part of the folio each mesh in the file is. */
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
    // Neutral board. What it actually shows is the main colour slot, which the
    // app paints over this; a darker value here changes nothing on screen.
    Folder_Board: { ...BOARD, baseColor: [0.91, 0.90, 0.87, 1] },
    // The face a design lands on: the top of the pad, flat in y, so it is
    // projected straight down onto it.
    Folder_Pad: { ...PAPER, flatten: true, baseColor: [0.97, 0.97, 0.96, 1], unwrap: ["x", "z"] },
    Folder_Pad_Edge: { ...PAPER, baseColor: [0.95, 0.94, 0.92, 1] },
    Folder_Sheet: { ...PAPER, baseColor: [0.97, 0.97, 0.96, 1] },
    Folder_Pen: { ...PLASTIC, baseColor: [0.78, 0.78, 0.76, 1] },
    Folder_Clip: { ...STEEL, baseColor: [0.76, 0.77, 0.79, 1] },
  },
});

for (const [zone, { span, tris }] of Object.entries(report)) {
  console.log(`  ${zone.padEnd(18)} ${String(tris).padStart(4)} tris  span ${span ? span.join(" x ") : "-"}`);
}
