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
type GltfAccessor = {
  bufferView?: number;
  byteOffset?: number;
  componentType: number;
  count: number;
  type: string;
};

type GltfMaterial = {
  doubleSided?: boolean;
  name?: string;
  normalTexture?: { index: number; texCoord?: number };
};

type Gltf = {
  accessors?: GltfAccessor[];
  bufferViews?: { byteOffset?: number; byteStride?: number }[];
  materials?: GltfMaterial[];
  meshes?: { primitives: { attributes: Record<string, number>; indices?: number; material?: number }[] }[];
  nodes?: { children?: number[]; matrix?: number[]; mesh?: number; rotation?: number[]; scale?: number[]; translation?: number[] }[];
  scenes?: { nodes?: number[] }[];
};

function readGlb(file: string): { bin: Buffer; gltf: Gltf } {
  const bytes = readFileSync(join(process.cwd(), "public", "models", file));
  expect(bytes.subarray(0, 4).toString("ascii"), `${file} is not a GLB`).toBe("glTF");
  const jsonLength = bytes.readUInt32LE(12);
  const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString("utf8")) as Gltf;
  // The binary chunk follows the JSON chunk, each with an 8-byte header.
  const binStart = 20 + jsonLength + 8;
  return { bin: bytes.subarray(binStart), gltf };
}

function readGltfJson(file: string): Gltf {
  return readGlb(file).gltf;
}

/** One accessor, as plain numbers. Floats and the index integer widths only. */
function readAccessor(gltf: Gltf, bin: Buffer, index: number): number[][] {
  const accessor = gltf.accessors?.[index];
  if (!accessor) return [];
  const width = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[accessor.type] ?? 1;
  const size = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 }[accessor.componentType] ?? 4;
  const view = gltf.bufferViews?.[accessor.bufferView ?? 0] ?? {};
  const stride = view.byteStride || width * size;
  const base = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const read = (at: number): number =>
    accessor.componentType === 5126
      ? bin.readFloatLE(at)
      : accessor.componentType === 5125
        ? bin.readUInt32LE(at)
        : accessor.componentType === 5123
          ? bin.readUInt16LE(at)
          : bin.readUInt8(at);
  const out: number[][] = [];
  for (let i = 0; i < accessor.count; i += 1) {
    const row: number[] = [];
    for (let c = 0; c < width; c += 1) row.push(read(base + i * stride + c * size));
    out.push(row);
  }
  return out;
}

/** Every mesh in the file, with the world matrix its node puts it under. */
function meshesInWorld(gltf: Gltf): { matrix: number[]; mesh: number }[] {
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const multiply = (a: number[], b: number[]): number[] => {
    const out = new Array<number>(16).fill(0);
    for (let r = 0; r < 4; r += 1) {
      for (let c = 0; c < 4; c += 1) {
        for (let k = 0; k < 4; k += 1) out[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
      }
    }
    return out;
  };
  const local = (node: NonNullable<Gltf["nodes"]>[number]): number[] => {
    if (node.matrix) return node.matrix;
    const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1];
    const [sx, sy, sz] = node.scale ?? [1, 1, 1];
    const [tx, ty, tz] = node.translation ?? [0, 0, 0];
    return [
      (1 - 2 * (y * y + z * z)) * sx, (2 * (x * y + z * w)) * sx, (2 * (x * z - y * w)) * sx, 0,
      (2 * (x * y - z * w)) * sy, (1 - 2 * (x * x + z * z)) * sy, (2 * (y * z + x * w)) * sy, 0,
      (2 * (x * z + y * w)) * sz, (2 * (y * z - x * w)) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
      tx, ty, tz, 1,
    ];
  };
  const found: { matrix: number[]; mesh: number }[] = [];
  const walk = (index: number, parent: number[]): void => {
    const node = gltf.nodes?.[index];
    if (!node) return;
    const world = multiply(parent, local(node));
    if (node.mesh !== undefined) found.push({ matrix: world, mesh: node.mesh });
    for (const child of node.children ?? []) walk(child, world);
  };
  for (const scene of gltf.scenes ?? []) for (const root of scene.nodes ?? []) walk(root, identity);
  return found;
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

  test("a print zone covers the whole face it is the print zone of", () => {
    // The defect this exists for: the card's flat face was split between the
    // print zone and the clasp's metal, so a design stopped about a sixth of
    // the way down from the top and the rest of the badge rendered as brushed
    // steel. It was invisible in the catalog and in the schema, because both
    // only name a material — nothing said how much of the face that material
    // actually owned.
    //
    // A flat face is one surface. Whatever paints it should paint all of it,
    // so the check is that a product's largest flat face answers to exactly
    // one material.
    for (const id of products) {
      const device = DEVICE_CATALOG[id];
      const { bin, gltf } = readGlb(device.modelFile);
      const names = (gltf.materials ?? []).map((material) => material.name ?? "");

      // Triangle area per material, bucketed by the plane the triangle lies
      // in: its normal rounded to a coarse direction and its distance along
      // that normal rounded to a slab. Coplanar triangles land together.
      const planes = new Map<string, Map<string, number>>();
      for (const { matrix, mesh } of meshesInWorld(gltf)) {
        for (const prim of gltf.meshes?.[mesh]?.primitives ?? []) {
          const name = names[prim.material ?? -1] ?? "";
          const position = readAccessor(gltf, bin, prim.attributes.POSITION);
          const index = prim.indices === undefined
            ? position.map((_, i) => [i])
            : readAccessor(gltf, bin, prim.indices);
          const at = (i: number): number[] => {
            const [x, y, z] = position[i];
            return [
              matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
              matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
              matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14],
            ];
          };
          for (let t = 0; t + 2 < index.length; t += 3) {
            const [a, b, c] = [at(index[t][0]), at(index[t + 1][0]), at(index[t + 2][0])];
            const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
            const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
            const n = [
              u[1] * v[2] - u[2] * v[1],
              u[2] * v[0] - u[0] * v[2],
              u[0] * v[1] - u[1] * v[0],
            ];
            const length = Math.hypot(...n);
            if (length < 1e-9) continue;
            const unit = n.map((value) => value / length);
            const key = [
              ...unit.map((value) => Math.round(value * 8)),
              Math.round((unit[0] * a[0] + unit[1] * a[1] + unit[2] * a[2]) * 200),
            ].join(",");
            const byMaterial = planes.get(key) ?? new Map<string, number>();
            byMaterial.set(name, (byMaterial.get(name) ?? 0) + length / 2);
            planes.set(key, byMaterial);
          }
        }
      }

      // Every print zone, not just the largest face: each one is checked on
      // the plane where most of it lies, so a zone that lost the top of its
      // own panel is caught whichever panel it is.
      for (const zone of readArtworkZones(device).values()) {
        let face: Map<string, number> | null = null;
        let mine = 0;
        for (const byMaterial of planes.values()) {
          const area = byMaterial.get(zone.material) ?? 0;
          if (area > mine) [mine, face] = [area, byMaterial];
        }
        // Cloth has no flat face worth speaking of, so there is nothing here
        // to be short of; the check is about panels that really are planar.
        if (!face || mine < 0.5) continue;

        const total = [...face.values()].reduce((sum, value) => sum + value, 0);
        const others = [...face].filter(([name]) => name !== zone.material);
        expect(
          mine / total,
          `${id}: ${zone.material} covers only ${((100 * mine) / total).toFixed(0)}% of the flat face it sits on, the rest being ${others.map(([n]) => n).join(", ")} \u2014 a design would stop short of the edge`,
        ).toBeGreaterThan(0.97);
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
