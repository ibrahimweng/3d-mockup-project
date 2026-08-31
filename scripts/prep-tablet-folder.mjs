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

import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";

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

/**
 * Put the parts where a clipboard's parts are, before anything else runs.
 *
 * The bought file has them scattered. Measured in its own units, the board runs
 * x -28.9 to 2.1 and the pad x -12.9 to 15.1 -- so 13 units of the pad, 42 per
 * cent of it, hang off the far end of the board, and where the two do overlap
 * the pad's face sits 0.14 below the board's, buried in it. The loose sheets
 * are six scraps 23.7 deep against a 22-deep board, poking out past both edges,
 * and the pen floats a quarter of a unit above everything at the clip end.
 *
 * None of that is a material problem and no amount of dressing hides it, so it
 * is fixed here rather than lived with. Each part is moved by its own node
 * where it has one, which is every part but the sheets: those are six
 * disconnected pieces inside one mesh, so they are moved a vertex at a time.
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

/** Slide a node's own part by a world offset, leaving its parents alone. */
const slide = (box, by) => {
  const t = box.node.getTranslation();
  box.node.setTranslation([t[0] + by[0], t[1] + by[1], t[2] + by[2]]);
};

// The pad, centred on the board with an even margin and its face resting on
// the board's rather than sunk through it. Its top edge lands under the clip,
// which is where a clipboard holds a pad.
slide(pad, [
  board.lo[0] + (board.size[0] - pad.size[0]) / 2 - pad.lo[0],
  board.hi[1] - pad.lo[1],
  board.lo[2] + (board.size[2] - pad.size[2]) / 2 - pad.lo[2],
]);

const padTop = board.hi[1] + pad.size[1];
const padMid = [
  board.lo[0] + board.size[0] / 2,
  padTop,
  board.lo[2] + board.size[2] / 2,
];

/**
 * The loose sheets, stacked on each other on the pad.
 *
 * Six disconnected scraps in one mesh, so a node cannot move them apart: the
 * vertices are welded into pieces and each piece is carried to the same place
 * over the pad and laid on the one below. Two of the six are the same 13 by 1
 * strip twice over, which is what the file shipped.
 */
const sheets = before.get("Paper_blinn2_0");
for (const prim of sheets.node.getMesh().listPrimitives()) {
  const pos = prim.getAttribute("POSITION");
  const idx = prim.getIndices();
  const count = idx ? idx.getCount() : pos.getCount();
  const step = Math.max(...board.size) * 1e-4;
  const key = (p) => p.map((c) => Math.round(c / step)).join(",");
  // Which piece each vertex belongs to, by walking the triangles and joining.
  const owner = new Map();
  const root = (a) => { let n = a; while (owner.get(n) !== n) n = owner.get(n); return n; };
  const seen = [];
  for (let i = 0; i < count; i += 1) {
    const v = idx ? idx.getScalar(i) : i;
    const k = key(pos.getElement(v, [0, 0, 0]));
    if (!owner.has(k)) owner.set(k, k);
    seen.push({ k, v });
  }
  for (let i = 0; i < seen.length; i += 3) {
    for (const j of [1, 2]) {
      const a = root(seen[i].k), b = root(seen[i + j].k);
      if (a !== b) owner.set(a, b);
    }
  }
  // Each piece's own box, so it can be carried by its middle rather than by
  // wherever its first vertex happened to be.
  const piece = new Map();
  for (const { k, v } of seen) {
    const p = pos.getElement(v, [0, 0, 0]);
    const r = root(k);
    const box = piece.get(r) ?? { hi: [-Infinity, -Infinity, -Infinity], lo: [Infinity, Infinity, Infinity], vs: new Set() };
    for (let q = 0; q < 3; q += 1) {
      if (p[q] < box.lo[q]) box.lo[q] = p[q];
      if (p[q] > box.hi[q]) box.hi[q] = p[q];
    }
    box.vs.add(v);
    piece.set(r, box);
  }
  // Largest first, so the pile reads as sheets rather than as a scrap on top
  // of a bigger scrap.
  const pile = [...piece.values()].sort((a, b) =>
    (b.hi[0] - b.lo[0]) * (b.hi[2] - b.lo[2]) - (a.hi[0] - a.lo[0]) * (a.hi[2] - a.lo[2]));
  // A sheet's thickness, not a scrap's. Each piece carries a body of its own --
  // 0.17 to 0.36 of a unit, where the whole pad is 0.62 -- so laying each on
  // top of the last one's height builds a pile taller than the pad it sits on,
  // which reads as a lump of something rather than as paper.
  const SHEET = 0.035;
  let rest = padTop;
  for (const box of pile) {
    const by = [padMid[0] - (box.hi[0] + box.lo[0]) / 2, rest - box.lo[1], padMid[2] - (box.hi[2] + box.lo[2]) / 2];
    for (const v of box.vs) {
      const p = pos.getElement(v, [0, 0, 0]);
      pos.setElement(v, [p[0] + by[0], p[1] + by[1], p[2] + by[2]]);
    }
    rest += SHEET;
  }
}

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
