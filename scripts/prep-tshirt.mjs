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
 * Runs in three passes because the garment ships three cotton materials -- one
 * per panel group -- and each has to be split and unwrapped against its own
 * pieces. Intermediates land in `build/`.
 */

import { copyFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

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
 * What actually prints, cut in one last pass with every panel present.
 *
 * A garment is not a rectangle and its panels are not flat, so unwrapping a
 * whole panel onto a square did two things wrong at once. Artwork ran off the
 * cloth at the edges -- the square is bigger than the panel -- and where the
 * panel curved past the direction it was projected along, at the sides of the
 * chest and under the sleeves, its triangles projected back to front and their
 * slice of the design came out mirrored: 156 triangles on the front, 411 on the
 * back, and about 670 on each sleeve.
 *
 * A printer has the same problem and solves it with a platen: a flat rectangle
 * of cloth held under the head. 240 by 320mm on the body is a standard chest
 * print, and it sits inside the 277mm the front panel keeps facing forward. The
 * sleeves take a patch, because a sleeve is a cone and the only part of it that
 * faces one way for long enough to print on is the outer upper face.
 *
 * The cut runs over every panel at once rather than per pass. The front and
 * back share ninety edges down their side seams, and cutting them separately
 * divides those edges in two different places, which opens the seam.
 */
const MM = 1 / 1000;   // the source's own texture coordinates are in millimetres
// The front keeps 277mm facing forward and the back only 185mm, so the back
// print is the narrower of the two. That is the garment, not a preference: the
// back panel wraps further round the body before the surface turns away, and
// artwork past that point projects back to front.
const CHEST_FRONT = [240 * MM, 320 * MM];
const CHEST_BACK = [180 * MM, 320 * MM];
// A sleeve is a cone. Only its outer upper face holds one direction long enough
// to print on, and that face measures about 84mm top to bottom.
const PATCH = [60 * MM, 60 * MM];
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

const BODY = ["Shirt_Front", "Shirt_Back"];
const SLEEVES = ["Shirt_Sleeve_Left", "Shirt_Sleeve_Right"];

const printed = await prepZones({
  classify: (f) => f.source.getName(),
  hems: HEMS,
  input: source,
  leftover: "Shirt_Body",
  // The collar rib is in the cut without being printed on. It shares eighty
  // edges with the panels around the neck, and cutting the panel side of those
  // seams without cutting the rib side opened 113mm of them.
  material: [...BODY, ...SLEEVES, "Shirt_Front_Trim", "Rib_1X1_486gsm_116764"],
  output: build("tshirt.printed.glb"),
  regions: {
    // Sat 75mm below the collar rather than centred on the panel, which is
    // where a chest print goes and where the panel is flattest.
    Shirt_Front: { axes: ["x", "y"], from: BODY, offset: [0, 0.064], outside: "Shirt_Body", size: CHEST_FRONT },
    Shirt_Back: { axes: ["x", "y"], from: BODY, offset: [0, 0.064], outside: "Shirt_Body", size: CHEST_BACK },
    // Measured on the sleeve's own surface, and each sleeve on its own: they are
    // mirror images, so one plane cannot serve both.
    Shirt_Sleeve_Left: { axes: "tangent", offset: [0, 0.092], outside: "Shirt_Body", size: PATCH },
    Shirt_Sleeve_Right: { axes: "tangent", offset: [0, 0.092], outside: "Shirt_Body", size: PATCH },
  },
  trimStyle: COTTON,
  zones: {
    Shirt_Front: { ...COTTON, template: template("tshirt-front"), unwrap: ["x", "y"] },
    Shirt_Back: { ...COTTON, flipU: true, template: template("tshirt-back"), unwrap: ["x", "y"] },
    // Laid on the sleeve rather than projected down an axis: the cone sits at
    // an angle to all three, and down any of them the ink bunches up where the
    // cloth turns edge-on.
    Shirt_Sleeve_Left: { ...COTTON, template: template("tshirt-sleeve-left"), unwrap: "tangent" },
    Shirt_Sleeve_Right: { ...COTTON, flipU: true, template: template("tshirt-sleeve-right"), unwrap: "tangent" },
    Shirt_Front_Trim: { ...COTTON },
    // Carried across as authored rather than restyled: a ribbed collar is a
    // different knit from the body and the file already says so.
    Rib_1X1_486gsm_116764: {
      baseColor: [0.0027, 0.0027, 0.0027, 1], metalness: 0.2423, roughness: 1,
    },
    // The cloth outside every print area.
    Shirt_Body: { ...COTTON },
  },
});
for (const [zone, { span, tris }] of Object.entries(printed)) {
  console.log(`  ${zone.padEnd(20)} ${String(tris).padStart(6)} tris  span ${span ? span.join(" x ") : "-"}`);
}
await copyFile(build("tshirt.printed.glb"), repoPath("public", "models", "tshirt.glb"));
console.log("wrote public/models/tshirt.glb");
