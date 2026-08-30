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

import { faceNormal } from "./prep-model-geometry.mjs";
import { boxOf, objDocument, placeObj, readObj } from "./prep-model-obj.mjs";
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

/**
 * What actually prints: a centred rectangle the size of a real platen.
 *
 * Printing a panel edge to edge sounds generous and is not: the print runs over
 * the base fold and under the handle stitching, so part of every design lands
 * where nobody can see it, and the template a user downloads is not a picture
 * of what they will get. 240mm on a 380 by 374mm panel is a common tote print
 * and leaves about 70mm of plain canvas all round.
 *
 * The gussets take a side-logo print rather than a scaled-down panel one. They
 * are 155mm across, so a rectangle sized like the panels' would hang off the
 * cloth at both edges.
 */
const PLATEN = { front: [240 * MM, 240 * MM], gusset: [80 * MM, 120 * MM] };

// Front and back are the same panel mirrored, and so are the gussets, so each
// pair takes its print area from the pair's shared extent rather than from its
// own. Measured separately they land a couple of millimetres apart, and the bag
// ends up cut on both sets of lines with a ribbon of slivers in between.
const PANELS = ["Bag_Front", "Bag_Back"];
const GUSSETS = ["Bag_Left", "Bag_Right"];

/**
 * How squarely a face has to point along an axis to be that side of the bag.
 *
 * The cloth is slack, so no panel is flat and no threshold catches all of one.
 * What is left over is canvas either way -- the rounded corners join the plain
 * cloth outside the print areas -- so this only has to be tight enough that a
 * corner never lands in a print zone.
 */
const SQUARELY = 0.6;

// Which side of the bag a normal pointing this way belongs to: the axis, and
// the direction along it. The bag is yawed 90 degrees to face the camera, which
// sends -X to +Z, so the panel at -X is the one a viewer calls the front.
const SIDES = [
  ["Bag_Base", 1, -1],
  ["Bag_Front", 0, -1],
  ["Bag_Back", 0, 1],
  ["Bag_Left", 2, -1],
  ["Bag_Right", 2, 1],
];

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
   * front's print area catches the back of the lining, which sits directly
   * behind it and inside the same rectangle.
   *
   * Both of those ask the shading normal, which is the average over the cloth
   * around a face and so is steady where a single triangle is not. Joining a
   * print zone additionally asks the triangle itself, and only for the sign:
   * simplifying the mesh turns about fifteen of its 60,220 faces inside out,
   * and a face whose shading says front while its surface faces back arrives in
   * the print zone reading mirrored. One of them was four times the median size
   * -- a patch of any design printed in reverse. They go to plain canvas, which
   * is where a scrap of cloth folded away from the platen belongs.
   *
   * Asking the triangle for the other two decisions as well, which a first
   * version did, is what those fifteen faces punish: the grazing ones flip the
   * inside-outside test, which puts holes in the outer skin. Free edges went
   * from none to eight and the front print area came apart into four islands.
   */
  classify: (f) => {
    if (f.shell !== 0) return "Bag_Handles";
    const middle = f.shellInfo.centre;
    if (f.WN.reduce((sum, n, q) => sum + n * (f.C[q] - middle[q]), 0) <= 0) return "Bag_Lining";
    const side = SIDES.find(([, axis, sign]) => f.WN[axis] * sign > SQUARELY);
    if (!side) return "Bag_Canvas";
    const [name, axis, sign] = side;
    return faceNormal(f)[axis] * sign > 0 ? name : "Bag_Canvas";
  },
  input: doc,
  leftover: "Bag_Canvas",
  material: "Canvas",
  output: repoPath("public", "models", "tote-bag.glb"),
  regions: {
    // Each panel's leftover cloth goes to the canvas that lies in its own plane,
    // so the weave on it is laid out from axes the cloth is actually in.
    Bag_Front: { axes: ["z", "y"], from: PANELS, outside: "Bag_Canvas", size: PLATEN.front },
    Bag_Back: { axes: ["z", "y"], from: PANELS, outside: "Bag_Canvas", size: PLATEN.front },
    Bag_Left: { axes: ["x", "y"], from: GUSSETS, outside: "Bag_Gusset", size: PLATEN.gusset },
    Bag_Right: { axes: ["x", "y"], from: GUSSETS, outside: "Bag_Gusset", size: PLATEN.gusset },
  },
  // A fold in cotton duck is a soft one. Past 50 degrees the cloth is doubled
  // over -- the mouth, the base seam, the edge of a strap -- and that is a line
  // you can see; below it the surface is slack cloth and shading across it is
  // what makes it read as cloth rather than as a box.
  smoothCreases: { thresholdDegrees: 50 },
  zones: {
    Bag_Front: { ...CANVAS, template: template("tote-bag-front"), unwrap: ["z", "y"] },
    // Mirrored so artwork reads correctly from behind rather than reversed.
    Bag_Back: { ...CANVAS, flipU: true, template: template("tote-bag-back"), unwrap: ["z", "y"] },
    Bag_Left: { ...CANVAS, flipU: true, template: template("tote-bag-left"), unwrap: ["x", "y"] },
    Bag_Right: { ...CANVAS, template: template("tote-bag-right"), unwrap: ["x", "y"] },
    // The cloth outside the print areas, on the same colour slot as the rest of
    // the bag so a user can change the bag's colour under a design. Split from
    // the gussets and the base only so each takes its weave from the plane it
    // lies in: threads run across a panel, not down a world axis.
    Bag_Canvas: { ...PLAIN, weaveAxes: ["z", "y"] },
    Bag_Gusset: { ...PLAIN, weaveAxes: ["x", "y"] },
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
