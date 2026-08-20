#!/usr/bin/env node
/**
 * The bench the surface maps are built on: noise that tiles, a normal taken
 * from a height field, and the three files a material comes out as.
 *
 * Separate from the materials themselves because it is the half with no taste
 * in it. Nothing here knows what stone looks like; it knows how to make a
 * lattice wrap and how to turn a height into a direction, and it is the same
 * bench whatever is being made on it.
 */

import sharp from "sharp";
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


export { SIZE, OUT, valueNoise, fbm, normalFromHeight, ramp, clamp, clamp01, writeAlbedo, writeNormal, writeRough };
