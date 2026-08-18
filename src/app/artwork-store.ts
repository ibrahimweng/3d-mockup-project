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
const artworkUrlsByAssetId = new Map<string, string>();

export function publishArtworkUrl(assetId: string, url: string): void {
  artworkUrlsByAssetId.set(assetId, url);
}

export function forgetArtworkUrl(assetId: string): void {
  artworkUrlsByAssetId.delete(assetId);
}

export async function getExportArtworkImage(
  assetId: string,
): Promise<HTMLImageElement | null> {
  const url = artworkUrlsByAssetId.get(assetId);
  if (!url) return null;

  const image = new Image();
  image.crossOrigin = "anonymous";
  image.src = url;
  try {
    await image.decode();
    return image;
  } catch {
    return null;
  }
}
