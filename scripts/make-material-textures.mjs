#!/usr/bin/env node
/**
 * Author the tiling maps the products themselves are made of.
 *
 * Separate from `make-surface-textures.mjs`, which dresses the table a product
 * stands on. These are at product scale and a good deal quieter: a tabletop is
 * a square metre of stone read across a whole frame, and a clipboard is a
 * hardboard panel a hand's width across, seen close. The same bench builds
 * both -- tiling noise, a normal taken from a height field, and files that meet
 * their own opposite edge without a seam.
 *
 * Every map here is relief and finish rather than a picture. A part that
 * prints -- the pad on the clipboard -- has to keep its base colour free for
 * the design, so what makes paper read as paper is its fibre and its matte
 * sheen, not a photograph of paper underneath the ink.
 *
 *   node scripts/make-material-textures.mjs
 */

import { mkdirSync } from "node:fs";

import {
  clamp,
  clamp01,
  fbm,
  normalFromHeight,
  OUT,
  ramp,
  SIZE,
  valueNoise,
  writeAlbedo,
  writeNormal,
  writePacked,
} from "./texture-lab.mjs";

// A quarter of the tabletops' resolution. These are small parts read at a few
// hundred pixels and tiled many times over, and a 1024-square normal map for a
// clipboard's clip is most of a megabyte spent on detail no frame resolves.
//
// Every lattice below is counted against this rather than against the square
// the noise is generated on. Paper's fibre was first written at 700 cells, and
// 700 cells resampled to 256 pixels is not fine paper -- it is grey, because
// each cell landed on a third of a pixel and averaged away. The pad came back a
// smooth white slab while the board beside it, whose flecking rides an albedo
// map that is never resampled, read correctly.
const MAP = 256;

/**
 * Hardboard: the pressed brown panel a clipboard is.
 *
 * It is not wood, and building it as wood is the way to get it wrong. A plank
 * has grain -- long parallel vessels running one way, which is what an oak
 * tabletop is made of. Hardboard is wood pulped back to fibre, laid down as a
 * mat with no direction at all, and pressed under heat until the lignin sets.
 * So its character is a fine even flecking with slow cloudiness behind it, the
 * cloudiness being where the mat lay thicker, and its face is smooth because a
 * hot platen made it so.
 */
async function hardboard() {
  const mat = valueNoise(SIZE, SIZE, 80, 80, 17);
  const fleck = valueNoise(SIZE, SIZE, 150, 150, 43);
  const cloud = fbm(SIZE, SIZE, 3, 3, 4, 71);
  const drift = fbm(SIZE, SIZE, 1, 1, 2, 131);

  const height = new Float32Array(SIZE * SIZE);
  const albedo = Buffer.alloc(SIZE * SIZE * 3);
  const rough = Buffer.alloc(SIZE * SIZE);

  // The two ends of the colour: the pale tan of a fresh panel and the darker
  // brown where the fibre lies thick.
  const pale = [186, 150, 106];
  const deep = [124, 93, 58];

  for (let index = 0; index < SIZE * SIZE; index += 1) {
    const shade = clamp01(
      (cloud[index] - 0.5) * 0.85 + (drift[index] - 0.5) * 0.5 + (mat[index] - 0.5) * 0.55 + 0.5,
    );
    // Occasional darker fibres, which is what stops it reading as a painted
    // board: a flecked surface at this scale is unmistakably pressed pulp.
    const dark = ramp(0.82, 0.99, fleck[index]);
    for (let channel = 0; channel < 3; channel += 1) {
      albedo[index * 3 + channel] = clamp(
        pale[channel] + (deep[channel] - pale[channel]) * shade - dark * 26,
      );
    }
    // Shallow, because a hot platen is what closed this surface. The relief is
    // the fibre showing through the press, not a texture standing on it.
    height[index] = (mat[index] - 0.5) * 0.5 + dark * 0.35 + (cloud[index] - 0.5) * 0.12;
    // Board has a faint sheen and loses it wherever the fibre is open.
    rough[index] = clamp((0.62 + dark * 0.16 + (mat[index] - 0.5) * 0.07) * 255);
  }

  await writeAlbedo("hardboard-albedo.jpg", albedo);
  await writeNormal("hardboard-normal.png", normalFromHeight(height, SIZE, SIZE, 2.4), MAP);
  await writePacked("hardboard-rough.png", rough, 0, MAP);
}

/**
 * Paper: a sheet of a writing pad, and the block of them under it.
 *
 * No colour of its own on purpose. A design printed on this pad lands in the
 * base colour channel, and anything in that channel underneath would tint it --
 * a photograph of paper multiplied into somebody's artwork is a dirty print,
 * not a realistic one. What makes paper read is the other two channels: fibre
 * you can see when the light rakes across it, and a matte finish that varies
 * just enough not to look like a printed swatch.
 *
 * Two scales in the relief. The fine one is fibre. The coarse one is the sheet
 * itself, because paper is never flat -- it takes up moisture and cockles, and
 * a sheet with no undulation at all reads as plastic.
 */
async function paper() {
  const fibre = valueNoise(SIZE, SIZE, 110, 110, 23);
  const tooth = valueNoise(SIZE, SIZE, 40, 40, 89);
  const cockle = fbm(SIZE, SIZE, 3, 3, 3, 151);
  const laid = valueNoise(SIZE, SIZE, 9, 160, 199);

  const height = new Float32Array(SIZE * SIZE);
  const rough = Buffer.alloc(SIZE * SIZE);

  for (let index = 0; index < SIZE * SIZE; index += 1) {
    // Weighted towards the coarse end on purpose. Fibre is what paper is made
    // of and almost never what you can see: at any distance a product is
    // photographed from, a quarter-millimetre fibre is a fraction of a pixel
    // and averages to flat grey. What the eye actually reads as paper is the
    // sheet's own cockle -- it takes up moisture and stops being flat -- and a
    // matte sheen that moves with it. The fibre is left in for the close-up.
    height[index] =
      (fibre[index] - 0.5) * 0.3 +
      (tooth[index] - 0.5) * 0.75 +
      (cockle[index] - 0.5) * 3.4 +
      // The faint parallel marks a wire mould leaves, so a raking light finds
      // a direction in the sheet rather than an even fizz.
      (laid[index] - 0.5) * 0.3;
    rough[index] = clamp((0.86 + (cockle[index] - 0.5) * 0.14 + (tooth[index] - 0.5) * 0.09) * 255);
  }

  await writeNormal("paper-normal.png", normalFromHeight(height, SIZE, SIZE, 3.2), MAP);
  await writePacked("paper-rough.png", rough, 0, MAP);
}

/**
 * Nickel-plated steel: the spring clip.
 *
 * Brushed rather than polished, and plated rather than bare. Both matter. A
 * mirror finish on a part this small reflects the studio and almost nothing
 * else, which is how it was rendering near black; a brush spreads each
 * reflection into a streak and gives the part a shape you can read. And plate
 * is a coat over the steel, so it stops a little short of fully metallic --
 * enough to keep a diffuse term, which is the difference between a clip and a
 * silhouette.
 *
 * The scratches run one way because a brush does. That is the whole of what
 * makes this material: an isotropic lattice here gives a hammered look.
 */
async function nickel() {
  const streak = valueNoise(SIZE, SIZE, 6, 340, 37);
  const coarse = valueNoise(SIZE, SIZE, 3, 80, 59);
  const dust = valueNoise(SIZE, SIZE, 130, 130, 107);
  const sweep = fbm(SIZE, SIZE, 2, 2, 3, 173);

  const height = new Float32Array(SIZE * SIZE);
  const albedo = Buffer.alloc(SIZE * SIZE * 3);
  const rough = Buffer.alloc(SIZE * SIZE);

  for (let index = 0; index < SIZE * SIZE; index += 1) {
    const scratch = (streak[index] - 0.5) * 0.8 + (coarse[index] - 0.5) * 0.35;
    height[index] = scratch * 0.5 + (dust[index] - 0.5) * 0.06;
    // Very nearly white, and nearly neutral. This part sits on a colour slot,
    // and base colour on a metal is what its reflection is tinted to -- so the
    // map has to carry the streaks and leave the colour to the person picking
    // it. An albedo of its own would multiply into their choice and every
    // colour would arrive darker than the swatch they clicked.
    const tone = clamp01(0.5 + (sweep[index] - 0.5) * 0.2 + scratch * 0.25);
    albedo[index * 3] = clamp(234 + tone * 16);
    albedo[index * 3 + 1] = clamp(236 + tone * 16);
    albedo[index * 3 + 2] = clamp(240 + tone * 14);
    // The streaks are the roughness. A brushed surface is smooth along the
    // brush and rough across it, and that anisotropy read as a plain grey
    // until the scratches were allowed to move this by a useful amount.
    rough[index] = clamp((0.34 + scratch * 0.34 + (dust[index] - 0.5) * 0.05) * 255);
  }

  await writeAlbedo("nickel-albedo.jpg", albedo);
  await writeNormal("nickel-normal.png", normalFromHeight(height, SIZE, SIZE, 1.1), MAP);
  // Just over half, not nearly all. A clip is a few millimetres of wire, and a
  // fully metallic wire has no colour of its own -- it is a mirror, and what a
  // mirror on a dark set reflects is the dark set, which is how this part
  // rendered as a black outline whatever colour was chosen for it. Plate is a
  // coat, and a coat keeps enough diffuse to have a shape.
  await writePacked("nickel-rough.png", rough, 0.55, MAP);
}

/**
 * Moulded plastic: a pen barrel.
 *
 * The quietest of the four, and it has to be. Injection moulding produces a
 * surface with no character at all -- that is what it is for -- so the whole of
 * what makes plastic read as plastic is a tight even sheen and the faint
 * orange-peel a mould leaves, at a scale you notice only in a highlight. Give
 * it grain and it becomes rubber; give it none and it becomes a shape.
 *
 * Dark, unlike the other two colour maps here, because this part sits on the
 * trim slot and that slot defaults pale. A pale pen on a pale pad is the reason
 * the pen was invisible; the map is what makes the default a barrel.
 */
async function plastic() {
  const peel = fbm(SIZE, SIZE, 40, 40, 3, 211);
  const speck = valueNoise(SIZE, SIZE, 120, 120, 233);

  const height = new Float32Array(SIZE * SIZE);
  const albedo = Buffer.alloc(SIZE * SIZE * 3);
  const rough = Buffer.alloc(SIZE * SIZE);

  for (let index = 0; index < SIZE * SIZE; index += 1) {
    height[index] = (peel[index] - 0.5) * 0.6 + (speck[index] - 0.5) * 0.05;
    const tone = (peel[index] - 0.5) * 10;
    albedo[index * 3] = clamp(62 + tone);
    albedo[index * 3 + 1] = clamp(64 + tone);
    albedo[index * 3 + 2] = clamp(70 + tone);
    rough[index] = clamp((0.33 + (peel[index] - 0.5) * 0.08) * 255);
  }

  await writeAlbedo("plastic-albedo.jpg", albedo);
  await writeNormal("plastic-normal.png", normalFromHeight(height, SIZE, SIZE, 0.5), MAP);
  await writePacked("plastic-rough.png", rough, 0, MAP);
}

mkdirSync(OUT, { recursive: true });
await hardboard();
await paper();
await nickel();
await plastic();
console.log(`wrote hardboard, paper, nickel and plastic maps to ${OUT}`);
