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
    const settings = readRasterSettings(values, state.canvas.mode);
    const pose = readToolcraftOrientationPose(values["camera.orbit"]);

    const width = Math.round(frame.width);
    const height = Math.round(frame.height);
    // A ratio below one would throw detail away for no reason; the export is
    // not a place to economise.
    const ratio = Math.max(1, Number.isFinite(pixelRatio) ? pixelRatio : 1);

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);

    // Multisampling on everything the machine can hold it for. An export is
    // looked at closely and drawn once, so the cost is worth paying — up to the
    // point where paying it is why nothing comes out at all.
    //
    // A multisample buffer is one allocation per sample: the 8K export is 6554
    // by 8192, which is already exactly this platform's maximum renderbuffer
    // size, and four samples of it is about eight hundred megabytes. It did not
    // finish in ten minutes. Past four thousand pixels there is very little for
    // multisampling to do anyway — an edge is already resolved by that many
    // pixels across the frame — so the samples are what gives way, not the
    // resolution the user asked for.
    const pixels = canvas.width * canvas.height;
    const renderer = new RasterRenderer(canvas, {
      antialias: pixels <= 4096 * 4096,
      // Twice the depth map. The preview redraws on every drag and has to hold
      // a frame rate; this is drawn once, at four thousand pixels, and looked
      // at closely.
      shadowDetail: 2,
    });
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

      const image = artworkAsset
        ? await getExportArtworkImage(artworkAsset.id)
        : null;
      // Always, even with nothing to show. Skipping the call left the model's
      // own wallpaper glowing on the display — which the preview had already
      // blanked, because it calls this on every update whether or not there is
      // an image. An export that does not match the preview is not an export
      // of what the user was looking at.
      renderer.setArtwork(
        image && artworkAsset
          ? createScreenTexture(
              image,
              readDeviceDefinition(settings.device),
              artworkAsset.transform,
              renderer.maxAnisotropy,
            )
          : null,
        readScreenTransform(values),
      );

      renderer.setSize(width, height, ratio);
      renderer.setPose(pose);
      renderer.render();

      context.drawImage(canvas, frame.x, frame.y, frame.width, frame.height);
    } finally {
      renderer.dispose();
    }
  },
};
