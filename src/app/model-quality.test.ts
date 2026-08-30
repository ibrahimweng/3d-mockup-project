import { describe, expect, test } from "vitest";

import { readGltfJson, readModelTriangles, type Triangle } from "./model-file-test-utils";
import { edgesOf, geometryOf, shellsOf, uvOf } from "./model-measure-test-utils";
import {
  HARDWARE_MATERIALS,
  MODEL_BASELINES,
  MODEL_TARGET,
  SOFT_GOODS,
  ZONE_TARGET,
  type ModelBaseline,
} from "./model-quality.baselines";
import { readArtworkZones } from "./product-applicability";
import { DEVICE_CATALOG, SPLIT_MATERIAL_SEPARATOR, type DeviceId } from "./product-domain";

/**
 * The merchandise models, held to the spec in `docs/merchandise-models.md`.
 *
 * These read the shipped GLBs and measure them. They are not opinions about the
 * prep scripts: a model is whatever its file says it is, and the file is what
 * the renderer draws.
 *
 * Every assertion is a ratchet against `model-quality.baselines.ts`. A number
 * that moves in either direction fails, so a regression cannot hide and an
 * improvement cannot land without being written down. Where a baseline has
 * already reached its target the target is asserted too, so a met invariant
 * cannot be loosened back by editing the baseline alone.
 */

const cache = new Map<string, Triangle[]>();

function trianglesOf(file: string): Triangle[] {
  const already = cache.get(file);
  if (already) return already;
  const read = readModelTriangles(file);
  cache.set(file, read);
  return read;
}

const models = Object.entries(MODEL_BASELINES) as [DeviceId, ModelBaseline][];

function fileOf(id: DeviceId): string {
  return DEVICE_CATALOG[id].modelFile;
}

/**
 * The triangles a zone owns.
 *
 * A slot usually names a material outright. Where a file paints several parts
 * with one material it names `material@mesh` instead, and the mesh half is what
 * separates the folder's stack of paper from the folio around it.
 */
function zoneTriangles(triangles: Triangle[], slot: string): Triangle[] {
  const [material, mesh] = slot.split(SPLIT_MATERIAL_SEPARATOR);
  return triangles.filter((t) => t.material === material && (!mesh || t.mesh === mesh));
}

/**
 * One measurement against its baseline, and against its target once met.
 *
 * The failure message carries the measured value, because the fix for an
 * intended improvement is to paste it into the baselines file.
 */
function ratchet(
  label: string,
  measured: number,
  baseline: number,
  target: number,
  better: "higher" | "lower",
): void {
  expect(
    measured,
    `${label}: the baseline records ${baseline}, the file measures ${measured}. `
      + `If ${measured} is the improvement you meant, record it in model-quality.baselines.ts.`,
  ).toBe(baseline);
  const met = better === "lower" ? baseline <= target : baseline >= target;
  if (!met) return;
  const held = `${label} already meets its target of ${target} and has to stay there`;
  if (better === "lower") expect(measured, held).toBeLessThanOrEqual(target);
  else expect(measured, held).toBeGreaterThanOrEqual(target);
}

describe("what the merchandise models are made of", () => {
  test("a hardware part wears nothing but its own material", () => {
    // The defect this exists for: the ID card's clasp is a separate mesh
    // island, but prep decided what was clasp by testing height against 1.73.
    // The cut landed mid-part, so 176 of the jaw's triangles came out wearing
    // card materials and 97 of those wearing the printed faces -- which is the
    // artwork visibly running over the metal.
    //
    // A part is a connected component. Nothing about where it sits is needed
    // to say where it ends, so nothing about where it sits is asked.
    for (const [id, baseline] of models) {
      const hardware = HARDWARE_MATERIALS[id] ?? [];
      const shells = shellsOf(trianglesOf(fileOf(id)));
      let stray = 0;
      for (const shell of shells) {
        if (!hardware.some((material) => shell.materials[material])) continue;
        for (const [material, count] of Object.entries(shell.materials)) {
          if (!hardware.includes(material)) stray += count;
        }
      }
      ratchet(`${id} stray triangles on hardware`, stray, baseline.strayTrianglesOnHardware,
        MODEL_TARGET.strayTrianglesOnHardware, "lower");
      ratchet(`${id} shells`, shells.length, baseline.shells, baseline.shells, "lower");
    }
  });

  test("every material in a file is a part the catalog knows about", () => {
    // A material nobody names is a part nobody can reach: no design lands on
    // it and no colourway paints it, so it holds whatever the source baked in
    // and stays that way while everything around it changes. The shirt shipped
    // one for months -- the woven label at the back of the neck, carrying the
    // source's own texture at a roughness no other piece of cloth here uses.
    //
    // Three ways to be accounted for: a print zone, a colour part, or a
    // `fixedMaterials` entry, which is the catalog saying out loud that a part
    // is meant to hold its own colour. The point of the third is that it is
    // written down; silence is what this test is for.
    for (const [id] of models) {
      const device = DEVICE_CATALOG[id];
      const claimed = new Set<string>(device.fixedMaterials ?? []);
      for (const part of Object.values(device.colorParts ?? {})) {
        for (const name of part.materials) claimed.add(name.split(SPLIT_MATERIAL_SEPARATOR)[0]);
      }
      for (const [, zone] of readArtworkZones(device)) {
        if (zone.material) claimed.add(zone.material.split(SPLIT_MATERIAL_SEPARATOR)[0]);
      }
      const named = (readGltfJson(fileOf(id)).materials ?? []).map((m) => m.name ?? "");
      expect(
        named.filter((name) => !claimed.has(name)).sort(),
        `${id}: materials in the file that no zone, colour part or fixedMaterials entry names`,
      ).toEqual([]);
    }
  });

  test("a print zone lands the whole template, in one piece, undistorted", () => {
    // Four ways the same design goes wrong on the way to the surface, so all
    // four are measured on every zone. Coverage below 1 means the edges of the
    // template never reach the product. More than one island means the artwork
    // is cut across a gap in the atlas. A mirrored triangle reads its slice of
    // the design backwards. Stretch means a circle arrives as an oval.
    for (const [id, baseline] of models) {
      const zones = readArtworkZones(DEVICE_CATALOG[id]);
      const triangles = trianglesOf(fileOf(id));
      const materials = new Set([...zones.values()].map((zone) => zone.material));
      expect(
        Object.keys(baseline.zones).sort(),
        `${id}: the baselines and the catalog disagree about which zones print`,
      ).toEqual([...materials].filter((name): name is string => Boolean(name)).sort());

      for (const [material, want] of Object.entries(baseline.zones)) {
        const uv = uvOf(zoneTriangles(triangles, material));
        expect(uv, `${id} ${material} carries no texture coordinates`).not.toBeNull();
        if (!uv) continue;
        ratchet(`${id} ${material} coverage`, uv.coverage, want.coverage, ZONE_TARGET.coverage, "higher");
        ratchet(`${id} ${material} islands`, uv.islands, want.islands, ZONE_TARGET.islands, "lower");
        ratchet(`${id} ${material} mirrored triangles`, uv.mirroredTriangles, want.mirroredTriangles,
          ZONE_TARGET.mirroredTriangles, "lower");
        ratchet(`${id} ${material} stretch`, uv.stretch, want.stretch, ZONE_TARGET.stretch, "lower");
      }
    }
  });

  test("the surface carries no artifact and no seam drawn over nothing", () => {
    // A degenerate triangle has no area to shade. Two faces on the same three
    // corners fight over the same pixels. An edge used by three faces has no
    // single answer for which way the surface points.
    //
    // The last one is the subtle one, and it is the difference between the two
    // things people mean by "seam": a shading split across geometry that is
    // flat draws a line where the model has no edge at all.
    for (const [id, baseline] of models) {
      const triangles = trianglesOf(fileOf(id));
      const geometry = geometryOf(triangles);
      const edges = edgesOf(triangles);
      ratchet(`${id} degenerate triangles`, geometry.degenerate, baseline.degenerateTriangles, MODEL_TARGET.degenerateTriangles, "lower");
      ratchet(`${id} coincident faces`, geometry.coincident, baseline.coincidentFaces,
        MODEL_TARGET.coincidentFaces, "lower");
      ratchet(`${id} non-manifold edges`, edges.nonManifold, baseline.nonManifoldEdges,
        MODEL_TARGET.nonManifoldEdges, "lower");
      ratchet(`${id} shading splits on flat geometry`, edges.splitsOnFlat, baseline.shadingSplitsOnFlat,
        MODEL_TARGET.shadingSplitsOnFlat, "lower");
    }
  });

  test("an opening in a model is one the product means to have", () => {
    // Cloth is an open surface: the tote's mouth and the shirt's hem, cuffs and
    // neck are real, and closing them is not the goal. Pinning the count is,
    // because a new hole is a torn model and reads identically to an intended
    // one until someone counts. When phase 3 hems these, the numbers drop, and
    // dropping them is a change that has to be written down like any other.
    for (const [id, baseline] of models) {
      const edges = edgesOf(trianglesOf(fileOf(id)));
      ratchet(`${id} boundary edges`, edges.boundary, baseline.boundaryEdges, baseline.boundaryEdges, "lower");
    }
  });

  test("cloth creases where it is sewn or folded, and nowhere else", () => {
    // Canvas and jersey have a bend radius, and a tote whose base fold meets at
    // 60 degrees reads as folded card. But a sewn seam creases, a hem folds
    // right over, and a webbing strap has an edge: measured, that is what almost
    // all of these are, so the count is pinned rather than driven to zero and
    // `SOFT_GOODS_HARD_EDGES_ARE_PINNED` says what it is made of.
    //
    // What the models are actually held to is the shading, which is checked
    // above and is clean: none of these creases draws a line across flat cloth.
    // Hard-surface products are left out rather than given a larger allowance --
    // a clasp is supposed to have corners.
    for (const [id, baseline] of models) {
      if (!SOFT_GOODS.includes(id)) continue;
      const edges = edgesOf(trianglesOf(fileOf(id)));
      ratchet(`${id} interior edges at 45 degrees or more`, edges.byAngle.hard,
        baseline.hardInteriorEdges, baseline.hardInteriorEdges, "lower");
    }
  });

  test("no material is both fully metallic and fully rough", () => {
    // Metal has no diffuse colour of its own; it shows what it reflects. Take
    // the reflection away by making it fully rough and there is nothing left,
    // so the surface renders near black whatever base colour it names. It is
    // never a deliberate setting, only a default nobody replaced.
    for (const [id, baseline] of models) {
      const black = (readGltfJson(fileOf(id)).materials ?? [])
        .filter((material) => (material.pbrMetallicRoughness?.metallicFactor ?? 1) >= 0.9
          && (material.pbrMetallicRoughness?.roughnessFactor ?? 1) >= 0.9)
        .map((material) => material.name ?? "")
        .sort();
      expect(
        black,
        `${id}: the baseline records ${JSON.stringify(baseline.blackMaterials)} rendering black, `
          + `the file measures ${JSON.stringify(black)}`,
      ).toEqual([...baseline.blackMaterials].sort());
      ratchet(`${id} materials rendering black`, black.length, baseline.blackMaterials.length,
        MODEL_TARGET.blackMaterials, "lower");
    }
  });
});
