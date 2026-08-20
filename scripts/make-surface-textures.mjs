#!/usr/bin/env node
/**
 * Author the tiling maps the table surfaces are made of.
 *
 * These are synthesised rather than photographed. That is a constraint of
 * where this runs — every texture library is unreachable from it — and it is
 * stated here rather than hidden, because "shipped texture maps" ought to mean
 * something specific. What they are is real: tiling albedo, normal and
 * roughness at a working resolution, built from a height field so that the
 * normal and the colour agree about where the surface is high and low. What
 * they are not is a photograph of a particular slab. Swapping in a real scan
 * later means replacing six files and nothing else.
 *
 * Everything wraps. The noise lattice is periodic and the normal is taken with
 * wrapped neighbours, so a tile meets its own opposite edge without a seam —
 * which matters more than detail here, since a seam running across a tabletop
 * is the one flaw that reads instantly as computer graphics.
 *
 *   node scripts/make-surface-textures.mjs
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
  writeRough,
} from "./texture-lab.mjs";

/**
 * Stone: a honed slab with veins in it and the small voids of travertine.
 *
 * What separates stone from concrete is that stone has a history and concrete
 * does not. A pour is homogeneous by construction — whatever is in it is
 * everywhere in it — so its character is small and even: aggregate, pinholes,
 * the marks of a float. A bed of limestone was laid down over an age, folded,
 * and then sliced across, so its character is *large*: broad tonal drift from
 * one part of the block to another, and veins that run somewhere. A stone
 * without that reads as a grey worktop.
 *
 * So this is built the other way up from the concrete it replaces. The big
 * shapes carry it and the fine detail is only seasoning.
 */
async function stone() {
  // Bedding: the broad tonal drift across a cut block.
  const bed = fbm(SIZE, SIZE, 2, 3, 4, 13);
  const cloud = fbm(SIZE, SIZE, 5, 7, 3, 31);
  // What bends the veins. Veins are straight only in a diagram.
  const warp = fbm(SIZE, SIZE, 3, 4, 4, 59);
  const branch = fbm(SIZE, SIZE, 9, 11, 3, 73);
  // Travertine's voids: small, and wider than they are tall, because they were
  // laid down flat and the slab is cut across them.
  const vug = valueNoise(SIZE, SIZE, 130, 90, 101);
  const speck = valueNoise(SIZE, SIZE, 340, 340, 149);

  const height = new Float32Array(SIZE * SIZE);
  const albedo = Buffer.alloc(SIZE * SIZE * 3);
  const rough = Buffer.alloc(SIZE * SIZE);

  // Warm pale limestone, and the colour a vein of it darkens to.
  const pale = [205, 197, 185];
  const deep = [138, 128, 115];

  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const index = y * SIZE + x;

      // A vein is where a sheet of something else cut through the bed. Take a
      // coordinate running across the slab, bend it hard, and the places it
      // crosses a whole number are a set of wandering parallel sheets.
      // Warped by well under one spacing. Bend it further and the sheets fold
      // back through each other into closed rings, which reads as camouflage
      // rather than as bedding seen in section.
      const along =
        (x * 0.55 + y) / SIZE + (warp[index] - 0.5) * 0.34 + (branch[index] - 0.5) * 0.1;
      const crossing = Math.abs(((along * 3) % 1) - 0.5) * 2;
      // Narrow and soft-edged: a vein is a stain, not a drawn line.
      const vein = Math.pow(1 - crossing, 7) * (0.55 + branch[index] * 0.75);

      // Sparse. Travertine has voids; a honed slab chosen for a tabletop has
      // been filled and polished back, so what is left is the occasional one
      // rather than a field of them. At the density this started with it read
      // as sandstone, which is a different rock and a much cheaper one.
      const voids = ramp(0.972, 0.998, vug[index]);
      const grit = ramp(0.93, 0.995, speck[index]);

      const shade = clamp01(
        (bed[index] - 0.5) * 0.55 +
          (cloud[index] - 0.5) * 0.3 +
          vein * 1.05 +
          voids * 0.45 +
          0.32,
      );

      for (let channel = 0; channel < 3; channel += 1) {
        albedo[index * 3 + channel] = clamp(
          pale[channel] +
            (deep[channel] - pale[channel]) * shade +
            (speck[index] - 0.5) * 7,
        );
      }

      // Almost nothing stands proud on a honed slab. The voids are real holes
      // and everything else is colour, which is the whole difference between
      // stone that has been finished and stone that has been broken.
      height[index] = 0.5 - voids * 0.8 - grit * 0.04 + (cloud[index] - 0.5) * 0.04;

      // Honed rather than polished: a soft even sheen, dulling where the
      // surface is open. The veins take a slightly better finish than the
      // matrix, which is what gives a cut slab its faint figure under a
      // raking light even when the colour is nearly uniform.
      rough[index] = clamp(
        (0.44 - vein * 0.08 + voids * 0.38 + grit * 0.06 + (cloud[index] - 0.5) * 0.05) * 255,
      );
    }
  }

  await writeAlbedo("stone-albedo.jpg", albedo);
  await writeNormal("stone-normal.png", normalFromHeight(height, SIZE, SIZE, 18));
  await writeRough("stone-rough.jpg", rough);
  console.log("stone: albedo, normal, roughness");
}

/**
 * Oak: rings running one way, fibre running with them.
 *
 * Quartersawn, so the rings read as roughly parallel bands rather than the
 * nested arches of a flatsawn board — arches are handsome and they tile badly,
 * and a repeated arch is worse than no arch.
 *
 * The ring profile is asymmetric, and that asymmetry is the whole thing. A
 * tree lays down wide pale earlywood through spring, tightens to a narrow dark
 * band of latewood by autumn, and then stops. Next spring begins against that
 * band with no transition at all. So the tone ramps up slowly and drops off a
 * cliff, once a year. A symmetrical profile — a cosine, however sharpened —
 * gives you smooth ridges that read as corrugated card, which is what the
 * first pass at this produced.
 */
async function oak() {
  const RINGS = 13;
  const period = 1 / RINGS;

  const drift = fbm(SIZE, SIZE, 2, 2, 3, 91);
  const waver = fbm(SIZE, SIZE, 6, 4, 3, 97);
  // Long and thin: features about 170px along the grain and 8px across it.
  const fibre = fbm(SIZE, SIZE, 6, 130, 3, 137);
  // Pores: short dashes, wider than they are tall, as a cut pore vessel is.
  const pore = valueNoise(SIZE, SIZE, 300, 170, 181);
  // Medullary rays: thin slivers running across the grain, the quartersawn
  // signature. Kept faint — they are a glint, not a stripe.
  const ray = valueNoise(SIZE, SIZE, 150, 14, 199);
  const fine = valueNoise(SIZE, SIZE, 512, 512, 211);

  const height = new Float32Array(SIZE * SIZE);
  const albedo = Buffer.alloc(SIZE * SIZE * 3);
  const rough = Buffer.alloc(SIZE * SIZE);

  const light = [203, 167, 119];
  const dark = [110, 74, 41];

  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const index = y * SIZE + x;
      // Rings run along x, so they are measured up y, wandering as they go.
      // Quartersawn grain is close to straight — the bands wander, they do not
      // undulate. A third of a ring period of wander is enough to say "sawn
      // from a tree"; past about half, the lines start reading as ripples in
      // a dune rather than as timber.
      const along =
        y / SIZE +
        (drift[index] - 0.5) * period * 0.3 +
        (waver[index] - 0.5) * period * 0.14;
      const season = along * RINGS - Math.floor(along * RINGS);
      // Slow darkening through the year, the tight latewood band at the end of
      // it, and a hard edge back to next spring — softened over one percent of
      // the ring so it resamples without stairsteps.
      const band =
        (season * 0.22 + ramp(0.72, 0.94, season) * 0.78) *
        (1 - ramp(0.99, 1, season));
      const streak = (fibre[index] - 0.5) * 0.62;
      const mix = clamp01(band * 0.92 + streak * 0.68 + 0.05);

      // Pores cluster in the earlywood just after each ring, which is where
      // the tree grew fastest and left the widest vessels.
      const spring = ramp(0.02, 0.2, season) * (1 - ramp(0.4, 0.7, season));
      const pit = ramp(0.9, 0.995, pore[index]) * spring;
      const fleck = ramp(0.91, 1, ray[index]) * (1 - band) * 0.8;

      const shade = clamp01(mix + pit * 0.34 - fleck * 0.22);
      for (let channel = 0; channel < 3; channel += 1) {
        albedo[index * 3 + channel] = clamp(
          light[channel] +
            (dark[channel] - light[channel]) * shade +
            (fine[index] - 0.5) * 9,
        );
      }

      // Latewood sits *marginally* proud of the softer earlywood on a sanded
      // board, and the emphasis is the point: a finished tabletop is flat to
      // the hand, and relief you can see from across a room turns oak into
      // corrugated iron. Only the pores are holes worth the name. Nothing
      // finer goes in either — two-pixel noise in a height field becomes a
      // normal that sparkles under a moving light, which reads as glitter
      // rather than as wood. The fine detail stays in the colour, where it
      // is harmless.
      height[index] =
        0.5 + band * 0.05 + streak * 0.04 - pit * 0.9;

      // Open grain in the pores, closed and slightly sheened elsewhere: a
      // finished board is not uniformly matte, and that is most of why oak
      // reads as sealed timber rather than as brown paper.
      rough[index] = clamp(
        (0.42 + mix * 0.15 + pit * 0.36 + (fine[index] - 0.5) * 0.05) * 255,
      );
    }
  }

  await writeAlbedo("oak-albedo.jpg", albedo);
  await writeNormal("oak-normal.png", normalFromHeight(height, SIZE, SIZE, 17));
  await writeRough("oak-rough.jpg", rough);
  console.log("oak: albedo, normal, roughness");
}

mkdirSync(OUT, { recursive: true });
await stone();
await oak();
console.log(`written to ${OUT}`);
