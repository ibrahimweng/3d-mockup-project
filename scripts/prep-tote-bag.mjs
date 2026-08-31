#!/usr/bin/env node
/**
 * Build the tote bag: heavyweight cotton canvas with webbing handles.
 *
 * Usage:
 *   node scripts/prep-tote-bag.mjs
 *
 * Reads the bought source named in `sourceModel` below, writes
 * `public/models/tote-bag.glb`, and needs `public/textures/canvas-normal.png`
 * from `scripts/make-canvas-weave.py`.
 *
 * The source is a Wavefront OBJ of a bag that was actually modelled as a bag:
 * closed, consistently wound, with the two handles built as solid straps of
 * their own. That replaces one that was a flat panel with no volume and handles
 * two triangles thick, and it takes several passes of repair with it -- there
 * is nothing here now to inflate, no open rim to hem, and no fold to round,
 * because the model already has all three.
 *
 * What it does not have is scale, orientation or units, which an OBJ never
 * carries, and 301,100 triangles is more bag than a mockup needs. Both are
 * settled before any zone is cut.
 */

import { simplify, weld } from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";

import { assignShells, faceNormal } from "./prep-model-geometry.mjs";
import { boxOf, objDocument, placeObj, readObj } from "./prep-model-obj.mjs";
import { unrollAround } from "./prep-model-wrap.mjs";
import { prepZones, repoPath, sourceModel } from "./prep-model-zones.mjs";

const template = (name) => repoPath("public", "templates", `${name}.png`);

/**
 * World units to millimetres.
 *
 * A tote of this shape is 380mm across, and that is what sets the scale: the
 * source is 36.13 units wide, so a unit is 66.84mm and the bag comes out
 * 380 by 374mm with a 155mm gusset, 612mm to the top of the handles. Everything
 * below is stated as a real print size and converted, because a screen-print
 * platen is a physical object and its size is the reason the print area is the
 * size it is.
 */
const MM = 1 / 66.84;
const WIDTH = 380 * MM;

/**
 * How much of the source mesh to keep.
 *
 * 301,100 triangles is a subdivision cage left subdivided. A fifth of it holds
 * the creases and the slack in the cloth -- which is the whole reason to prefer
 * this source -- while fitting in a file a browser can pull down.
 */
const KEEP = 0.2;

/**
 * Cotton duck, at the density cotton duck actually has.
 *
 * The file ships no normal map, so unlike the shirt there is nothing to restore
 * and this is a supplied one. The density is measured rather than chosen to
 * look right: a unit is 6.7cm, the tile carries eight thread crossings, so 10.4
 * tiles per unit lands about 1.2 threads to the millimetre -- the coarse end of
 * canvas, which is what a tote is. Laying it out from world position rather
 * than from the unwrap is what keeps the narrow sides reading as the same cloth
 * as the front.
 */
const CANVAS = {
  metalness: 0,
  roughness: 0.78,
  weaveFile: repoPath("public", "textures", "canvas-normal.png"),
  weaveRepeatsPerUnit: 10.4,
  weaveScale: 0.55,
};
const PLAIN = { ...CANVAS, baseColor: [0.9, 0.89, 0.86, 1] };

// The source is z-up and a third again as wide as it is deep. x is its width,
// y its depth and z its height; the product wants depth on x, height on y and
// width on z, which is the cycle below. `rest` stands it on the same spot the
// bag has always stood on, so the camera framing does not move.
const raw = readObj(sourceModel("tote-bag.obj"));
const source = boxOf(raw.positions);
const placed = placeObj(raw, { axes: ["y", "z", "x"], rest: [0, 0.31, 0], scale: WIDTH / source.size[0] });
const doc = objDocument(placed, { material: "Canvas" });

await MeshoptSimplifier.ready;
await doc.transform(weld(), simplify({ error: 0.002, ratio: KEEP, simplifier: MeshoptSimplifier }));

/**
 * The bag measured as the thing it is: rings of cloth, one above another.
 *
 * Full bleed is what makes this necessary. A platen print sits on the flat of a
 * panel and a plane is a fine thing to project it onto; a print that runs to
 * the folds does not, because a plane cannot hold a fold. Measured on this bag,
 * projecting a gusset onto the plane it faces left the typical face carrying
 * 1.42 times less ink per square millimetre than the flat middle of the same
 * panel -- the design squeezed into the corners -- and no rectangle in that
 * plane covered more than 0.92 of the panel.
 *
 * `unrollAround` answers both by measuring distance along the cloth instead.
 * The handles are left out of it: they hang outside the rings they would
 * otherwise widen, and they are the two shells that are not the bag.
 */
const corners = [];
for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
  const pos = prim.getAttribute("POSITION"), idx = prim.getIndices();
  const count = idx ? idx.getCount() : pos.getCount();
  for (let i = 0; i < count; i += 3) {
    corners.push({ world: [0, 1, 2].map((k) => pos.getElement(idx ? idx.getScalar(i + k) : i + k, [0, 0, 0])) });
  }
}
assignShells(corners);
const bag = corners.filter((f) => f.shell === 0).map((f) => f.world);
const roll = unrollAround(bag);

// The bag's own floor and mouth, which the two horizontal seams are measured
// from. Taken off the bag rather than off the whole model, whose top is the
// handles standing 238mm above the mouth.
let floor = Infinity, mouth = -Infinity;
for (const t of bag) for (const w of t) { floor = Math.min(floor, w[1]); mouth = Math.max(mouth, w[1]); }

/** Which zone each of the four sides is, by the way it faces. */
const SIDE = { "+x": "Bag_Back", "+z": "Bag_Right", "-x": "Bag_Front", "-z": "Bag_Left" };

/**
 * Where the printed cloth starts and stops up the bag.
 *
 * Both are real lines on a real tote: the base is a separate panel stitched on
 * at the bottom of the roll, and the mouth is turned under and topstitched. So
 * both are stated as a height and cut as one, which is what makes them
 * straight. Deciding them from which way a face points instead -- the wall
 * turns down onto the base over four millimetres, and over the rim in two --
 * puts the boundary wherever the triangles happen to fall, and the design's
 * edge comes out a zigzag four millimetres deep.
 *
 * A piece is printed only if it lies wholly between the two, rather than merely
 * have its middle between them. The cut leaves corners on the line to within a
 * rounding error, but a crossing landing within a hair of an existing corner
 * takes that corner instead of adding one, so a few slivers along each seam do
 * straddle it. Judged by their middles they scattered twenty specks of printed
 * cloth into the hem, each a fraction of a square millimetre and each its own
 * island in the atlas; judged the other way round they take plain canvas into
 * the print, which is the same defect facing the other way. Whole or not at
 * all, and a straddler goes to the plain cloth, where a sliver among more of
 * the same is nothing at all.
 */
const SEAM = { base: 3.5 * MM, hem: 3 * MM };
/** Below anything the model can tell apart, and far above float noise. */
const HAIR = 1e-6;

const box = boxOf(placed.positions);
console.log(`  placed ${box.size.map((n) => (n * 66.84).toFixed(0)).join(" x ")} mm, `
  + `${raw.triangles.length} triangles kept to ${doc.getRoot().listMeshes()
    .flatMap((m) => m.listPrimitives()).reduce((n, p) => n + p.getIndices().getCount() / 3, 0)}`);

const report = await prepZones({
  /**
   * Which part of the bag a triangle is.
   *
   * The handles are shells of their own, so they are found by being one rather
   * than by height: testing height put webbing into the front and back print
   * zones on the old model, which printed artwork onto the straps.
   *
   * The bag is closed, so every panel has an inside as well as an outside and
   * the two face opposite ways. A face is outside if it looks away from the
   * middle of the bag, and only the outside is ever printed on -- otherwise the
   * front's design catches the back of the lining, which sits a few
   * millimetres behind it and would print in mirror image.
   *
   * Which side it is asks the same measurement the unwrap uses, so what a face
   * is called and where its design lands cannot disagree: each side ends
   * exactly where the next one's cloth begins.
   *
   * The outward tests ask the shading normal, which is the average over the
   * cloth around a face and so is steady where a single triangle is not.
   * Simplifying the mesh turns about fifteen of its 60,220 faces inside out,
   * and asking those the wrong question puts holes in the outer skin: an
   * earlier version asked the triangle itself for the inside-outside test too,
   * and free edges went from none to eight.
   */
  classify: (f) => {
    if (f.shell !== 0) return "Bag_Handles";
    const middle = f.shellInfo.centre;
    if (f.WN.reduce((sum, n, q) => sum + n * (f.C[q] - middle[q]), 0) <= 0) return "Bag_Lining";
    // The bottom is a separate piece of cloth and takes no design.
    const ys = f.world.map((w) => w[1]);
    if (Math.min(...ys) < floor + SEAM.base - HAIR) return "Bag_Base";
    // The mouth's hem: the last few millimetres, where the cloth turns over the
    // rim and starts back down inside. A printed panel stops at the top of its
    // hem on a real bag, and an unwrap that runs up the side of this one could
    // not hold that fold anyway -- the design arrived there doubled back on
    // itself, 136 faces of the front alone at half a millimetre below the
    // crest, pointing up and inward at once.
    if (Math.max(...ys) > mouth - SEAM.hem + HAIR) return "Bag_Lining";
    // Inside the rim, below the hem. The outward test above measures away from
    // the middle of the whole bag, and near the mouth that is mostly upward, so
    // it reads the inner face of the rim as outward and prints on it -- twenty
    // specks of design on the wrong side of the cloth, each its own island in
    // the atlas because the outer skin they belong to is on the other side of
    // the fold. Measured only across, an inner face points inward wherever it
    // sits. This one asks the triangle, because a fold one triangle wide
    // averages to nothing useful.
    const facet = faceNormal(f);
    if (facet[0] * (f.C[0] - middle[0]) + facet[2] * (f.C[2] - middle[2]) <= 0) return "Bag_Lining";
    return SIDE[roll.facing(f.C)];
  },
  input: doc,
  // Nothing falls through -- every outward face is one of the four sides or the
  // base, and every inward one is lining -- but a leftover is required, and the
  // base is the part a stray would least disfigure.
  leftover: "Bag_Base",
  material: "Canvas",
  output: repoPath("public", "models", "tote-bag.glb"),
  // Divide the cloth along every line a zone ends on, before deciding what
  // anything is: the four folds, the base seam and the mouth's hem. A boundary
  // decided per whole triangle is a sawtooth as deep as the triangles are big,
  // and these are the boundaries between one uploaded design and the next.
  seams: [...roll.seams(), (w) => w[1] - (floor + SEAM.base), (w) => w[1] - (mouth - SEAM.hem)],
  // A fold in cotton duck is a soft one. Past 50 degrees the cloth is doubled
  // over -- the mouth, the base seam, the edge of a strap -- and that is a line
  // you can see; below it the surface is slack cloth and shading across it is
  // what makes it read as cloth rather than as a box.
  smoothCreases: { thresholdDegrees: 50 },
  zones: {
    // Each side is the whole panel, edge to edge. The design runs into the
    // corner folds and under the handle stitching, which is what a sublimated
    // bag does; the 240mm platen this replaces was a screen printer's rectangle
    // and left three quarters of every side plain.
    //
    // Each unwrap runs left to right as somebody standing in front of that side
    // sees it, so none of the four needs reversing to read the right way round.
    Bag_Front: { ...CANVAS, flatten: true, template: template("tote-bag-front"), unwrap: roll.sector("-x"), weaveAxes: ["z", "y"] },
    Bag_Back: { ...CANVAS, flatten: true, template: template("tote-bag-back"), unwrap: roll.sector("+x"), weaveAxes: ["z", "y"] },
    Bag_Left: { ...CANVAS, flatten: true, template: template("tote-bag-left"), unwrap: roll.sector("-z"), weaveAxes: ["x", "y"] },
    Bag_Right: { ...CANVAS, flatten: true, template: template("tote-bag-right"), unwrap: roll.sector("+z"), weaveAxes: ["x", "y"] },
    // The bottom, which takes no design: it is a separate piece of cloth on a
    // real bag and it is the one outward surface nobody sees.
    Bag_Base: { ...PLAIN, weaveAxes: ["x", "z"] },
    Bag_Handles: { ...PLAIN, weaveAxes: ["z", "y"] },
    // The inside of the bag, which you look straight down into. Same cloth, and
    // never printed on.
    Bag_Lining: { ...PLAIN, weaveAxes: ["z", "y"] },
  },
});

for (const [zone, { span, tris }] of Object.entries(report)) {
  console.log(`  ${zone.padEnd(13)} ${String(tris).padStart(6)} tris  span ${span ? span.join(" x ") : "-"}`);
}
