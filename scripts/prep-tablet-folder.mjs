#!/usr/bin/env node
/**
 * Build the clipboard: a hardboard panel with a spring clip, an A4 sheet and a
 * pen.
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

import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";

import { prepZones, repoPath, sourceModel } from "./prep-model-zones.mjs";

const texture = (name) => repoPath("public", "textures", name);

/**
 * How many times a map repeats across one unit of this model.
 *
 * The board is 31 units on its long side and a clipboard is about 320mm, so a
 * unit is a shade over 10mm. These are chosen as a tile size in millimetres
 * and divided back: hardboard flecking reads at about 40mm, a sheet's cockle
 * at 110mm, and the brush on the clip at 12mm because the clip is small and
 * its streaks have to be finer than it is.
 */
const MM_PER_UNIT = 320 / 31;
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
  Pen_blinn2_0: "Folder_Pen",
  Pin_blinn2_0: "Folder_Clip",
  StackOfPaper_blinn2_0: "Folder_Pad",
  Tablet_blinn2_0: "Folder_Board",
};

/**
 * Put the parts where a clipboard's parts are, before anything else runs.
 *
 * Checked against two photographs of real clipboards, the bought file gets four
 * things wrong and every one of them is placement rather than material. The
 * sheet is 288 by 217mm, which is no paper size at all, and it sits 0.19 sunk
 * into the board and a unit off centre. The clip -- the one part whose job is
 * to hold the sheet down -- sits 1.8mm *below* the face of the board, so the
 * paper goes on top of it. The pen floats a quarter of a unit above everything
 * at the clip end. And the loose sheets are six scraps standing 23.7 deep
 * against a 22-deep board.
 *
 * No amount of dressing hides any of that, so it is fixed here. Every part is
 * moved by its own node.
 */
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(sourceModel("tablet-folder.glb"));

/** Every mesh's world box, which is what the placement is worked out from. */
function boxes() {
  const found = new Map();
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const m = node.getWorldMatrix();
    const box = { hi: [-Infinity, -Infinity, -Infinity], lo: [Infinity, Infinity, Infinity], node };
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute("POSITION");
      for (let i = 0; i < pos.getCount(); i += 1) {
        const p = pos.getElement(i, [0, 0, 0]);
        const w = [p[0] * m[0] + p[1] * m[4] + p[2] * m[8] + m[12],
          p[0] * m[1] + p[1] * m[5] + p[2] * m[9] + m[13],
          p[0] * m[2] + p[1] * m[6] + p[2] * m[10] + m[14]];
        for (let q = 0; q < 3; q += 1) {
          if (w[q] < box.lo[q]) box.lo[q] = w[q];
          if (w[q] > box.hi[q]) box.hi[q] = w[q];
        }
      }
    }
    box.size = [0, 1, 2].map((q) => box.hi[q] - box.lo[q]);
    box.mid = [0, 1, 2].map((q) => (box.hi[q] + box.lo[q]) / 2);
    found.set(mesh.getName(), box);
  }
  return found;
}

const before = boxes();
const board = before.get("Tablet_blinn2_0");
const pad = before.get("StackOfPaper_blinn2_0");

/**
 * A4, and where it sits on the board.
 *
 * The sheet the file drew is 288 by 217mm against a 320 by 227mm board, which
 * is nothing in particular -- wide margins at the ends, five millimetres at the
 * sides. A clipboard holds A4, so it holds A4 here: 297 by 210, which leaves
 * about 11mm above and below and 8mm at each side, and makes the print area a
 * standard 1:1.414 so a design authored at A4 lands undistorted.
 *
 * More board above the sheet than below it, because the clip needs somewhere
 * to be. That is what both references show and it is what the geometry wants:
 * the clip runs from 1.44 to 3.92 units in from the top edge, so a sheet whose
 * top edge lands at 1.4 arrives directly under the jaw.
 */
const A4 = [297, 210];
const MM = board.size[0] / 320;
const TOP = 1.4;
const sheetSize = [A4[0] * MM, A4[1] * MM];
const paper = [
  board.lo[0] + TOP,
  board.hi[1],
  board.lo[2] + (board.size[2] - sheetSize[1]) / 2,
];

/**
 * Set a node's own part down at a corner, at a scale, leaving its parents be.
 *
 * A node's translation moves what is under it and its scale grows it about its
 * own origin, and the parents above contribute an offset this must not disturb
 * -- so the offset is read off the world matrix while the node itself is still
 * at zero, and taken back out of the answer.
 */
const place = (box, corner, scale) => {
  const at = box.node.getWorldMatrix().slice(12, 15);
  box.node.setScale(scale);
  box.node.setTranslation([0, 1, 2].map((q) =>
    corner[q] - scale[q] * (box.lo[q] - at[q]) - at[q]));
};

// The pad: A4 across and along, its own thickness left alone, resting on the
// board's face rather than sunk through it.
place(pad, paper, [sheetSize[0] / pad.size[0], 1, sheetSize[1] / pad.size[2]]);

const padTop = board.hi[1] + pad.size[1];
const padMid = [
  paper[0] + sheetSize[0] / 2,
  padTop,
  paper[2] + sheetSize[1] / 2,
];

/**
 * The clip, brought up to press the paper.
 *
 * It sat 1.8mm below the face of the board, which is to say inside it, and the
 * paper then went on above -- so the one part of a clipboard whose whole job is
 * to hold the sheet down was underneath it. Its underside now rests on the
 * sheet, and since the sheet's top edge lands where the clip begins, the jaw
 * covers about 25mm of paper, which is what both references show.
 */
const clip = before.get("Pin_blinn2_0");
clip.node.setTranslation([0, 1, 2].map((q) =>
  clip.node.getTranslation()[q] + (q === 1 ? padTop - clip.lo[1] : 0)));

/**
 * The loose sheets, taken out.
 *
 * They are not sheets. Six disconnected scraps inside one mesh, the largest a
 * 13 by 1 strip and two of the six the same strip twice over, standing 23.7
 * deep against a 22-deep board so they poked out past both edges. Stacked into
 * a pile they read as creases across the paper; neither reference of a real
 * clipboard has anything of the sort on it, and the sheet is better without
 * them and free for a design.
 */
const scraps = before.get("Paper_blinn2_0").node;
const scrapMesh = scraps.getMesh();
scraps.setMesh(null);
for (const prim of scrapMesh.listPrimitives()) prim.dispose();
// Disposed rather than detached: a mesh that is only unhooked from its node
// still holds its primitives, and those still name the source material, so the
// sweep that drops orphaned materials at the end finds `blinn2` still parented
// and leaves it -- and the file ships a material nothing in the catalog names.
scrapMesh.dispose();
scraps.dispose();

/**
 * The pen, laid across the lower right of the pad at an angle.
 *
 * Turned about its own middle rather than about the node's origin, which is
 * metres away and would swing it off the set. A node rotation turns about that
 * origin, so the translation carries the difference: `R(w - c) + c + move` is
 * `R w + (c + move - R c)`, and the second half of that is what the node is
 * given to hold.
 */
const pen = boxes().get("Pen_blinn2_0");
const TURN = (-32 * Math.PI) / 180;
const cos = Math.cos(TURN), sin = Math.sin(TURN);
const rest = [padMid[0] + board.size[0] * 0.26, padTop + pen.size[1] / 2, padMid[2] + board.size[2] * 0.24];
pen.node
  .setRotation([0, Math.sin(TURN / 2), 0, Math.cos(TURN / 2)])
  .setTranslation([
    rest[0] - (pen.mid[0] * cos + pen.mid[2] * sin),
    rest[1] - pen.mid[1],
    rest[2] - (-pen.mid[0] * sin + pen.mid[2] * cos),
  ]);

const report = await prepZones({
  classify: (f) => {
    const part = PARTS[f.mesh];
    // The pad prints on its face and not on its four edges. Unwrapping the
    // edges with it would project them onto nothing -- they stand square to the
    // face -- and the design would smear down the side of the block.
    if (part === "Folder_Pad") return f.WN[1] > 0.7 ? "Folder_Pad" : "Folder_Pad_Edge";
    return part;
  },
  input: doc,
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
