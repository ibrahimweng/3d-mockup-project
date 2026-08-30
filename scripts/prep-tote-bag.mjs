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
 * Each handle is a connected component of its own, so the classifier splits on
 * that. Testing height instead put 161 triangles of webbing into the front and
 * back print zones -- artwork printed onto the straps.
 */

import { prepZones, repoPath, sourceModel } from "./prep-model-zones.mjs";

const template = (name) => repoPath("public", "templates", `${name}.png`);

/**
 * Cotton duck, at the density cotton duck actually has.
 *
 * The file ships no normal map, so unlike the shirt there is nothing to restore
 * and this is a supplied one. The density is measured rather than chosen to
 * look right: the bag's front panel is 5.685 units across and a tote of this
 * shape is about 38cm wide, which puts a unit at 6.7cm. The tile carries eight
 * thread crossings, so 10.4 tiles per unit lands about 1.2 threads to the
 * millimetre -- the coarse end of canvas, which is what a tote is. Laying it
 * out from world position rather than from the unwrap is what keeps the narrow
 * sides reading as the same cloth as the front.
 */
const CANVAS = {
  metalness: 0,
  roughness: 0.78,
  weaveFile: repoPath("public", "textures", "canvas-normal.png"),
  weaveRepeatsPerUnit: 10.4,
  weaveScale: 0.55,
};

/**
 * How far down a handle follows the bag as it inflates.
 *
 * Not a classifier. The handles are shells of their own and the classifier says
 * so directly; this is the shape blend, and it has to reach below where the
 * handles start so their roots travel with the panel they are stitched to
 * instead of tearing away from it. The bag's own top edge is at 6.249, so every
 * triangle of the body is below this line and every triangle above it is handle.
 */
const HANDLE_FOLLOW_Y = 6.51;

/**
 * World units to millimetres.
 *
 * The bag's front panel measures 5.685 across and a tote of this shape is about
 * 380mm wide, which is where this comes from. Everything below is stated as a
 * real print size and converted, because a screen-print platen is a physical
 * object and its size is the reason the print area is the size it is.
 */
const MM = 1 / 66.84;

/**
 * What actually prints: a centred rectangle the size of a real platen.
 *
 * The panels were printed edge to edge before, which sounds generous and is
 * not: the print ran over the base fold and under the handle stitching, so part
 * of every design landed where nobody could see it, and the template a user
 * downloaded was not a picture of what they would get. 240mm on a 380 by 393mm
 * panel is a common tote print, and leaves about 70mm of plain canvas all round.
 *
 * The gussets take a side-logo print rather than a scaled-down panel one. They
 * are not the same shape as the panels and not the same shape at every height:
 * measured in bands, a gusset runs 131mm across at the base and 220mm at the
 * mouth, because the bag tapers. A rectangle sized for the widest part hangs
 * off the cloth at the narrowest, which is what a first pass at 100 by 240
 * did -- the overhang showed up as coverage of 0.92 and a pair of free edges
 * where the print area had nothing under it.
 */
const PLATEN = { front: [240 * MM, 240 * MM], gusset: [80 * MM, 120 * MM] };

// Front and back are the same panel mirrored, and so are the gussets, so each
// pair takes its print area from the pair's shared extent rather than from its
// own. Measured separately they land 2mm apart, and the bag ends up cut on both
// sets of lines with a ribbon of slivers in between.
/**
 * The mouth, turned under.
 *
 * A tote's mouth is the edge you look straight down into when the bag is open,
 * and unhemmed it is one vertex thick. 25mm is a normal tote hem. The rim reads
 * 3mm because a hem is the cloth turned back on itself, so there are two layers
 * of a 1.5mm cotton duck in it.
 */
const HEM = { segments: 6, thickness: 3 * MM, width: 25 * MM };

const PANELS = ["Bag_Front", "Bag_Back"];
const GUSSETS = ["Bag_Left", "Bag_Right"];

// The bag is modelled as a flat panel with almost no volume. Pushing the two
// faces apart about the centre plane, with the handles held still and a taper
// toward the base, gives it the depth a bag has when something is in it.
const CENTRE_X = -0.06;
const DEPTH = 1.9;
const deformWorld = (w) => {
  if (w[1] >= HANDLE_FOLLOW_Y) return w;
  const drop = Math.min(1, Math.max(0, (w[1] - 0.31) / (HANDLE_FOLLOW_Y - 0.31)));
  const grow = 1 + (DEPTH - 1) * (0.35 + 0.65 * drop);
  return [CENTRE_X + (w[0] - CENTRE_X) * grow, w[1], w[2]];
};

const report = await prepZones({
  classify: (f) => {
    if (f.shell !== 0) return "Bag_Handles";
    const [nx, ny, nz] = f.WN;
    if (ny < -0.6) return "Bag_Base";
    // The bag is yawed 90 degrees to face the camera, which sends -X to +Z.
    if (nx < -0.6) return "Bag_Front";
    if (nx > 0.6) return "Bag_Back";
    if (nz < -0.6) return "Bag_Left";
    if (nz > 0.6) return "Bag_Right";
    return "Bag_Trim";
  },
  deformWorld,
  // One rim on the canvas, and it is the mouth: the handles are their own
  // shells and the base is sewn shut.
  hems: [{ ...HEM, loops: 1, zone: "Bag_Canvas" }],
  input: sourceModel("tote-bag.glb"),
  leftover: "Bag_Trim",
  material: "Default",
  output: repoPath("public", "models", "tote-bag.glb"),
  // The bag met itself at its vertical corners with no transition, which reads
  // as folded card rather than as canvas with something in it. Rounding the
  // folds is the shape change; boundary vertices are pinned, so the handles
  // keep their width instead of being pulled into threads.
  roundCreases: { iterations: 6, strength: 0.5, thresholdDegrees: 25 },
  regions: {
    Bag_Front: { axes: ["z", "y"], from: PANELS, outside: "Bag_Canvas", size: PLATEN.front },
    Bag_Back: { axes: ["z", "y"], from: PANELS, outside: "Bag_Canvas", size: PLATEN.front },
    Bag_Left: { axes: ["x", "y"], from: GUSSETS, outside: "Bag_Canvas", size: PLATEN.gusset },
    Bag_Right: { axes: ["x", "y"], from: GUSSETS, outside: "Bag_Canvas", size: PLATEN.gusset },
  },
  zones: {
    Bag_Front: { ...CANVAS, template: template("tote-bag-front"), unwrap: ["z", "y"] },
    // Mirrored so artwork reads correctly from behind rather than reversed.
    Bag_Back: { ...CANVAS, flipU: true, template: template("tote-bag-back"), unwrap: ["z", "y"] },
    Bag_Left: { ...CANVAS, flipU: true, template: template("tote-bag-left"), unwrap: ["x", "y"] },
    Bag_Right: { ...CANVAS, template: template("tote-bag-right"), unwrap: ["x", "y"] },
    // The panel outside the print area. Plain cloth, and the same colour slot as
    // the rest of the bag, so a user can change the bag's colour under a design.
    Bag_Canvas: { ...CANVAS, baseColor: [0.9, 0.89, 0.86, 1] },
    Bag_Handles: { ...CANVAS, baseColor: [0.9, 0.89, 0.86, 1] },
    Bag_Base: { ...CANVAS, baseColor: [0.9, 0.89, 0.86, 1] },
    Bag_Trim: { ...CANVAS, baseColor: [0.9, 0.89, 0.86, 1] },
  },
});

for (const [zone, { span, tris }] of Object.entries(report)) {
  console.log(`  ${zone.padEnd(13)} ${String(tris).padStart(5)} tris  span ${span ? span.join(" x ") : "-"}`);
}
