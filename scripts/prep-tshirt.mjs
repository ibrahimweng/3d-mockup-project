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
await copyFile(source, repoPath("public", "models", "tshirt.glb"));
console.log("wrote public/models/tshirt.glb");
