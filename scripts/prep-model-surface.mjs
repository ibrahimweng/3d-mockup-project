/**
 * What a zone is made of, written onto the material the zone ships as.
 *
 * Split from `prep-model-zones.mjs`, which is about which triangles belong to
 * which part and where a design lands on them. This is the other half of the
 * question and a different one: given that these triangles are the board of a
 * clipboard, what should light do when it hits them.
 *
 * Two channels and two coordinate sets, and keeping them apart is most of the
 * work. A design is one image stretched across a whole panel and rides the 0..1
 * unwrap. A material is a small square of hardboard or paper tiled hundreds of
 * times over the same panel and rides a second set of coordinates laid out from
 * world position. Mixing them gives either one thread crossing the size of a
 * shirt or a design repeated forty times across it.
 */

import { readFileSync } from "node:fs";

/** Repeat rather than clamp: a clamped coordinate of 59 is one texel, dragged. */
const REPEAT = 10497;

const mimeOf = (file) => (file.endsWith(".jpg") || file.endsWith(".jpeg")
  ? "image/jpeg"
  : "image/png");

/**
 * The maps a zone asks for, loaded once each however many zones ask.
 *
 * A clipboard's pad, its loose sheets and the cut edge of the block are all the
 * same paper, and a texture per zone would be the same image three times in the
 * file.
 */
export function makeTextureCache(doc) {
  const cache = new Map();
  return (file) => {
    if (!cache.has(file)) {
      const name = file.split("/").pop().replace(/\.[^.]+$/, "");
      cache.set(file, doc.createTexture(name).setImage(readFileSync(file)).setMimeType(mimeOf(file)));
    }
    return cache.get(file);
  };
}

/**
 * Build a zone's material, and hang its tiling maps on the second coordinate.
 *
 * `tiling` is the world-position layout a supplied map is read through and
 * `woven` is the file's own second channel, which a model that shipped a weave
 * already carries. Whichever is used, the primitive only gains a TEXCOORD_1 if
 * something is actually going to read it.
 */
export function dressZone(doc, name, prim, spec, context) {
  const { share, source, tiling, weaveDefault, woven } = context;
  const surface = spec.surface ?? {};
  const mat = doc.createMaterial(name)
    .setMetallicFactor(spec.metalness ?? 0)
    .setRoughnessFactor(spec.roughness ?? 0.5)
    .setBaseColorFactor(spec.baseColor ?? [1, 1, 1, 1])
    // A new material is single-sided, and every zone here is an open patch of
    // surface because splitting the product into zones is what made it one. An
    // open patch culled from behind is a hole: a garment is a single-layer
    // shell, so its inside is visible up a sleeve, through a neck and across an
    // armhole, and a bag's is visible down its mouth. This is a consequence of
    // the split rather than a departure from the file.
    .setDoubleSided(spec.doubleSided ?? true);

  /**
   * The relief: a supplied map, or the weave the file itself shipped.
   *
   * A file that shipped one has it authored against its own coordinates -- the
   * shirt's are in millimetres, which already tile -- and those travel with the
   * vertices unchanged. Anything supplied here is laid out from world position
   * at a stated density instead, so a panel carries the same thread or fibre
   * size however big the panel is.
   */
  const supplied = surface.normal ?? spec.weaveFile ?? null;
  const relief = supplied
    ? share(supplied)
    : ((spec.weave ?? weaveDefault) ? source?.getNormalTexture() : null);
  let laid = false;
  const lay = () => {
    if (laid) return;
    laid = true;
    prim.setAttribute("TEXCOORD_1", doc.createAccessor().setType("VEC2").setArray(supplied || surface.albedo || surface.rough ? tiling : woven));
  };
  if (relief) {
    lay();
    mat.setNormalTexture(relief).setNormalScale(spec.weaveScale ?? source?.getNormalScale() ?? 1);
    mat.getNormalTextureInfo()?.setTexCoord(1).setWrapS(REPEAT).setWrapT(REPEAT);
  }

  /**
   * The colour of the material itself, where the zone has one to spare.
   *
   * A zone that prints does not: its base colour is where the design lands, and
   * a photograph of paper multiplied underneath somebody's artwork is a dirty
   * print rather than a realistic one. So a print zone gets its character from
   * relief and finish alone, and only a part nothing prints on -- a clipboard's
   * board, a pen -- carries a colour map.
   */
  if (surface.albedo && !spec.template) {
    lay();
    mat.setBaseColorTexture(share(surface.albedo));
    mat.getBaseColorTextureInfo()?.setTexCoord(1).setWrapS(REPEAT).setWrapT(REPEAT);
  }

  /**
   * How rough, and how metallic, from the two channels glTF reads them in.
   *
   * Both factors go to 1 when a map is supplied, because glTF multiplies the
   * factor into the texture: leaving roughness at 0.5 under a map that already
   * says 0.88 halves it, and every brushed streak in the clip would arrive at
   * half the roughness it was authored at.
   */
  if (surface.rough) {
    lay();
    mat.setMetallicRoughnessTexture(share(surface.rough)).setMetallicFactor(1).setRoughnessFactor(1);
    mat.getMetallicRoughnessTextureInfo()?.setTexCoord(1).setWrapS(REPEAT).setWrapT(REPEAT);
  }

  // The design's own image, on the 0..1 unwrap, which is the last word on base
  // colour wherever a zone has one.
  if (spec.template) {
    mat.setBaseColorTexture(
      doc.createTexture(`${name}-template`).setImage(readFileSync(spec.template)).setMimeType("image/png"),
    );
  }
  return mat;
}
