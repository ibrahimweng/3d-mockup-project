import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import { readModelInventory } from "./model-inventory";
import { DEVICE_CATALOG, FINISH_OPTIONS } from "./product-domain";

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
    const nodes = new Set(inventory.nodes);
    const missing: string[] = [];

    // The display. Without this the product has nothing to put a screenshot on.
    if (!materials.has(definition.screenMaterial)) {
      missing.push(`screenMaterial "${definition.screenMaterial}"`);
    }

    // Everything a colourway repaints.
    for (const material of definition.bodyMaterials ?? []) {
      if (!materials.has(material)) missing.push(`bodyMaterial "${material}"`);
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
