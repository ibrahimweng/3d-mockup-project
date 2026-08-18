import type { ToolcraftProductExportRenderer } from "@/toolcraft/runtime";
import { readToolcraftOrientationPose } from "@/toolcraft/runtime/react";
import * as THREE from "three";

import { getExportArtworkImage } from "./artwork-store";
import { RasterRenderer } from "./render/raster-renderer";
import { readRasterSettings, readScreenTransform } from "./render/settings";

/**
 * Product export frame.
 *
 * Export builds its own renderer on its own canvas: WebGL resources are not
 * portable across contexts, and the preview's backing size is the viewport's
 * rather than the artifact's. Because nothing accumulates, one draw at the
 * requested size is the finished image — the same frame the preview shows.
 */
export const plinthExportRenderer: ToolcraftProductExportRenderer = {
  baseFileName: "plinth",
  renderFrame: async ({ context, frame, state }) => {
    const values = state.values as Record<string, unknown>;
    const settings = readRasterSettings(values);
    const pose = readToolcraftOrientationPose(values["camera.orbit"]);

    const width = Math.round(frame.width);
    const height = Math.round(frame.height);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const renderer = new RasterRenderer(canvas);
    try {
      await new Promise<void>((resolve) => {
        void renderer.update(settings, resolve);
      });

      const artworkAsset = state.mediaAssets
        .filter(
          (asset) =>
            asset.assetKind === "image" &&
            asset.sourceTarget === "artwork.image",
        )
        .at(-1);

      if (artworkAsset) {
        const image = await getExportArtworkImage(artworkAsset.id);
        if (image) {
          const texture = new THREE.Texture(image);
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.flipY = false;
          texture.needsUpdate = true;
          renderer.setArtwork(texture, readScreenTransform(values));
        }
      }

      renderer.setSize(width, height, 1);
      renderer.setPose(pose);
      renderer.render();

      context.drawImage(canvas, frame.x, frame.y, frame.width, frame.height);
    } finally {
      renderer.dispose();
    }
  },
};
