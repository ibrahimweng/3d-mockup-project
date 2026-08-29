#!/usr/bin/env node
/**
 * Prepare a supplied GLB for the device catalog.
 *
 * Models arrive built for a renderer with different priorities: compressed for
 * download, tessellated for a close-up render, unwrapped into whatever atlas
 * the author happened to be using. This app wants the opposite of most of that
 * — it loads with a plain `GLTFLoader` and no decoder, draws the device at a
 * few hundred pixels, and supplies the screen's texture at runtime.
 *
 * Usage:
 *   node scripts/clean-model.mjs <input.glb> <output.glb> [options]
 *
 *   --scene <name>     Scene to keep. Defaults to the file's default scene.
 *   --screen <name>    Material carrying the display, whose unwrap is rebuilt.
 *   --ratio <0..1>     Triangle target for the simplifier. Default 0.08.
 *   --error <number>   How far the simplifier may move a surface. Default
 *                      0.002, as a fraction of the mesh's own size.
 *   --drop-material <name>
 *                      Remove every primitive painted with this material.
 *                      Repeatable. This is deletion rather than reduction: a
 *                      part the file models and the mockup does not need costs
 *                      its whole triangle count, and removing it leaves every
 *                      other surface exactly as authored, which simplifying to
 *                      the same saving would not.
 *   --keep-geometry    Skip welding, simplification and quantisation, so the
 *                      surviving meshes ship as the file had them. Use with
 *                      --drop-material when the saving is a part rather than a
 *                      density.
 *
 * Every step reports what it changed, because a model that arrives looking
 * cheap is usually hiding its cost somewhere — the Mac Studio was 3.5MB as
 * supplied and 34.8MB once its compression came off.
 */

import { NodeIO } from "@gltf-transform/core";
import {
  ALL_EXTENSIONS,
  KHRDracoMeshCompression,
} from "@gltf-transform/extensions";
import {
  dedup,
  prune,
  quantize,
  simplify,
  weld,
} from "@gltf-transform/functions";
import draco3d from "draco3dgltf";
import { MeshoptSimplifier } from "meshoptimizer";
import { statSync } from "node:fs";

function parseArguments(argv) {
  const [input, output, ...rest] = argv;
  if (!input || !output) {
    throw new Error(
      "Usage: node scripts/clean-model.mjs <input.glb> <output.glb> " +
        "[--scene <name>] [--screen <name>] [--ratio <n>] [--error <n>]",
    );
  }
  const options = {
    dropMaterials: [],
    error: 0.002,
    keepGeometry: false,
    ratio: 0.08,
  };
  for (let index = 0; index < rest.length; index += 1) {
    const flag = rest[index];
    if (flag === "--keep-geometry") {
      options.keepGeometry = true;
      continue;
    }
    const value = rest[index + 1];
    if (value === undefined) throw new Error(`Missing value for ${flag}`);
    index += 1;
    if (flag === "--scene") options.scene = value;
    else if (flag === "--screen") options.screen = value;
    else if (flag === "--ratio") options.ratio = Number(value);
    else if (flag === "--error") options.error = Number(value);
    else if (flag === "--drop-material") options.dropMaterials.push(value);
    else throw new Error(`Unknown option ${flag}`);
  }
  return { input, options, output };
}

/**
 * Remove every primitive painted with one of the named materials.
 *
 * A mesh left with no primitives is removed too, and so is the node holding
 * it, or the file keeps a scene graph full of empty objects that still cost
 * bounds and traversal. `prune` then takes the accessors and materials nothing
 * refers to any more.
 */
function dropMaterials(document, names) {
  const wanted = new Set(names);
  const found = new Set();
  let removed = 0;

  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const name = primitive.getMaterial()?.getName();
      if (name === undefined || !wanted.has(name)) continue;
      found.add(name);
      removed += countPrimitiveTriangles(primitive);
      mesh.removePrimitive(primitive);
      primitive.dispose();
    }
    if (mesh.listPrimitives().length === 0) mesh.dispose();
  }

  for (const name of wanted) {
    if (!found.has(name)) {
      console.log(`  WARNING: no primitive uses material "${name}"`);
    }
  }
  return removed;
}

function countPrimitiveTriangles(primitive) {
  const indices = primitive.getIndices();
  const position = primitive.getAttribute("POSITION");
  const count = indices ? indices.getCount() : (position?.getCount() ?? 0);
  return Math.floor(count / 3);
}

function countTriangles(scene) {
  let total = 0;
  const visit = (nodes) => {
    for (const node of nodes) {
      const mesh = node.getMesh();
      if (mesh) {
        for (const primitive of mesh.listPrimitives()) {
          const indices = primitive.getIndices();
          const position = primitive.getAttribute("POSITION");
          total += indices
            ? indices.getCount() / 3
            : position
              ? position.getCount() / 3
              : 0;
        }
      }
      visit(node.listChildren());
    }
  };
  visit(scene.listChildren());
  return Math.round(total);
}

/**
 * Give the display a clean 0..1 unwrap.
 *
 * A panel is usually mapped into a corner of a shared atlas, which is fine for
 * a baked wallpaper and useless for a design supplied at runtime: it would
 * land squeezed into part of the panel and cropped by the rest. Pruning the
 * atlas texture tends to drop the coordinates entirely, so they are rebuilt
 * from the geometry rather than patched.
 *
 * The panel is flat, so the two axes it spans are the two with any extent, and
 * position maps to texture coordinate directly along them.
 */
function unwrapScreen(document, materialName) {
  let unwrapped = 0;
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      if (primitive.getMaterial()?.getName() !== materialName) continue;
      const position = primitive.getAttribute("POSITION");
      if (!position) continue;

      const min = position.getMin([]);
      const max = position.getMax([]);
      const extent = min.map((value, axis) => max[axis] - value);
      const [horizontal, vertical] = [0, 1, 2]
        .sort((a, b) => extent[b] - extent[a])
        .slice(0, 2);
      if (!(extent[horizontal] > 0) || !(extent[vertical] > 0)) continue;

      const uv = new Float32Array(position.getCount() * 2);
      const point = [];
      for (let index = 0; index < position.getCount(); index += 1) {
        position.getElement(index, point);
        uv[index * 2] =
          (point[horizontal] - min[horizontal]) / extent[horizontal];
        // Textures are uploaded unflipped, so v runs down from the top edge.
        uv[index * 2 + 1] =
          1 - (point[vertical] - min[vertical]) / extent[vertical];
      }
      primitive.setAttribute(
        "TEXCOORD_0",
        document.createAccessor().setType("VEC2").setArray(uv),
      );
      unwrapped += 1;
    }
  }
  return unwrapped;
}

async function main() {
  const { input, options, output } = parseArguments(process.argv.slice(2));

  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      "draco3d.decoder": await draco3d.createDecoderModule(),
      "draco3d.encoder": await draco3d.createEncoderModule(),
    });
  await MeshoptSimplifier.ready;

  const document = await io.read(input);
  const root = document.getRoot();

  const keep = options.scene
    ? root.listScenes().find((scene) => scene.getName() === options.scene)
    : root.getDefaultScene();
  if (!keep) {
    throw new Error(
      `Scene "${options.scene}" not found. This file has: ` +
        root
          .listScenes()
          .map((scene) => scene.getName())
          .join(", "),
    );
  }

  const before = countTriangles(keep);
  console.log(
    `${input}: ${(statSync(input).size / 1048576).toFixed(2)}MB, ` +
      `keeping scene "${keep.getName()}" at ${before.toLocaleString()} triangles`,
  );

  for (const scene of root.listScenes()) {
    if (scene === keep) continue;
    console.log(`  dropping unused scene "${scene.getName()}"`);
    scene.dispose();
  }
  root.setDefaultScene(keep);

  if (options.dropMaterials.length > 0) {
    const removed = dropMaterials(document, options.dropMaterials);
    console.log(
      `  dropped ${removed.toLocaleString()} triangles painted with ` +
        options.dropMaterials.map((name) => `"${name}"`).join(", "),
    );
  }

  // The app loads with a plain GLTFLoader, so nothing may stay compressed.
  document.createExtension(KHRDracoMeshCompression).dispose();

  if (options.keepGeometry) {
    // Only the references nothing uses any more. Every surviving surface keeps
    // the vertices, normals and precision the file gave it.
    await document.transform(prune());
  } else {
    await document.transform(
      dedup(),
      // Welding merges vertices split only by float noise, which is what lets
      // the simplifier collapse an edge at all.
      weld(),
      // The error bound is what protects the silhouette: the simplifier stops
      // early on any mesh it cannot reduce without moving the surface further
      // than this, so the ratio is a target rather than a promise.
      simplify({
        error: options.error,
        ratio: options.ratio,
        simplifier: MeshoptSimplifier,
      }),
      prune(),
    );
  }

  if (options.screen) {
    const count = unwrapScreen(document, options.screen);
    console.log(
      count > 0
        ? `  rebuilt the unwrap on ${count} primitive(s) of "${options.screen}"`
        : `  WARNING: no primitive uses material "${options.screen}"`,
    );
  }

  if (!options.keepGeometry) {
    await document.transform(
      // Full float precision costs far more than the accuracy is worth at the
      // size these are drawn.
      quantize({
        quantizeNormal: 10,
        quantizePosition: 14,
        quantizeTexcoord: 12,
      }),
    );
  }

  await io.write(output, document);
  const after = countTriangles(root.getDefaultScene());
  console.log(
    `${output}: ${(statSync(output).size / 1048576).toFixed(2)}MB, ` +
      `${after.toLocaleString()} triangles ` +
      `(${(100 - (100 * after) / before).toFixed(0)}% fewer)`,
  );
}

await main();
