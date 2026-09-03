import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Reading a shipped GLB without a glTF library.
 *
 * Loaders are not allowed in `src/`, and the tests that hold the merchandise
 * models to their spec need the geometry itself rather than the JSON header
 * alone. So the file is parsed here. A GLB is a JSON chunk followed by a binary
 * chunk; every accessor in the JSON is a strided window into that binary.
 *
 * `docs/merchandise-models.md` is the spec these readings serve.
 */

export type Vec2 = [number, number];
export type Vec3 = [number, number, number];

export type GltfAccessor = {
  bufferView?: number;
  byteOffset?: number;
  componentType: number;
  count: number;
  type: string;
};

export type GltfMaterial = {
  doubleSided?: boolean;
  name?: string;
  normalTexture?: { index: number; texCoord?: number };
  pbrMetallicRoughness?: {
    baseColorTexture?: { index: number; texCoord?: number };
    metallicFactor?: number;
    /** Roughness in its green channel and metalness in its blue. */
    metallicRoughnessTexture?: { index: number; texCoord?: number };
    roughnessFactor?: number;
  };
};

export type GltfNode = {
  children?: number[];
  matrix?: number[];
  mesh?: number;
  rotation?: number[];
  scale?: number[];
  translation?: number[];
};

export type GltfPrimitive = {
  attributes: Record<string, number>;
  indices?: number;
  material?: number;
};

export type Gltf = {
  accessors?: GltfAccessor[];
  bufferViews?: { byteOffset?: number; byteStride?: number }[];
  materials?: GltfMaterial[];
  meshes?: { name?: string; primitives: GltfPrimitive[] }[];
  nodes?: GltfNode[];
  scenes?: { nodes?: number[] }[];
};

/** A GLB's two chunks: the scene description, and the buffer it points into. */
export function readGlb(file: string): { bin: Buffer; gltf: Gltf } {
  const bytes = readFileSync(join(process.cwd(), "public", "models", file));
  if (bytes.subarray(0, 4).toString("ascii") !== "glTF") {
    throw new Error(`${file} is not a GLB`);
  }
  const jsonLength = bytes.readUInt32LE(12);
  const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString("utf8")) as Gltf;
  // The binary chunk follows the JSON chunk, each with an 8-byte header.
  return { bin: bytes.subarray(20 + jsonLength + 8), gltf };
}

export function readGltfJson(file: string): Gltf {
  return readGlb(file).gltf;
}

/** One accessor, as plain numbers. Floats and the index integer widths only. */
export function readAccessor(gltf: Gltf, bin: Buffer, index: number): number[][] {
  const accessor = gltf.accessors?.[index];
  if (!accessor) return [];
  const width = { MAT4: 16, SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[accessor.type] ?? 1;
  const size = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }[accessor.componentType] ?? 4;
  const view = gltf.bufferViews?.[accessor.bufferView ?? 0] ?? {};
  const stride = view.byteStride || width * size;
  const base = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const read = (at: number): number => {
    switch (accessor.componentType) {
      case 5126:
        return bin.readFloatLE(at);
      case 5125:
        return bin.readUInt32LE(at);
      case 5123:
        return bin.readUInt16LE(at);
      case 5122:
        return bin.readInt16LE(at);
      case 5120:
        return bin.readInt8(at);
      default:
        return bin.readUInt8(at);
    }
  };
  const out: number[][] = [];
  for (let i = 0; i < accessor.count; i += 1) {
    const row: number[] = [];
    for (let c = 0; c < width; c += 1) row.push(read(base + i * stride + c * size));
    out.push(row);
  }
  return out;
}

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function multiply(a: number[], b: number[]): number[] {
  const out = new Array<number>(16).fill(0);
  for (let r = 0; r < 4; r += 1) {
    for (let c = 0; c < 4; c += 1) {
      for (let k = 0; k < 4; k += 1) out[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
    }
  }
  return out;
}

/** A node's own transform, however the file chose to write it. */
function localMatrix(node: GltfNode): number[] {
  if (node.matrix) return node.matrix;
  const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale ?? [1, 1, 1];
  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ];
}

/** Every mesh in the file, with the world matrix its node puts it under. */
export function meshesInWorld(gltf: Gltf): { matrix: number[]; mesh: number }[] {
  const found: { matrix: number[]; mesh: number }[] = [];
  const walk = (index: number, parent: number[]): void => {
    const node = gltf.nodes?.[index];
    if (!node) return;
    const world = multiply(parent, localMatrix(node));
    if (node.mesh !== undefined) found.push({ matrix: world, mesh: node.mesh });
    for (const child of node.children ?? []) walk(child, world);
  };
  for (const scene of gltf.scenes ?? []) for (const root of scene.nodes ?? []) walk(root, IDENTITY);
  return found;
}

function transformPoint(m: number[], p: Vec3): Vec3 {
  return [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
  ];
}

/**
 * A direction under the same matrix. Translation drops out, and the models are
 * uniformly scaled, so the rotation part is enough without a normal matrix.
 */
function transformDirection(m: number[], p: Vec3): Vec3 {
  const out: Vec3 = [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2],
  ];
  const length = Math.hypot(out[0], out[1], out[2]) || 1;
  return [out[0] / length, out[1] / length, out[2] / length];
}

/** One triangle of a model, placed in the world its scene puts it in. */
export type Triangle = {
  /**
   * TEXCOORD_2 at the three corners: metres across the piece of cloth the zone
   * was cut from, shared with every zone cut from the same piece. Null on a
   * product that is not sewn from pieces.
   */
  cloth: [Vec2, Vec2, Vec2] | null;
  material: string;
  /** The mesh it came from, which a `material@mesh` split slot names. */
  mesh: string;
  /** Shading normals at the three corners, when the primitive supplies them. */
  normal: [Vec3, Vec3, Vec3] | null;
  position: [Vec3, Vec3, Vec3];
  /** TEXCOORD_0 at the three corners, when the primitive supplies it. */
  uv: [Vec2, Vec2, Vec2] | null;
};

/** Every triangle a model ships, ready to measure. */
export function readModelTriangles(file: string): Triangle[] {
  const { bin, gltf } = readGlb(file);
  const triangles: Triangle[] = [];
  for (const { matrix, mesh } of meshesInWorld(gltf)) {
    for (const primitive of gltf.meshes?.[mesh]?.primitives ?? []) {
      const positions = readAccessor(gltf, bin, primitive.attributes.POSITION);
      const normals = primitive.attributes.NORMAL !== undefined
        ? readAccessor(gltf, bin, primitive.attributes.NORMAL)
        : null;
      const uvs = primitive.attributes.TEXCOORD_0 !== undefined
        ? readAccessor(gltf, bin, primitive.attributes.TEXCOORD_0)
        : null;
      const cloth = primitive.attributes.TEXCOORD_2 !== undefined
        ? readAccessor(gltf, bin, primitive.attributes.TEXCOORD_2)
        : null;
      const indices = primitive.indices !== undefined
        ? readAccessor(gltf, bin, primitive.indices).map((row) => row[0])
        : positions.map((_, i) => i);
      const material = gltf.materials?.[primitive.material ?? -1]?.name
        ?? `#${primitive.material ?? "none"}`;
      for (let t = 0; t + 2 < indices.length; t += 3) {
        const corner = [indices[t], indices[t + 1], indices[t + 2]];
        triangles.push({
          cloth: cloth ? (corner.map((v) => cloth[v] as Vec2) as [Vec2, Vec2, Vec2]) : null,
          material,
          mesh: gltf.meshes?.[mesh]?.name ?? `#${mesh}`,
          normal: normals
            ? (corner.map((v) => transformDirection(matrix, normals[v] as Vec3)) as [Vec3, Vec3, Vec3])
            : null,
          position: corner.map((v) => transformPoint(matrix, positions[v] as Vec3)) as [Vec3, Vec3, Vec3],
          uv: uvs ? (corner.map((v) => uvs[v] as Vec2) as [Vec2, Vec2, Vec2]) : null,
        });
      }
    }
  }
  return triangles;
}
