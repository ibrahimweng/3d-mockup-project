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

import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SIZE = 1024;
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "textures");

/** A deterministic hash, so a rebuild produces the identical file. */
function hash(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 1274126177) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}

const clamp01 = (value) => Math.max(0, Math.min(1, value));

/** Zero below `edge0`, one above `edge1`, eased between. */
function ramp(edge0, edge1, value) {
  return smooth(clamp01((value - edge0) / (edge1 - edge0)));
}

/**
 * Value noise on a lattice that wraps, so the result tiles.
 *
 * The two cell counts are separate because grain has a direction. A wood fibre
 * is a hundred times longer than it is wide, and isotropic noise — the same
 * count both ways — can only ever produce clouds. Stretching the lattice is
 * what turns a cloud into a fibre.
 */
function valueNoise(width, height, cellsX, cellsY, seed) {
  const out = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    const fy = (y / height) * cellsY;
    const y0 = Math.floor(fy);
    const ty = smooth(fy - y0);
    for (let x = 0; x < width; x += 1) {
      const fx = (x / width) * cellsX;
      const x0 = Math.floor(fx);
      const tx = smooth(fx - x0);
      const x1 = (x0 + 1) % cellsX;
      const y1 = (y0 + 1) % cellsY;
      const a = hash(x0 % cellsX, y0 % cellsY, seed);
      const b = hash(x1, y0 % cellsY, seed);
      const c = hash(x0 % cellsX, y1, seed);
      const d = hash(x1, y1, seed);
      out[y * width + x] =
        a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
    }
  }
  return out;
}

/** Octaves of it, each finer and weaker than the last. */
function fbm(width, height, cellsX, cellsY, octaves, seed, gain = 0.5) {
  const out = new Float32Array(width * height);
  let amplitude = 1;
  let total = 0;
  for (let octave = 0; octave < octaves; octave += 1) {
    const step = 2 ** octave;
    const layer = valueNoise(
      width,
      height,
      cellsX * step,
      cellsY * step,
      seed + octave * 71,
    );
    for (let index = 0; index < out.length; index += 1) {
      out[index] += layer[index] * amplitude;
    }
    total += amplitude;
    amplitude *= gain;
  }
  for (let index = 0; index < out.length; index += 1) out[index] /= total;
  return out;
}

/**
 * A normal map from a height field, with wrapped neighbours.
 *
 * Tangent space, so the blue channel is the surface facing straight out and
 * the red and green carry the slope. `strength` is how deep the relief reads.
 */
function normalFromHeight(height, width, rows, strength) {
  const data = Buffer.alloc(width * rows * 3);
  const at = (x, y) => height[((y + rows) % rows) * width + ((x + width) % width)];
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      // Normalise (-dx, -dy, 1) into the 0..255 the format expects.
      const length = Math.hypot(dx, dy, 1);
      const index = (y * width + x) * 3;
      data[index] = Math.round(((-dx / length) * 0.5 + 0.5) * 255);
      data[index + 1] = Math.round(((-dy / length) * 0.5 + 0.5) * 255);
      data[index + 2] = Math.round(((1 / length) * 0.5 + 0.5) * 255);
    }
  }
  return data;
}

const clamp = (value) => Math.max(0, Math.min(255, Math.round(value)));

/**
 * Colour, as JPEG.
 *
 * Chroma subsampling is a poor idea on a normal map and an entirely reasonable
 * one on albedo, where the eye is looking at a slab and not at the numbers.
 * The whole set is well under 2MB this way and 6.7MB as lossless PNG, on maps
 * that are about to be tiled across a table and seen at a few hundred pixels.
 */
async function writeAlbedo(name, data) {
  await sharp(data, { raw: { channels: 3, height: SIZE, width: SIZE } })
    .jpeg({ mozjpeg: true, quality: 88 })
    .toFile(join(OUT, name));
}

/**
 * Relief, as PNG at half resolution.
 *
 * Lossless because a normal map is a direction per pixel and JPEG's ringing
 * turns into visible facets across a flat surface. Half size because the
 * relief here is a slope rather than a silhouette, and it survives the
 * resample where the colour above would not.
 */
async function writeNormal(name, data) {
  await sharp(data, { raw: { channels: 3, height: SIZE, width: SIZE } })
    .resize(SIZE / 2, SIZE / 2)
    .png({ compressionLevel: 9 })
    .toFile(join(OUT, name));
}

/** How rough, in one channel, at half resolution. */
async function writeRough(name, data) {
  await sharp(data, { raw: { channels: 1, height: SIZE, width: SIZE } })
    .resize(SIZE / 2, SIZE / 2)
    .jpeg({ mozjpeg: true, quality: 90 })
    .toFile(join(OUT, name));
}

/**
 * Concrete: a pale matrix with aggregate in it and the marks of a pour.
 *
 * Two temptations, and both are wrong. Cloudy is wrong — a poured slab is
 * remarkably even in tone, and broad blotches read as fog. Speckled is wrong
 * too — high-contrast flecks read as terrazzo or as a rubber gym floor. What
 * identifies concrete is that almost all of its character is in how it takes
 * the light rather than in its colour: aggregate that broke the surface is
 * denser and polishes, the matrix around it stays open and matte, and a power
 * float leaves long sheen marks. So the colour here barely moves, and the
 * roughness map does the work.
 */
async function concrete() {
  const cure = fbm(SIZE, SIZE, 3, 3, 3, 11);
  const patch = fbm(SIZE, SIZE, 7, 7, 3, 23);
  const trowel = fbm(SIZE, SIZE, 3, 40, 2, 29);
  const coarse = valueNoise(SIZE, SIZE, 60, 60, 47);
  const sand = valueNoise(SIZE, SIZE, 280, 280, 53);
  const pinhole = valueNoise(SIZE, SIZE, 90, 90, 67);

  const height = new Float32Array(SIZE * SIZE);
  const albedo = Buffer.alloc(SIZE * SIZE * 3);
  const rough = Buffer.alloc(SIZE * SIZE);

  for (let index = 0; index < height.length; index += 1) {
    // Aggregate only where it broke the surface, so it reads as stones in a
    // matrix rather than as an even sparkle over everything.
    const stone = ramp(0.8, 0.95, coarse[index]);
    const grit = ramp(0.78, 0.97, sand[index]);
    // Air voids: sparse, small, and genuinely dark, because they are holes.
    const hole = ramp(0.028, 0.004, pinhole[index]);

    const tone =
      0.62 +
      (cure[index] - 0.5) * 0.055 +
      (patch[index] - 0.5) * 0.045 +
      stone * 0.025 +
      grit * 0.018 -
      hole * 0.26;
    // The height field is not the tone. Nearly all of it is the slow
    // undulation a float leaves across a slab; the aggregate stands only
    // barely proud, and a pinhole is the one thing here with a real edge.
    // Piling fine noise in as well is what turns concrete into sandpaper —
    // grit belongs in the roughness, where it changes the sheen and not the
    // silhouette.
    height[index] =
      0.5 +
      (patch[index] - 0.5) * 0.5 +
      (cure[index] - 0.5) * 0.3 +
      stone * 0.05 +
      grit * 0.012 -
      hole * 0.5;

    const value = clamp(tone * 255);
    // A trace of warmth in the matrix and none in the aggregate, which is what
    // stops it reading as flat grey card.
    albedo[index * 3] = clamp(value * 1.03);
    albedo[index * 3 + 1] = clamp(value * 1.0);
    albedo[index * 3 + 2] = clamp(value * 0.96);
    // Where the eye actually reads the material. Aggregate takes a polish,
    // the matrix does not, the inside of a void never saw a trowel, and the
    // long faint drift is the float sweeping one way across the slab.
    rough[index] = clamp(
      (0.9 -
        stone * 0.3 -
        grit * 0.1 +
        hole * 0.08 +
        (trowel[index] - 0.5) * 0.07) *
        255,
    );
  }

  await writeAlbedo("concrete-albedo.jpg", albedo);
  await writeNormal("concrete-normal.png", normalFromHeight(height, SIZE, SIZE, 15));
  await writeRough("concrete-rough.jpg", rough);
  console.log("concrete: albedo, normal, roughness");
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
await concrete();
await oak();
console.log(`written to ${OUT}`);
