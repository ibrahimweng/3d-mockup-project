#!/usr/bin/env node
/**
 * Build the T-shirt: a heavyweight cotton tee, photographed close up.
 *
 * Usage:
 *   node scripts/prep-tshirt.mjs
 *
 * Reads the bought source named in `sourceModel` below, writes
 * `public/models/tshirt.glb`, and embeds the templates from `public/templates`.
 *
 * Runs in three passes because the garment ships three cotton materials, one
 * per panel group, each split and unwrapped against its own pieces.
 */

import { copyFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";

import { faceNormal, mulP } from "./prep-model-geometry.mjs";
import { unrollAround } from "./prep-model-wrap.mjs";
import { prepZones, repoPath, sourceModel } from "./prep-model-zones.mjs";

const template = (name) => repoPath("public", "templates", `${name}.png`);
const build = (name) => repoPath("build", name);

// The weave normal map belongs to the fabric rather than to any printed design,
// so it is left alone; only base colour is rebuilt here.
const COTTON = { metalness: 0, roughness: 0.86 };

await mkdir(repoPath("build"), { recursive: true });

/**
 * The stitched source, with its topstitch removed first.
 *
 * It is 590,408 triangles of thread over thirty-five meshes -- 96 per cent of
 * the model and the whole reason the file was 22MB -- and at anything but an
 * extreme close-up each stitch lands smaller than a pixel and aliases into a
 * broken grey line with clumped ends, which reads as a smudge on the fabric
 * rather than as stitching.
 */
const noStitch = build("tshirt-nostitch.glb");
if (!existsSync(noStitch)) {
  execFileSync("node", [
    repoPath("scripts", "clean-model.mjs"), sourceModel("tshirt.glb"), noStitch,
    "--keep-geometry",
    "--drop-material", "Default_Topstitch_2803.002",
    "--drop-material", "Default_Topstitch_2747.001",
  ], { stdio: "inherit" });
}

// The modeller already cut this garment into pieces: each panel and each sleeve
// is its own primitive under its material. Splitting on those pieces gives every
// face a zone, where a normal-direction threshold left a ragged grey band down
// every seam -- a quarter of the front panel curves through any threshold you
// pick, because a shoulder is where the surface turns over.
const passes = [
  // Front material: the panel, plus two hem facings a couple of centimetres
  // tall that are stitched under it and take no print.
  ["Cotton_Heavy_Twill_116740", "Shirt_Front_Trim", {
    Shirt_Front: { ...COTTON, template: template("tshirt-front"), unwrap: ["x", "y"] },
  }, (f) => (f.ownerBox.size[1] > 0.1 ? "Shirt_Front" : null)],

  ["Cotton_Heavy_Twill_116740.010", "Shirt_Back_Trim", {
    Shirt_Back: { ...COTTON, flipU: true, template: template("tshirt-back"), unwrap: ["x", "y"] },
  }, () => "Shirt_Back"],

  ["Cotton_Heavy_Twill_Copy_1_116819", "Shirt_Sleeve_Trim", {
    // The outer face of a sleeve looks along X, so the image is projected onto
    // the plane across from it.
    //
    // Which of the two carries the flip is decided by where the camera stands
    // to see that sleeve, not by which sleeve it is. Looking at the left sleeve
    // means standing at -X facing +X, and world +Z is then to the right, so u
    // rising with z already reads left to right. Standing at +X to see the
    // right sleeve reverses that. The flip was on the left sleeve and both came
    // out mirrored, which is what a swap looks like from outside.
    Shirt_Sleeve_Left: { ...COTTON, template: template("tshirt-sleeve-left"), unwrap: ["z", "y"] },
    Shirt_Sleeve_Right: { ...COTTON, flipU: true, template: template("tshirt-sleeve-right"), unwrap: ["z", "y"] },
  }, (f) => (f.ownerBox.centre[0] < 0 ? "Shirt_Sleeve_Left" : "Shirt_Sleeve_Right")],
];

let source = noStitch;
for (const [material, leftover, zones, classify] of passes) {
  const step = build("tshirt.step.glb");
  const report = await prepZones({
    classify, input: source, leftover, material, output: step, trimStyle: COTTON, zones,
  });
  for (const [zone, { span, tris }] of Object.entries(report)) {
    console.log(`  ${zone.padEnd(20)} ${String(tris).padStart(6)} tris  span ${span ? span.join(" x ") : "-"}`);
  }
  source = build(`tshirt.stage-${material.slice(-6)}.glb`);
  await copyFile(step, source);
}
/**
 * What actually prints, in one last pass with every panel present.
 *
 * A design fills its panel: front and back from the shoulder to the hem and
 * side seam to side seam, each sleeve from the armhole to the cuff. The
 * boundaries are the garment's own -- the modeller cut this shirt into pieces
 * and each panel is its own primitive -- so nothing has to be guessed and no
 * edge comes out a sawtooth. What replaced is a 240 by 320mm platen on the
 * chest and a 60mm patch on each sleeve, which between them printed on an
 * eighth of the cloth.
 *
 * The platen was there for a reason, and this is the answer to it. A panel is
 * not flat: it wraps round the body, and where it curved past the direction it
 * was projected along -- the sides of the chest, the underside of a sleeve --
 * its triangles projected back to front and their slice of the design came out
 * mirrored, 156 of them on the front and about 670 on each sleeve. So the
 * design follows the cloth instead of a plane. The shirt is sliced into rings,
 * each ring is walked round to give distance travelled, and a point sits where
 * it falls along its own ring.
 *
 * Rings across the body for the panels, and rings across each sleeve's own axis
 * for the sleeves, because a sleeve is a tube lying at about forty degrees to
 * every world axis and a horizontal slice of one is not a ring.
 */
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const stitched = await io.read(source);

/** Every triangle of the garment, in world space, under the piece it belongs to. */
const cloth = new Map();
for (const node of stitched.getRoot().listNodes()) {
  const mesh = node.getMesh();
  if (!mesh) continue;
  const m = node.getWorldMatrix();
  for (const prim of mesh.listPrimitives()) {
    const name = prim.getMaterial()?.getName() ?? "";
    const pos = prim.getAttribute("POSITION"), idx = prim.getIndices();
    const count = idx ? idx.getCount() : pos.getCount();
    const list = cloth.get(name) ?? cloth.set(name, []).get(name);
    for (let i = 0; i < count; i += 3) {
      list.push([0, 1, 2].map((k) => mulP(m, pos.getElement(idx ? idx.getScalar(i + k) : i + k, [0, 0, 0]))));
    }
  }
}

const BODY = ["Shirt_Front", "Shirt_Back"];
const SLEEVES = ["Shirt_Sleeve_Left", "Shirt_Sleeve_Right"];

/**
 * A sleeve's own axis, and where its rings start.
 *
 * From the middle of the fifth nearest the body to the middle of the fifth
 * furthest from it, which is armhole to cuff. Taking the direction the sleeve
 * is most spread along instead -- the obvious thing, and what a first version
 * did -- gives an axis six degrees steeper, because a flared sleeve is spread
 * across as much as along. Six degrees is enough to walk the axis out through
 * the cloth: the nearest point of the surface fell to 2mm from it, and a ring
 * measured about an axis lying on its own surface spins.
 *
 * The rings start underneath, so that is where a design going all the way round
 * has its join, which is where a sleeve is sewn.
 */
function sleeveFrame(name) {
  const points = cloth.get(name).flat();
  const centre = [0, 1, 2].map((q) => points.reduce((sum, p) => sum + p[q], 0) / points.length);
  const out = name.endsWith("Left") ? -1 : 1;
  const reach = points.map((p) => p[0] * out).sort((a, b) => a - b);
  const middle = (of) => {
    const some = points.filter(of);
    return [0, 1, 2].map((q) => some.reduce((sum, p) => sum + p[q], 0) / some.length);
  };
  const armhole = middle((p) => p[0] * out <= reach[Math.floor(reach.length * 0.2)]);
  const cuff = middle((p) => p[0] * out >= reach[Math.floor(reach.length * 0.8)]);
  const along = [0, 1, 2].map((q) => cuff[q] - armhole[q]);
  const length = Math.hypot(...along) || 1;
  return { axis: along.map((c) => c / length), centre };
}

/**
 * One unroll per zone, each starting its count where that zone's design should
 * start and stop.
 *
 * The body panels are measured on rings taken across both of them at once,
 * because a horizontal slice of a shirt is a ring only if the front and the
 * back are both in it. Each panel then counts from the middle of the other,
 * which puts the one place the count jumps as far from its own cloth as the
 * garment allows.
 */
const body = BODY.flatMap((name) => cloth.get(name));
const roll = {
  Shirt_Front: unrollAround(body, { seam: [0, 0, -1] }),
  Shirt_Back: unrollAround(body, { seam: [0, 0, 1] }),
};
for (const name of SLEEVES) {
  roll[name] = unrollAround(cloth.get(name), {
    axis: sleeveFrame(name).axis, partial: "fill", seam: [0, -1, 0],
  });
}

const MM = 1 / 1000;   // the source's own texture coordinates are in millimetres
/**
 * The band at the hem that the print stops short of.
 *
 * A tee's hem is turned under and topstitched, and it has to belong to a zone
 * of its own for the fold to be added later: `hems` turns the three longest
 * rims of the body cloth under, and if the panels own those rims there is no
 * body cloth left holding one. Stated as a height and cut as one, which makes
 * it a straight line rather than a sawtooth.
 */
const HEM_BAND = 32 * MM;
/** Below anything the model can tell apart, and far above float noise. */
const HAIR = 1e-9;

const floor = Math.min(...body.flat().map((p) => p[1]));
const hemLine = floor + HEM_BAND;
/**
 * How far along each sleeve the design runs: all of it, cuff to shoulder.
 *
 * The head of a sleeve is not a tube -- the armhole is cut along a curve a
 * third of the way back down its own axis -- so it used to stay plain for want
 * of anything to measure a way round from, leaving a third of each arm in flat
 * colour that read as a contrast raglan yoke. `partial: "fill"` closes its
 * slices now, at the price the baselines record. Only the last few millimetres
 * at the cuff stay plain: the fold turned under there is built out of cloth
 * the print does not own.
 */
const CUFF_BAND = 8 * MM;
const alongSleeve = {};
for (const name of SLEEVES) {
  const at = (w) => roll[name].across()(w)[1];
  const [, end] = roll[name].tube();
  const head = Math.min(...cloth.get(name).flat().map(at)) - HAIR;
  alongSleeve[name] = { at, cuff: end - CUFF_BAND, head };
}

/**
 * Hem, cuffs and neck, turned under.
 *
 * The three longest rims on the body cloth are the hem and the two cuffs, in
 * that order, and the longest on the collar rib is the neck. Unhemmed each is
 * one vertex thick, which is what gives a close-up shot away. 20mm is a normal
 * jersey hem and 10mm a collar's. The rims read at twice the cloth, because a
 * hem is the cloth turned back on itself: 2.4mm for a heavyweight jersey, 4mm
 * for a 1x1 rib, which is a good deal thicker than the body.
 */
const HEMS = [
  { loops: 3, segments: 6, thickness: 2.4 * MM, width: 20 * MM, zone: "Shirt_Body" },
  { loops: 1, segments: 6, thickness: 4 * MM, width: 10 * MM, zone: "Rib_1X1_486gsm_116764" },
];

/**
 * The woven label at the back of the neck.
 *
 * 720 triangles across 33mm, and the one material of the eight in the file that
 * no pass touched and no catalog entry named: it kept the source's own material
 * and the source's own texture, at roughness 0.5 where every other piece of
 * cloth here is 0.86. It goes into the body cloth, which is what the back of a
 * collar is made of, and takes the main colour with the rest of the shirt
 * instead of staying whatever the file happened to bake into it.
 */
const LABEL = "Cotton_Heavy_Twill_116740.004";

const printed = await prepZones({
  /**
   * Which piece of the garment a triangle is.
   *
   * The modeller already cut this shirt up, so a face is whatever piece it came
   * on -- except at the hem and the cuffs, where the printed panel stops short
   * and hands the last band to the plain cloth that is about to be turned
   * under. A piece has to be wholly inside the band to be printed, so a sliver
   * left straddling the cut by the snap goes to the plain cloth rather than
   * putting a speck of design on a fold.
   */
  classify: (f) => {
    const piece = f.source.getName();
    if (piece === LABEL) return "Shirt_Body";
    const ys = f.world.map((w) => w[1]);
    if (BODY.includes(piece) && Math.min(...ys) < hemLine - HAIR) return "Shirt_Body";
    const sleeve = alongSleeve[piece];
    if (sleeve) {
      const along = f.world.map(sleeve.at);
      const inside = Math.min(...along) > sleeve.head - HAIR && Math.max(...along) < sleeve.cuff + HAIR;
      if (!inside) return "Shirt_Body";
    } else if (!BODY.includes(piece)) {
      return piece;
    }
    // Cloth tucked into a fold: the inside of a side seam, the crease under an
    // arm. It is part of the panel and it faces inward, so an unwrap measured
    // round the outside has nothing to say about it and its slice of the design
    // arrives backwards -- eleven triangles down the back's side seams and half
    // a dozen in each underarm. It goes to the plain cloth, which is where a
    // seam allowance belongs, and it is hidden in the fold either way.
    const facet = faceNormal(f);
    const out = roll[piece].outward(f.C);
    return facet[0] * out[0] + facet[1] * out[1] + facet[2] * out[2] > 0 ? piece : "Shirt_Body";
  },
  hems: HEMS,
  input: stitched,
  leftover: "Shirt_Body",
  // The collar rib is in the cut without being printed on: it shares eighty
  // edges with the panels around the neck, and cutting one side of those seams
  // without the other opened 113mm of them.
  material: [...BODY, ...SLEEVES, "Shirt_Front_Trim", "Rib_1X1_486gsm_116764", LABEL],
  output: build("tshirt.printed.glb"),
  // Every line a design ends on that the garment does not already draw: the
  // hem, each sleeve's two ends, and the underarm join where a sleeve's design
  // starts and stops. Everything else is a seam the modeller already cut.
  seams: [
    (w) => w[1] - hemLine,
    ...SLEEVES.flatMap((name) => [
      (w) => alongSleeve[name].at(w) - alongSleeve[name].head,
      (w) => alongSleeve[name].at(w) - alongSleeve[name].cuff,
      roll[name].start(),
    ]),
  ],
  trimStyle: COTTON,
  zones: {
    // Each panel measured round the cloth rather than projected onto a plane,
    // and each running left to right as somebody facing it sees it.
    Shirt_Front: { ...COTTON, flatten: true, template: template("tshirt-front"), unwrap: roll.Shirt_Front.across(), weaveAxes: ["x", "y"] },
    Shirt_Back: { ...COTTON, flatten: true, template: template("tshirt-back"), unwrap: roll.Shirt_Back.across(), weaveAxes: ["x", "y"] },
    // Round the sleeve and along it, with the join at the underarm, which is
    // where a sleeve is sewn. Projected onto a plane instead the ink bunches up
    // where the cloth turns edge-on, which is most of a cone.
    Shirt_Sleeve_Left: { ...COTTON, flatten: true, template: template("tshirt-sleeve-left"), unwrap: roll.Shirt_Sleeve_Left.across(), weaveAxes: ["z", "y"] },
    Shirt_Sleeve_Right: { ...COTTON, flatten: true, template: template("tshirt-sleeve-right"), unwrap: roll.Shirt_Sleeve_Right.across(), weaveAxes: ["z", "y"] },
    Shirt_Front_Trim: { ...COTTON },
    /**
     * The collar rib and the facings turned under the hem.
     *
     * A ribbed collar is a different knit from the body and it should read as
     * one, but the file says that by making it black: base colour 0.0027 at
     * metallic 0.2423 and roughness 1. Carried across as authored, which an
     * earlier pass did, a plain white tee arrives with a black collar and a
     * black band round its hem -- a ringer tee nobody asked for, and the first
     * thing anyone notices about the garment.
     *
     * Nor is any of it a description of cotton. Every other piece of cloth on
     * this shirt is metallic 0 at roughness 0.86; a quarter-metallic knit at
     * full roughness is a default that survived from wherever the model was
     * authored. So the rib takes the same cotton finish, a shade duller than
     * the body because a 1x1 rib is a denser knit and catches less light. It is
     * on the accent colour slot, so a contrast collar is one pick away for
     * anyone who wants one.
     */
    Rib_1X1_486gsm_116764: { ...COTTON, baseColor: [0.94, 0.94, 0.93, 1], roughness: 0.9 },
    // The cloth outside every print area.
    Shirt_Body: { ...COTTON },
  },
});
for (const [zone, { span, tris }] of Object.entries(printed)) {
  console.log(`  ${zone.padEnd(20)} ${String(tris).padStart(6)} tris  span ${span ? span.join(" x ") : "-"}`);
}
await copyFile(build("tshirt.printed.glb"), repoPath("public", "models", "tshirt.glb"));
console.log("wrote public/models/tshirt.glb");
