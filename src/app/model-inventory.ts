import { closeSync, openSync, readSync } from "node:fs";

/**
 * What a GLB actually contains, read straight out of the file.
 *
 * The catalog names materials and nodes as plain strings — `"Material.004"`
 * for a screen, and for the phone a list of fifteen-character export hashes
 * like `"iAKEWdNafBldSCV"`. Nothing checks those against the models, so a
 * re-export that renames one is silent: the finish paints nothing, or the
 * screenshot stops appearing, and every test still passes because the string
 * is still a string.
 *
 * A GLB is a container with a JSON chunk at the front listing every material
 * and node, so no library is needed to look. Only the header and that first
 * chunk are read — the geometry behind it can be eighteen megabytes, and this
 * has no reason to load it.
 */
export type ModelInventory = {
  readonly materials: readonly string[];
  readonly meshes: readonly string[];
  readonly nodes: readonly string[];
  /** One file can carry several devices as sibling scenes. */
  readonly scenes: readonly string[];
};

const glbMagic = 0x46546c67;
const jsonChunkType = 0x4e4f534a;
const headerBytes = 12;
const chunkHeaderBytes = 8;

function readExact(handle: number, length: number, position: number): Buffer {
  const buffer = Buffer.alloc(length);
  const read = readSync(handle, buffer, 0, length, position);
  if (read !== length) {
    throw new Error(`Expected ${length} bytes at ${position}, read ${read}.`);
  }
  return buffer;
}

export function readModelInventory(filePath: string): ModelInventory {
  const handle = openSync(filePath, "r");
  try {
    const header = readExact(handle, headerBytes, 0);
    if (header.readUInt32LE(0) !== glbMagic) {
      throw new Error(`${filePath} is not a GLB: bad magic.`);
    }

    const chunkHeader = readExact(handle, chunkHeaderBytes, headerBytes);
    const chunkLength = chunkHeader.readUInt32LE(0);
    if (chunkHeader.readUInt32LE(4) !== jsonChunkType) {
      throw new Error(`${filePath} does not start with a JSON chunk.`);
    }

    const json = readExact(handle, chunkLength, headerBytes + chunkHeaderBytes);
    const parsed: unknown = JSON.parse(json.toString("utf8"));
    const document = (typeof parsed === "object" && parsed !== null ? parsed : {}) as Record<
      string,
      unknown
    >;

    const names = (key: string): readonly string[] => {
      const entries = document[key];
      if (!Array.isArray(entries)) return [];
      return entries
        .map((entry) => (entry as { name?: unknown } | null)?.name)
        .filter((name): name is string => typeof name === "string");
    };

    return {
      materials: names("materials"),
      meshes: names("meshes"),
      nodes: names("nodes"),
      scenes: names("scenes"),
    };
  } finally {
    closeSync(handle);
  }
}
