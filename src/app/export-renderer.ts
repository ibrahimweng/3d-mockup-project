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
/**
 * One renderer, kept between frames.
 *
 * A still is one frame, so building a renderer, loading the model, convolving
 * the environment and throwing it all away again cost nothing anybody noticed.
 * A video is a hundred and eighty frames of the same scene, and paying that
 * per frame meant reloading the HDR environment for every one — about seven
 * seconds each, so a six-second loop never finished at all.
 *
 * Holding one renderer makes the model and environment caches inside it do
 * their job across the whole export: `update` rebuilds only when the device
 * changes and reapplies live settings only when those change, which is exactly
 * what varies between frames of an animation and what does not. It is rebuilt
 * only when multisampling has to change, because that is fixed when the
 * context is created; `setSize` handles every other size change.
 *
 * Exactly one is alive at a time, and it outlives the export that made it so
 * the next one starts warm.
 */
let exportRenderer:
  | {
      antialias: boolean;
      canvas: HTMLCanvasElement;
      /** Which device the held scene is of, so a frame knows whether to wait. */
      device: string | null;
      renderer: RasterRenderer;
    }
  | null = null;

function acquireExportRenderer(
  backingWidth: number,
  backingHeight: number,
): {
  canvas: HTMLCanvasElement;
  device: string | null;
  renderer: RasterRenderer;
  } {
  // Multisampling on everything the machine can hold it for. An export is
  // looked at closely, so the cost is worth paying — up to the point where
  // paying it is why nothing comes out at all.
  //
  // A multisample buffer is one allocation per sample: the 8K export is 6554
  // by 8192, which is already exactly this platform's maximum renderbuffer
  // size, and four samples of it is about eight hundred megabytes. It did not
  // finish in ten minutes. Past four thousand pixels there is very little for
  // multisampling to do anyway — an edge is already resolved by that many
  // pixels across the frame — so the samples are what gives way, not the
  // resolution the user asked for.
  const antialias = backingWidth * backingHeight <= 4096 * 4096;
  if (exportRenderer && exportRenderer.antialias === antialias) {
    return exportRenderer;
  }

  exportRenderer?.renderer.dispose();
  const canvas = document.createElement("canvas");
  canvas.width = backingWidth;
  canvas.height = backingHeight;
  exportRenderer = {
    antialias,
    canvas,
    device: null,
    renderer: new RasterRenderer(canvas, {
      antialias,
      // Twice the depth map. The preview redraws on every drag and has to hold
      // a frame rate; this is drawn once and looked at closely.
      shadowDetail: 2,
    }),
  };
  return exportRenderer;
}

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

    const held = acquireExportRenderer(
      Math.round(width * ratio),
      Math.round(height * ratio),
    );
    const { canvas, renderer } = held;
    {
      /**
       * Wait for a scene, but only when there is one being built.
       *
       * `update` announces readiness through the callback only when it
       * actually builds, and returns early once the device it holds is the
       * device asked for. Awaiting the callback unconditionally therefore
       * waits forever from the second frame onwards — which is every frame of
       * a video after the first. What decides it is whether the device
       * changed, and the cache is what knows that.
       */
      if (held.device === settings.device) {
        await renderer.update(settings, () => undefined);
      } else {
        await new Promise<void>((resolve) => {
          void renderer.update(settings, resolve);
        });
        held.device = settings.device;
      }

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
    }
  },
};
