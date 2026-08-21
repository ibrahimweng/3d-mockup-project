/**
 * A short stable name for a run of bytes or a string.
 *
 * FNV-1a. Not a checksum anybody has to trust against an adversary — it names
 * a frame so two of them can be told apart, and it is here rather than written
 * twice because the pixels the renderer samples and the settings the preview
 * reports have to be named the same way to be compared the same way.
 */
export function fingerprint(source: Uint8Array | string): string {
  let hash = 0x811c9dc5;
  if (typeof source === "string") {
    for (let index = 0; index < source.length; index += 1) {
      hash = Math.imul(hash ^ source.charCodeAt(index), 0x01000193);
    }
  } else {
    for (const byte of source) {
      hash = Math.imul(hash ^ byte, 0x01000193);
    }
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
