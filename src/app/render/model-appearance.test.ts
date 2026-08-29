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
  const definition = DEVICE_CATALOG.tshirt;
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
