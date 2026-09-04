import type * as THREE from "three";

import type { ToolcraftProductExportRenderer } from "@/toolcraft/runtime";
import { readToolcraftOrientationPose } from "@/toolcraft/runtime/react";
import { getExportArtworkFrame } from "./artwork-store";
import { readZoneAssets } from "./artwork-slots";
import { readDeviceDefinition, type ArtworkZoneId } from "./product-domain";
import { cutExport, planExportGrid } from "./render/export-grid";
import { RasterRenderer } from "./render/raster-renderer";
import { createScreenPainter } from "./render/screen-texture";
import {
  readArtworkBackground,
  readRasterSettings,
  readScreenTransform,
} from "./render/settings";

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
 * So the render is sized in the artifact's own pixels, and blitted into it in
 * them, so that every pixel the artifact contains is one the renderer actually
 * drew and no pixel of it is resampled on the way in.
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
  picture: Readonly<{ height: number; width: number }>,
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
  //
  // Read off the whole picture rather than off a tile: what decides this is
  // how closely the export will be looked at, and that is a property of the
  // picture. Sizing it off a tile would switch multisampling back on for an
  // 8K export purely because it is now drawn in quarters, which is the cost
  // this avoids arriving by the back door.
  const antialias = picture.width * picture.height <= 4096 * 4096;
  if (exportRenderer && exportRenderer.antialias === antialias) {
    return exportRenderer;
  }

  exportRenderer?.renderer.dispose();
  // Sized by the first tile rather than here: how big a canvas this context
  // will really give is the question `planExportGrid` is about to ask it, and
  // allocating the whole frame first is the allocation that does not fit.
  const canvas = document.createElement("canvas");
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
  renderFrame: async ({ context, state, timeSeconds }) => {
    const values = state.values as Record<string, unknown>;
    const settings = readRasterSettings(values, state.canvas.mode);
    const pose = readToolcraftOrientationPose(values["camera.orbit"]);

    /**
     * The picture to draw, taken off the artifact rather than worked out again.
     *
     * The runtime has already scaled and translated this context so the frame
     * covers the canvas exactly, which makes the canvas the one true statement
     * of how many pixels the export is. Recomputing it from the frame and the
     * ratio agreed to within a pixel most of the time and not always -- the
     * artifact rounds its width up where this rounded to nearest, and a video
     * rounds both edges to even -- and a pixel of disagreement is a line of
     * bare background down an edge of the file.
     */
    const picture = {
      height: Math.max(1, context.canvas.height),
      width: Math.max(1, context.canvas.width),
    };
    const held = acquireExportRenderer(picture);
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

      const device = readDeviceDefinition(settings.device);
      const background = readArtworkBackground(
        values,
        device.artworkSurface === "print",
      );
      // At this frame's own moment, so a design that moves is exported the
      // way it was previewed rather than wherever its decoder had got to.
      const decoded = await Promise.all(
        [...readZoneAssets(state.mediaAssets)].map(
          async ([zone, asset]) =>
            [zone, await getExportArtworkFrame(asset.id, timeSeconds), asset] as const,
        ),
      );
      const textures = new Map<ArtworkZoneId, THREE.Texture | null>();
      for (const [zone, shot, asset] of decoded) {
        if (!shot) continue;
        const painter = createScreenPainter(
          shot,
          device,
          asset.transform,
          renderer.maxAnisotropy,
          background,
        );
        if (!painter) continue;
        painter.paint(shot.frame);
        textures.set(zone, painter.texture);
      }
      // Always, even with nothing to show. Skipping the call left the model's
      // own wallpaper glowing on the display — which the preview had already
      // blanked, because it calls this on every update whether or not there is
      // an image. An export that does not match the preview is not an export
      // of what the user was looking at.
      renderer.setArtwork(textures, readScreenTransform(values));

      renderer.setPose(pose);

      /**
       * Drawn in pieces, because a browser will not allocate the whole of it.
       *
       * A canvas backing store is capped at 33.6 million pixels, and going
       * over is not an error: the store is quietly allocated smaller and the
       * `width` and `height` attributes go on reading back the numbers they
       * were assigned. An 8K portrait export asks for 53.7 million, so the
       * file was 79 per cent of a picture in the top left corner with two
       * bands of bare background down the right and along the bottom -- and
       * the picture inside them carried 6.4K of detail under an 8K name.
       *
       * So the frame is cut into pieces each of which the context will really
       * allocate, and every piece is drawn at its own full resolution. 8K is
       * 8K again, and it is 8K on a machine that cannot hold an 8K frame.
       */
      const grid = planExportGrid(picture, (want) => {
        renderer.setSize(want.width, want.height, 1);
        return renderer.drawingBuffer;
      });
      // Raw device pixels for the blit. The runtime scaled and translated the
      // context into CSS units for the frame as a whole, which is the right
      // thing for one `drawImage` of the lot and the wrong thing for a grid:
      // a tile edge at a fractional CSS coordinate is resampled, and every
      // resampled edge is a seam down the middle of the export.
      context.save();
      context.setTransform(1, 0, 0, 1, 0, 0);
      for (const tile of cutExport(picture, grid)) {
        renderer.renderTile(tile);
        context.drawImage(canvas, tile.x, tile.y, tile.width, tile.height);
      }
      context.restore();
    }
  },
};
