import type {
  ToolcraftImageAsset,
  ToolcraftProductExportRenderer,
} from "@/toolcraft/runtime";
import { readToolcraftOrientationPose } from "@/toolcraft/runtime/react";
import { getExportArtworkImage } from "./artwork-store";
import { readDeviceDefinition } from "./product-domain";
import { RasterRenderer } from "./render/raster-renderer";
import { createScreenTexture } from "./render/screen-texture";
import { readRasterSettings, readScreenTransform } from "./render/settings";

/**
 * Product export frame.
 *
 * Export builds its own renderer on its own canvas: WebGL resources are not
 * portable across contexts, and the preview's backing size is the viewport's
 * rather than the artifact's. Because nothing accumulates, one draw at the
 * requested size is the finished image — the same frame the preview shows.
 *
 * The frame arrives in CSS units with a separate pixel ratio, and the runtime
 * has already scaled the destination context by that ratio before calling
 * here. Rendering at the CSS size and letting `drawImage` stretch the result
 * is therefore an upscale: a 2x export would carry half the detail it claims.
 * The ratio is applied to the render instead, so every pixel the artifact
 * contains is one the renderer actually drew.
 */
export const mockupExportRenderer: ToolcraftProductExportRenderer = {
  baseFileName: "mockup",
  renderFrame: async ({ context, frame, pixelRatio, state }) => {
    const values = state.values as Record<string, unknown>;
    const settings = readRasterSettings(values);
    const pose = readToolcraftOrientationPose(values["camera.orbit"]);

    const width = Math.round(frame.width);
    const height = Math.round(frame.height);
    // A ratio below one would throw detail away for no reason; the export is
    // not a place to economise.
    const ratio = Math.max(1, Number.isFinite(pixelRatio) ? pixelRatio : 1);

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);

    // Multisampling always, whatever the preview decided: an export is looked
    // at closely and is drawn once, so the cost does not matter here.
    const renderer = new RasterRenderer(canvas, { antialias: true });
    try {
      await new Promise<void>((resolve) => {
        void renderer.update(settings, resolve);
      });

      const artworkAsset = state.mediaAssets
        .filter(
          (asset): asset is ToolcraftImageAsset =>
            asset.assetKind === "image" &&
            asset.sourceTarget === "artwork.image",
        )
        .at(-1);

      if (artworkAsset) {
        const image = await getExportArtworkImage(artworkAsset.id);
        if (image) {
          const texture = createScreenTexture(
            image,
            readDeviceDefinition(settings.device),
            artworkAsset.transform,
            renderer.maxAnisotropy,
          );
          renderer.setArtwork(texture, readScreenTransform(values));
        }
      }

      renderer.setSize(width, height, ratio);
      renderer.setPose(pose);
      renderer.render();

      context.drawImage(canvas, frame.x, frame.y, frame.width, frame.height);
    } finally {
      renderer.dispose();
    }
  },
};
