/**
 * Split one material's triangles into named zones, each with its own unwrap.
 *
 * The merchandise models arrive painted with a single material across parts
 * that have nothing to do with each other: a card and the clasp it hangs from,
 * a bag and its handles. A product needs them apart, because a print zone is a
 * material and a colour slot is a material. This does the splitting.
 *
 * `material` is one source material or several. Several matters when the cuts
 * have to agree: the shirt's front and back share ninety edges down their side
 * seams, and cutting them in separate passes divides those edges in two places.
 *
 * `classify(face)` decides which zone a triangle belongs to. It receives the
 * face's world centroid `C`, world normal `WN`, mean texture coordinate, the
 * `source` material it arrived on, the `shell` it belongs to and that shell's
 * box, and the world box of its source primitive. Prefer `shell`: it is the boundary the mesh already draws, and a
 * coordinate threshold guessing at the same boundary is what put the card's
 * artwork on its clasp. See `docs/merchandise-models.md`.
 *
 * Each zone is rebuilt as one primitive with a fresh material, unwrapped to
 * fill 0..1 across two world axes so a design authored at the zone's aspect
 * ratio lands undistorted.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";

import { along, axisBasis, tangentBasis } from "./prep-model-clip.mjs";
import {
  assignShells, inv4, mulN, mulP, roundCreases as roundTheFolds, smoothNormals,
} from "./prep-model-geometry.mjs";
import { boundaryLoops, hemFaces } from "./prep-model-hem.mjs";
import { cutPrintRegions } from "./prep-model-regions.mjs";

const AXIS = { x: 0, y: 1, z: 2 };
const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");

/** A path inside the repository, whatever directory the script was run from. */
export const repoPath = (...parts) => join(REPO, ...parts);

/**
 * A bought source model, by the file name it was supplied under.
 *
 * These are licensed assets and are not committed, so the directory holding
 * them is named rather than assumed: `MODEL_SOURCES` if it is set, otherwise
 * `assets/model-sources` beside this repository. The five names each product
 * script asks for are listed in `docs/merchandise-models.md`.
 */
export function sourceModel(name) {
  const root = process.env.MODEL_SOURCES ?? repoPath("assets", "model-sources");
  const file = join(root, name);
  try {
    readFileSync(file);
  } catch {
    throw new Error(
      `Source model not found: ${file}\n`
      + `These are bought assets and are not committed. Put them in ${root}, or\n`
      + `point MODEL_SOURCES at the directory holding them. See docs/merchandise-models.md.`,
    );
  }
  return file;
}

export async function prepZones({
  classify, deformWorld, hems, input, leftover, material, output, regions,
  roundCreases, smoothCreases, trimStyle, weaveDefault = true, zones,
}) {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(input);

  // Pass 1: gather every face of the target material or materials, in world
  // space.
  const wanted = new Set([material].flat());
  const faces = [];
  const owners = [];
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const m = node.getWorldMatrix();
    for (const prim of mesh.listPrimitives()) {
      const from = prim.getMaterial();
      if (!wanted.has(from?.getName())) continue;
      owners.push({ m, material: from, mesh, prim });
      const pos = prim.getAttribute("POSITION"), nor = prim.getAttribute("NORMAL");
      const uv = prim.getAttribute("TEXCOORD_0"), idx = prim.getIndices();
      const count = idx ? idx.getCount() : pos.getCount();
      const p = [0,0,0], nv = [0,0,0], a = [0,0];
      for (let i = 0; i < count; i += 3) {
        const P = [], N = [], C = [0,0,0], WN = [0,0,0], UV0 = [];
        let vSum = 0;
        for (let k = 0; k < 3; k += 1) {
          const vi = idx ? idx.getScalar(i + k) : i + k;
          pos.getElement(vi, p); nor.getElement(vi, nv);
          if (uv) uv.getElement(vi, a);
          const wp = mulP(m, p), wn = mulN(m, nv);
          P.push([...p]); N.push([...nv]); UV0.push(uv ? [...a] : [0, 0]);
          for (let q = 0; q < 3; q += 1) { C[q] += wp[q] / 3; WN[q] += wn[q] / 3; }
          if (uv) vSum += a[1] / 3;
        }
        faces.push({
          C, m, N, owner: owners.length - 1, P, source: from,
          UV0, uvV: vSum, WN, world: P.map((v) => mulP(m, v)),
        });
      }
    }
  }

  const shells = assignShells(faces);

  // The world box of each source primitive, so a classifier can also split by
  // the piece the modeller separated where that is finer than a shell -- the
  // shirt is one shell but several primitives.
  const boxes = owners.map(() => ({ hi: [-Infinity,-Infinity,-Infinity], lo: [Infinity,Infinity,Infinity] }));
  for (const f of faces) {
    const b = boxes[f.owner];
    for (const w of f.world) for (let q = 0; q < 3; q += 1) {
      if (w[q] < b.lo[q]) b.lo[q] = w[q];
      if (w[q] > b.hi[q]) b.hi[q] = w[q];
    }
  }
  for (const b of boxes) {
    b.size = [0,1,2].map((q) => b.hi[q] - b.lo[q]);
    b.centre = [0,1,2].map((q) => (b.hi[q] + b.lo[q]) / 2);
  }
  for (const f of faces) f.ownerBox = boxes[f.owner];

  // Pass 2: classify.
  const byZone = new Map();
  for (const f of faces) {
    const zone = classify(f) ?? leftover;
    if (!byZone.has(zone)) byZone.set(zone, []);
    byZone.get(zone).push(f);
  }

  // Optional reshaping, expressed in world space and written back through the
  // node's inverse so the stored local positions stay correct.
  if (deformWorld) {
    for (const f of faces) {
      const ivm = inv4(f.m);
      for (let k = 0; k < 3; k += 1) {
        const w = deformWorld(f.world[k], f);
        f.world[k] = w;
        f.P[k] = mulP(ivm, w);
      }
    }
  }
  if (roundCreases) roundTheFolds(faces, roundCreases);

  const unwrapBasis = cutPrintRegions({ byZone, faces, regions });

  /**
   * Fold the rims over.
   *
   * After the print areas are cut, so a hem is never sliced by one, and after
   * any reshaping, so it follows the surface where the surface ended up. Rims
   * are taken longest first, which is the order a product names them: the mouth
   * of a bag; the hem of a shirt, then its cuffs.
   */
  if (hems?.length) {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const f of faces) for (const w of f.world) for (let q = 0; q < 3; q += 1) {
      lo[q] = Math.min(lo[q], w[q]); hi[q] = Math.max(hi[q], w[q]);
    }
    const weld = (Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) || 1) * 1e-5;
    for (const [name, list] of byZone) for (const f of list) f.zone = name;
    const rims = boundaryLoops([...byZone.values()].flat(), weld);
    for (const hem of hems) {
      const list = byZone.get(hem.zone);
      if (!list?.length) continue;
      const mine = rims.filter((rim) => rim.zones.has(hem.zone));
      for (const rim of mine.slice(0, hem.loops ?? 1)) {
        if (process.env.HEM_DEBUG) {
          const ys = rim.vertices.map((v) => v.world[1]);
          console.log(`  hem ${hem.zone}: ${rim.vertices.length} corners, y ${Math.min(...ys).toFixed(3)}..${Math.max(...ys).toFixed(3)}, zones ${[...rim.zones].join()}`);
        }
        list.push(...hemFaces(rim, hem, list[0]));
      }
    }
  }

  // Last, once every face the model will ship exists, so a hem shades as one
  // piece with the cloth it folds from.
  if (smoothCreases) smoothNormals([...byZone.values()].flat(), smoothCreases);

  // Pass 3: rebuild one primitive per zone, unwrapped.
  const src = owners[0];
  for (const { mesh, prim } of owners) { mesh.removePrimitive(prim); prim.dispose(); }

  const weaveCache = new Map();
  const sharedWeave = (file) => {
    if (!weaveCache.has(file)) {
      weaveCache.set(file, doc.createTexture("weave").setImage(readFileSync(file)).setMimeType("image/png"));
    }
    return weaveCache.get(file);
  };

  const report = {};
  // Non-enumerable so callers that walk the zone entries do not trip over it.
  Object.defineProperty(report, "shells", { value: shells });

  for (const [zoneName, list] of byZone) {
    const spec = zones[zoneName] ?? { ...(trimStyle ?? {}) };
    const n = list.length * 3;
    const P = new Float32Array(n*3), N = new Float32Array(n*3);
    const UV = new Float32Array(n*2), UV1 = new Float32Array(n*2), UVW = new Float32Array(n*2);
    const density = spec.weaveRepeatsPerUnit ?? 1;

    // Where this zone is unwrapped across: two world axes, or -- for a zone too
    // curved for any of them -- a plane laid on the surface itself.
    const [uA, vA] = Array.isArray(spec.unwrap) ? spec.unwrap : ["x", "y"];
    // The plane the region cut on, where there was one, so the rectangle stays a
    // rectangle in the atlas. Otherwise whatever the zone declares.
    const basis = unwrapBasis.get(zoneName)
      ?? (spec.unwrap === "tangent" ? tangentBasis(list) : axisBasis([uA, vA]));
    const at = (w) => [along(basis.u, w), along(basis.v, w)];
    const lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
    if (spec.unwrap) for (const f of list) for (const w of f.world) {
      const p = at(w);
      for (let i = 0; i < 2; i += 1) { lo[i] = Math.min(lo[i], p[i]); hi[i] = Math.max(hi[i], p[i]); }
    }
    const span = [hi[0] - lo[0] || 1, hi[1] - lo[1] || 1];

    let t = 0;
    for (const f of list) for (let k = 0; k < 3; k += 1) {
      P.set(f.P[k], t*3); N.set(f.N[k], t*3); UV1.set(f.UV0[k], t*2);
      UVW[t*2] = f.world[k][AXIS[uA]] * density;
      UVW[t*2+1] = f.world[k][AXIS[vA]] * density;
      if (spec.unwrap) {
        const p = at(f.world[k]);
        let u = (p[0] - lo[0]) / span[0];
        const v = 1 - (p[1] - lo[1]) / span[1];
        if (spec.flipU) u = 1 - u;
        UV[t*2] = u; UV[t*2+1] = v;
      }
      t += 1;
    }

    const prim = doc.createPrimitive()
      .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(P))
      .setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(N));
    if (spec.unwrap) prim.setAttribute("TEXCOORD_0", doc.createAccessor().setType("VEC2").setArray(UV));

    // The weave comes from the material this zone's own cloth arrived on. With
    // one source material that is the only one there is; with several it is the
    // difference between a panel keeping its own cloth and wearing the collar's.
    const source = list[0]?.source ?? owners[0].material;
    const mat = doc.createMaterial(zoneName)
      .setMetallicFactor(spec.metalness ?? 0)
      .setRoughnessFactor(spec.roughness ?? 0.5)
      .setBaseColorFactor(spec.baseColor ?? [1, 1, 1, 1])
      // A new material is single-sided, and every zone here is an open patch of
      // surface because splitting the product into zones is what made it one.
      // An open patch culled from behind is a hole: a garment is a single-layer
      // shell, so its inside is visible up a sleeve, through a neck and across
      // an armhole, and a bag's is visible down its mouth. This is a
      // consequence of the split rather than a departure from the file -- the
      // author's single material was closed where these are not.
      .setDoubleSided(spec.doubleSided ?? true);

    /**
     * The weave, on its own channel.
     *
     * Whichever weave a zone gets, it cannot ride the 0..1 unwrap a design
     * uses: that unwrap stretches one copy of an image across a whole panel,
     * and cloth needs hundreds of thread crossings across the same distance.
     * So a second channel carries coordinates meant for tiling, and the normal
     * map is pointed at it.
     *
     * Two sources. A file that shipped a weave has one authored against its own
     * coordinates -- the shirt's are in millimetres, which already tile -- and
     * those travel with the vertices unchanged. A file that shipped none gets a
     * supplied map laid out from world position at a stated density, so every
     * panel of a product carries the same thread size no matter how big the
     * panel is: a tote's narrow side reads as the same cloth as its front.
     */
    const supplied = spec.weaveFile ? sharedWeave(spec.weaveFile) : null;
    const weave = supplied ?? ((spec.weave ?? weaveDefault) ? source?.getNormalTexture() : null);
    if (weave) {
      prim.setAttribute("TEXCOORD_1", doc.createAccessor().setType("VEC2").setArray(supplied ? UVW : UV1));
      mat.setNormalTexture(weave).setNormalScale(spec.weaveScale ?? source?.getNormalScale() ?? 1);
      const info = mat.getNormalTextureInfo();
      info?.setTexCoord(1);
      // Tiling is the whole point, so the sampler has to repeat rather than
      // clamp -- a clamped coordinate of 59 is one texel dragged across a panel.
      info?.setWrapS(10497).setWrapT(10497);
    }

    if (spec.template) {
      mat.setBaseColorTexture(
        doc.createTexture(`${zoneName}-template`).setImage(readFileSync(spec.template)).setMimeType("image/png"),
      );
    }
    prim.setMaterial(mat);
    src.mesh.addPrimitive(prim);
    report[zoneName] = { span: spec.unwrap ? span.map((v) => Number(v.toFixed(4))) : null, tris: list.length };
  }

  // The original material and its texture are orphaned once the zones replace
  // it, and an unreferenced 904KB image still ships in the file.
  for (const mat of doc.getRoot().listMaterials()) {
    if (mat.listParents().every((p) => p.propertyType === "Root")) mat.dispose();
  }
  for (const tex of doc.getRoot().listTextures()) {
    if (tex.listParents().every((p) => p.propertyType === "Root")) tex.dispose();
  }

  await io.write(output, doc);
  return report;
}
