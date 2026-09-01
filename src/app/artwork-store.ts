import {
  isAnimatedMimeType,
  openAnimatedArtwork,
  type AnimatedArtwork,
  type ArtworkFrame,
} from "./render/animated-artwork";

/**
 * Bridge between the preview surface and the export renderer.
 *
 * The runtime exposes media through a React hook, but `exportRenderer` is a
 * plain async callback outside the component tree and cannot call one. The
 * preview publishes the presentation URL for each artwork asset here as it
 * resolves, and export re-decodes from that URL into its own image.
 *
 * Known limitation: this is populated by the preview. Exporting an artwork the
 * preview has never resolved would render the object with no mark on it. In
 * practice the preview is the canvas, so it always resolves first, but this is
 * a real ordering dependency rather than a guarantee.
 */
type PublishedArtwork = { mimeType: string; url: string };

const artworkByAssetId = new Map<string, PublishedArtwork>();

/**
 * Export's own copy of each design that moves.
 *
 * Deliberately not shared with the preview's. They are seeked independently --
 * the preview to whatever is on screen, export to the frame it is writing --
 * and one source cannot be in two places at once, so sharing would have each
 * one dragging the other off its own time. A decoder is cheap next to being
 * wrong: about twenty milliseconds to open, against an export that renders
 * every frame of a six second animation.
 */
const movingByAssetId = new Map<string, Promise<AnimatedArtwork | null>>();

export function publishArtworkUrl(
  assetId: string,
  url: string,
  mimeType = "",
): void {
  artworkByAssetId.set(assetId, { mimeType, url });
}

export function forgetArtworkUrl(assetId: string): void {
  artworkByAssetId.delete(assetId);
  const opened = movingByAssetId.get(assetId);
  movingByAssetId.delete(assetId);
  void opened?.then((source) => source?.dispose());
}

/** The design for one moment, still or moving, ready to be drawn. */
export type ExportArtworkFrame = {
  frame: ArtworkFrame;
  height: number;
  width: number;
};

async function loadStill(url: string): Promise<ExportArtworkFrame | null> {
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.src = url;
  try {
    await image.decode();
  } catch {
    return null;
  }
  return {
    frame: image,
    height: Math.max(1, image.naturalHeight || image.height),
    width: Math.max(1, image.naturalWidth || image.width),
  };
}

/**
 * The frame this design shows at this point in the export.
 *
 * A still ignores the time and hands back the same picture for every frame,
 * which is what a still is. A GIF or a video is asked for the frame at that
 * moment and then waited for -- the one place in the product that waits for a
 * decode, because an export writes frames in order and a frame that arrives
 * late arrives in the wrong one.
 */
export async function getExportArtworkFrame(
  assetId: string,
  timeSeconds: number,
): Promise<ExportArtworkFrame | null> {
  const published = artworkByAssetId.get(assetId);
  if (!published) return null;

  if (!isAnimatedMimeType(published.mimeType)) return loadStill(published.url);

  if (!movingByAssetId.has(assetId)) {
    movingByAssetId.set(
      assetId,
      openAnimatedArtwork(published.url, published.mimeType, () => undefined),
    );
  }
  const source = await movingByAssetId.get(assetId);
  // A GIF this browser cannot take apart still has a first frame, and an
  // export of that is a great deal better than an export of nothing.
  if (!source) return loadStill(published.url);

  // Not playing: an export is a series of exact moments, never a performance.
  source.frameAt(timeSeconds, false);
  await source.settle();
  const frame = source.frameAt(timeSeconds, false);
  if (!frame) return loadStill(published.url);
  return { frame, height: source.height, width: source.width };
}
