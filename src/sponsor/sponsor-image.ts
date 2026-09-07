/**
 * The sponsor's logo: what is accepted, and why so little is.
 *
 * The image is stored by us and served from our own domain. That is the whole
 * privacy position of this feature in one sentence: a card pointed at a
 * sponsor's own server would hand that sponsor the IP address and the browser
 * of every person who opens the studio, whether or not they ever looked at it.
 * Nobody has to be told about a request that is never made.
 *
 * Serving other people's files from your own origin is also how a site gets
 * used against itself, so the checks here are deliberately narrow.
 *
 * SVG is refused. It is a document, not a picture: it can carry script, and a
 * script served from this origin is a script with this origin's permissions.
 * There is no way to sanitise one that is worth trusting a stranger's upload
 * to, and a logo is a raster in every ad slot anyone has ever sold.
 *
 * GIF is refused too, for a smaller reason. An animated corner beside a live 3D
 * render competes with the thing somebody came here to look at.
 *
 * The declared type is checked against the first few bytes rather than
 * believed. Only the operator can upload, so this is not the front line, but a
 * file that says `image/png` and begins `<!doctype html` becomes a page on this
 * domain the moment it is served back, and one `if` is cheaper than that.
 */

export type SponsorImage = {
  /** The bytes, base64, exactly as they are stored and served. */
  readonly base64: string;
  readonly byteLength: number;
  /** First eight hex characters of the SHA-256, enough to name a version. */
  readonly digest: string;
  readonly mediaType: string;
};

export type SponsorImageRejection =
  | "empty"
  | "not-an-image"
  | "too-large"
  | "type-mismatch"
  | "unsupported-type";

/**
 * Small, because the card is small.
 *
 * 200 kilobytes is many times what a 240 by 64 logo needs and still leaves the
 * whole record well inside the one megabyte a request to the store may carry.
 */
export const maxImageBytes = 200 * 1_024;

const signatures: Readonly<
  Record<string, (bytes: Uint8Array<ArrayBuffer>) => boolean>
> = {
  "image/jpeg": (bytes) =>
    bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  "image/png": (bytes) =>
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a,
  "image/webp": (bytes) =>
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP",
};

export const supportedImageTypes = Object.keys(signatures);

export function describeImageRejection(reason: SponsorImageRejection): string {
  switch (reason) {
    case "empty":
      return "Drop or paste the sponsor's logo first.";
    case "not-an-image":
      return "That is not an image file.";
    case "too-large":
      return `Keep the image under ${Math.round(maxImageBytes / 1_024)} KB.`;
    case "type-mismatch":
      return "That file does not match the kind of image it claims to be.";
    case "unsupported-type":
      return "Use a PNG, a JPEG or a WebP.";
  }
}

export function decodeBase64(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  // Backed by a plain `ArrayBuffer` rather than whatever the runtime would pick,
  // because both callers hand the result to a web API that will not take a view
  // over a buffer that might be shared.
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function digestOf(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)]
    .slice(0, 4)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

const dataUrlPattern = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/u;

export type SponsorImageReading =
  | { readonly image: SponsorImage; readonly ok: true }
  | { readonly ok: false; readonly reason: SponsorImageRejection };

/**
 * One `data:` URL, as the admin page produces it from a dropped file, checked
 * from the outside in: the shape of the string, then the size, then whether the
 * bytes are what the string said they were.
 */
export async function readSponsorImage(
  value: unknown,
): Promise<SponsorImageReading> {
  if (typeof value !== "string" || value === "") {
    return { ok: false, reason: "empty" };
  }

  const match = dataUrlPattern.exec(value);
  if (!match) return { ok: false, reason: "not-an-image" };

  const [, mediaType = "", base64 = ""] = match;
  if (!(mediaType in signatures)) {
    return { ok: false, reason: "unsupported-type" };
  }

  // Checked before decoding, so an oversized upload is refused without ever
  // being held in memory in two forms at once.
  if (base64.length > Math.ceil(maxImageBytes / 3) * 4) {
    return { ok: false, reason: "too-large" };
  }

  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = decodeBase64(base64);
  } catch {
    return { ok: false, reason: "not-an-image" };
  }

  if (bytes.byteLength === 0) return { ok: false, reason: "empty" };
  if (bytes.byteLength > maxImageBytes) return { ok: false, reason: "too-large" };
  if (!signatures[mediaType]?.(bytes)) {
    return { ok: false, reason: "type-mismatch" };
  }

  return {
    ok: true,
    image: {
      base64,
      byteLength: bytes.byteLength,
      digest: await digestOf(bytes),
      mediaType,
    },
  };
}
