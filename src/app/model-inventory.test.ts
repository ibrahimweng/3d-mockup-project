import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import { readModelInventory } from "./model-inventory";
import {
  DEVICE_CATALOG,
  FINISH_OPTIONS,
  SPLIT_MATERIAL_SEPARATOR,
} from "./product-domain";

const modelsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "public", "models");

const catalog = Object.entries(DEVICE_CATALOG).map(([id, definition]) => ({
  definition,
  id,
  path: join(modelsDir, definition.modelFile),
}));

test("every model file the catalog names is actually shipped", () => {
  const missing = catalog.filter((entry) => !existsSync(entry.path));
  expect(missing.map((entry) => entry.definition.modelFile)).toEqual([]);
});

describe("the names the catalog uses exist in the models", () => {
  /**
   * The failure this prevents is silent. A finish that names a material the
   * model no longer has paints nothing at all, a screen material that has been
   * renamed stops showing the screenshot, and both look like a rendering
   * problem rather than a stale string. Nothing else in the suite can catch it,
   * because a wrong name is still a valid string.
   */
  test.each(catalog)("$id", ({ definition, path }) => {
    const inventory = readModelInventory(path);
    const materials = new Set(inventory.materials);
    const meshes = new Set(inventory.meshes);
    const nodes = new Set(inventory.nodes);
    const missing: string[] = [];

    /**
     * A material the catalog names, which may be one the file ships or one the
     * loader splits out of it.
     *
     * A split name is the shared material and the mesh it was cloned for,
     * joined — so checking it means checking both halves exist, which catches
     * a re-export that renames either. The split copies cannot be in the file
     * by construction: they do not exist until the model is loaded.
     */
    const hasMaterial = (name: string): boolean => {
      const cut = name.indexOf(SPLIT_MATERIAL_SEPARATOR);
      if (cut < 0) return materials.has(name);
      return (
        definition.splitMaterialsByMesh === true &&
        materials.has(name.slice(0, cut)) &&
        meshes.has(name.slice(cut + SPLIT_MATERIAL_SEPARATOR.length))
      );
    };

    // The design surface. Without this the product has nothing to print on.
    if (!hasMaterial(definition.screenMaterial)) {
      missing.push(`screenMaterial "${definition.screenMaterial}"`);
    }

    // Every material a colour slot paints. A slot naming a material the file
    // does not have is a picker that silently does nothing.
    for (const [part, spec] of Object.entries(definition.colorParts ?? {})) {
      for (const material of spec.materials) {
        if (!hasMaterial(material)) {
          missing.push(`${part} colour material "${material}"`);
        }
      }
    }

    // Everything a colourway repaints.
    for (const material of definition.bodyMaterials ?? []) {
      if (!hasMaterial(material)) missing.push(`bodyMaterial "${material}"`);
    }

    // Accents are named per finish, so a rename can break one colourway and
    // leave the rest looking fine.
    for (const option of FINISH_OPTIONS) {
      const finish = definition.finishes?.[option.value];
      for (const accent of Object.keys(finish?.accents ?? {})) {
        if (!materials.has(accent)) missing.push(`${option.value} accent "${accent}"`);
      }
    }

    // One file can carry several devices as sibling scenes — the MacBook and
    // the iMac share `macbook.glb` — so the scene name is what decides which
    // machine appears. A wrong one renders the other device entirely.
    const sceneName = (definition as { sceneName?: string }).sceneName;
    if (sceneName !== undefined && !new Set(inventory.scenes).has(sceneName)) {
      missing.push(`sceneName "${sceneName}"`);
    }

    // A node that is meant to be hidden and no longer exists is not harmless:
    // the bounds it was excluded from come back, and the camera pulls away to
    // hold geometry nobody can see.
    for (const node of definition.excludedNodes) {
      if (!nodes.has(node)) missing.push(`excludedNode "${node}"`);
    }

    expect(missing).toEqual([]);
  });
});

describe("reading a model", () => {
  test("reports a real inventory rather than an empty one", () => {
    // Guards the reader itself: a parser that silently returned nothing would
    // make every assertion above vacuously true.
    for (const entry of catalog) {
      const inventory = readModelInventory(entry.path);
      expect(inventory.materials.length, `${entry.id} has no materials`).toBeGreaterThan(0);
      expect(inventory.nodes.length, `${entry.id} has no nodes`).toBeGreaterThan(0);
      expect(inventory.scenes.length, `${entry.id} has no scenes`).toBeGreaterThan(0);
    }
  });

  test("refuses a file that is not a GLB", () => {
    expect(() => readModelInventory(join(modelsDir, "..", "..", "package.json"))).toThrow(/GLB/);
  });
});
