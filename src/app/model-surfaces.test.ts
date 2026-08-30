import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { readArtworkZones } from "./product-applicability";
import {
  COLOR_PART_IDS,
  DEVICE_CATALOG,
  SPLIT_MATERIAL_SEPARATOR,
  type DeviceId,
} from "./product-domain";

/**
 * What the shipped GLBs say about their own surfaces.
 *
 * Read straight out of the files rather than through three.js, because what
 * matters is what the file declares: the renderer applies it faithfully, so a
 * material that culls its back faces in the file culls them on screen.
 *
 * The glTF JSON chunk is enough for this — every property here lives in it,
 * and parsing it costs nothing next to decoding 23MB of shirt geometry.
 */
type GltfMaterial = {
  doubleSided?: boolean;
  name?: string;
  normalTexture?: { index: number; texCoord?: number };
};

function readGltfJson(file: string): { materials?: GltfMaterial[] } {
  const bytes = readFileSync(join(process.cwd(), "public", "models", file));
  expect(bytes.subarray(0, 4).toString("ascii"), `${file} is not a GLB`).toBe("glTF");
  const jsonLength = bytes.readUInt32LE(12);
  return JSON.parse(bytes.subarray(20, 20 + jsonLength).toString("utf8"));
}

/** A catalog name reaches the file without the mesh a load-time split adds. */
function fileMaterialName(name: string): string {
  return name.split(SPLIT_MATERIAL_SEPARATOR)[0];
}

const products = (Object.keys(DEVICE_CATALOG) as DeviceId[]).filter(
  (id) => DEVICE_CATALOG[id].artworkSurface === "print",
);

describe("the surfaces a merchandise model ships", () => {
  test("every material a product names renders both of its faces", () => {
    // The regression this exists for: rebuilding the print zones created fresh
    // materials, a fresh glTF material is single-sided, and nobody noticed
    // until a shirt seen from the side showed a black hole where its armhole
    // should be. Splitting a product into zones is what makes each zone an
    // open patch of surface, and an open patch culled from behind is a hole —
    // up a sleeve, through a neck, down the mouth of a bag.
    expect(products.length).toBeGreaterThan(0);

    for (const id of products) {
      const device = DEVICE_CATALOG[id];
      const gltf = readGltfJson(device.modelFile);
      const byName = new Map(
        (gltf.materials ?? []).map((material) => [material.name ?? "", material]),
      );

      const named = [
        ...[...readArtworkZones(device).values()].map((zone) => zone.material),
        ...COLOR_PART_IDS.flatMap(
          (part) => device.colorParts?.[part]?.materials ?? [],
        ),
      ];
      expect(named.length, `${id} names no materials`).toBeGreaterThan(0);

      for (const name of named) {
        const material = byName.get(fileMaterialName(name));
        expect(material, `${id}: ${name} is not in ${device.modelFile}`).toBeDefined();
        expect(
          material?.doubleSided === true,
          `${id}: ${name} culls its back faces, so the product is see-through wherever that surface is seen from inside`,
        ).toBe(true);
      }
    }
  });

  test("the shirt's fabric keeps the weave it was authored with", () => {
    // Also lost in the same rebuild, and less obvious than a hole: without it
    // the panels light like vinyl rather than cotton, which is the difference
    // a close-up is for. The map is authored against the file's own texture
    // coordinates, which are in millimetres and tile, so it has to ride a
    // second UV channel rather than the 0..1 unwrap a design uses.
    const device = DEVICE_CATALOG.tshirt;
    const gltf = readGltfJson(device.modelFile);
    const zones = [...readArtworkZones(device).values()].map((zone) => zone.material);
    const byName = new Map(
      (gltf.materials ?? []).map((material) => [material.name ?? "", material]),
    );

    for (const name of zones) {
      const normal = byName.get(name)?.normalTexture;
      expect(normal, `${name} lost its weave`).toBeDefined();
      expect(
        normal?.texCoord,
        `${name}'s weave rides the design's unwrap, where one texel covers the whole panel`,
      ).toBe(1);
    }
  });
});
