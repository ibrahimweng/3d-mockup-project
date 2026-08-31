import * as THREE from "three";
import { describe, expect, test } from "vitest";

import {
  COLOR_PART_IDS,
  DEVICE_CATALOG,
  SPLIT_MATERIAL_SEPARATOR,
  type ColorPartId,
  type DeviceId,
} from "../product-domain";
import {
  applyBlankStock,
  applyPartColors,
  captureBaseColors,
  splitMaterialsByMesh,
} from "./model-appearance";

/** A stand-in product carrying exactly the materials a definition names. */
function buildSubject(names: readonly string[]): THREE.Object3D {
  const root = new THREE.Group();
  for (const name of names) {
    const material = new THREE.MeshStandardMaterial({ color: "#808080" });
    material.name = name;
    root.add(new THREE.Mesh(new THREE.BoxGeometry(), material));
  }
  return root;
}

const productsWithParts = (Object.keys(DEVICE_CATALOG) as DeviceId[]).filter(
  (id) => DEVICE_CATALOG[id].colorParts !== undefined,
);

test("part colours paint only the materials each product names", () => {
  // The catalog is the subject here rather than a fixture: a slot that named a
  // material belonging to another part, or the same material as another slot,
  // would give one picker two jobs and leave another with none.
  expect(productsWithParts.length).toBeGreaterThan(0);

  for (const id of productsWithParts) {
    const definition = DEVICE_CATALOG[id];
    const parts = definition.colorParts ?? {};
    const named = COLOR_PART_IDS.flatMap(
      (part) => parts[part]?.materials ?? [],
    );

    // No material may answer to two slots, or moving one picker silently moves
    // what another one is showing.
    expect(new Set(named).size, `${id} repeats a material across its slots`).toBe(
      named.length,
    );

    // A decoy stands in for every other material the product has. Painting it
    // would mean a slot reaching past the part it names.
    const decoy = `${id}-untouched-material`;
    const subject = buildSubject([...named, decoy]);
    const baseColors = captureBaseColors(subject);
    const before = new Map(
      [...baseColors.keys()].map((material) => [
        material.name,
        material.color.getHexString(),
      ]),
    );

    const colors: Partial<Record<ColorPartId, string>> = {};
    for (const part of COLOR_PART_IDS) {
      if (parts[part]) colors[part] = "#123456";
    }
    applyPartColors(baseColors, definition, colors);

    for (const material of baseColors.keys()) {
      const painted = named.includes(material.name);
      expect(
        material.color.getHexString(),
        `${id} / ${material.name} should ${painted ? "" : "not "}be painted`,
      ).toBe(painted ? "123456" : before.get(material.name));
    }
  }
});

test("clearing a slot returns its part to the colour the file gave it", () => {
  // Whichever product declares a main slot, rather than one named here: which
  // parts a product offers is a catalog decision that moves, and a test that
  // pins one silently stops testing anything the day that product drops the
  // slot.
  const id = productsWithParts.find(
    (candidate) => (DEVICE_CATALOG[candidate].colorParts?.main?.materials ?? []).length > 0,
  );
  expect(id, "no product declares a main colour slot").toBeDefined();
  const definition = DEVICE_CATALOG[id as DeviceId];
  const named = definition.colorParts?.main?.materials ?? [];
  const subject = buildSubject([...named]);
  const baseColors = captureBaseColors(subject);
  const authored = [...baseColors.keys()].map((m) => m.color.getHexString());

  applyPartColors(baseColors, definition, { main: "#abcdef" });
  expect([...baseColors.keys()].map((m) => m.color.getHexString())).not.toEqual(
    authored,
  );

  // An empty slot paints nothing, which is what leaves the reset in
  // applyFinish to put the authored colour back rather than this.
  for (const [material, base] of baseColors) material.color.copy(base.color);
  applyPartColors(baseColors, definition, {});
  expect([...baseColors.keys()].map((m) => m.color.getHexString())).toEqual(
    authored,
  );
});

describe("splitting a shared material", () => {
  test("gives each mesh its own copy named after it, and leaves single users alone", () => {
    const root = new THREE.Group();
    const shared = new THREE.MeshStandardMaterial();
    shared.name = "blinn2";
    for (const meshName of ["Tablet", "Pen"]) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(), shared);
      mesh.name = meshName;
      root.add(mesh);
    }
    const lone = new THREE.MeshStandardMaterial();
    lone.name = "Chrome";
    const loneMesh = new THREE.Mesh(new THREE.BoxGeometry(), lone);
    loneMesh.name = "Ring";
    root.add(loneMesh);

    splitMaterialsByMesh(root);

    const names = new Set<string>();
    root.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        names.add((object.material as THREE.Material).name);
      }
    });

    expect(names).toEqual(
      new Set([
        `blinn2${SPLIT_MATERIAL_SEPARATOR}Tablet`,
        `blinn2${SPLIT_MATERIAL_SEPARATOR}Pen`,
        // Used once, so it keeps the name the catalog would already address it
        // by. Renaming it would break every entry that names it.
        "Chrome",
      ]),
    );
  });
});

describe("the cloth a product is printed on", () => {
  const withStock = (Object.keys(DEVICE_CATALOG) as DeviceId[]).filter(
    (id) => (DEVICE_CATALOG[id].blankStockMaterials ?? []).length > 0,
  );

  test("no material is both blank stock and a colour slot", () => {
    // The two would fight on every repaint, and which won would be the order
    // the painters happen to run in rather than anything the catalog says.
    // They mean opposite things: blank stock is the cloth the whole product is
    // made of, a slot is a part made of something else.
    expect(withStock.length).toBeGreaterThan(0);
    for (const id of withStock) {
      const definition = DEVICE_CATALOG[id];
      const slots = new Set(
        COLOR_PART_IDS.flatMap(
          (part) => definition.colorParts?.[part]?.materials ?? [],
        ),
      );
      for (const name of definition.blankStockMaterials ?? []) {
        expect(slots.has(name), `${id}: ${name} is blank stock and a colour slot`).toBe(false);
      }
    }
  });

  test("the print background paints the cloth and nothing else", () => {
    for (const id of withStock) {
      const definition = DEVICE_CATALOG[id];
      const cloth = definition.blankStockMaterials ?? [];
      // One material the product does not call cloth, to prove the paint is
      // aimed rather than sprayed: a rib collar keeps its own colour.
      const other =
        COLOR_PART_IDS.flatMap(
          (part) => definition.colorParts?.[part]?.materials ?? [],
        )[0] ?? "Something_Else";
      const root = buildSubject([...cloth, other]);
      const base = captureBaseColors(root);

      applyBlankStock(base, definition, "#123456");
      const painted = new Map(
        [...base.keys()].map((m) => [m.name, `#${m.color.getHexString()}`]),
      );
      for (const name of cloth) expect(painted.get(name), `${id}: ${name}`).toBe("#123456");
      expect(painted.get(other), `${id}: ${other} took the cloth's colour`).toBe("#808080");
    }
  });

  test("no print background means no repaint", () => {
    // A device prints on nothing and declares no cloth, so this has to be a
    // no-op rather than a black product.
    const root = buildSubject(["Shirt_Body"]);
    const base = captureBaseColors(root);
    applyBlankStock(base, DEVICE_CATALOG["tshirt"], undefined);
    for (const [material] of base) expect(`#${material.color.getHexString()}`).toBe("#808080");
  });
});
