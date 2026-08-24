import type { ToolcraftAppComposition } from "@/toolcraft/runtime/react";

import { appSchema } from "./app-schema";
import { createMockupEmbedBundle, downloadEmbedBundle } from "./embed-bundle";
import { mockupExportRenderer } from "./export-renderer";
import { MockupPreview } from "./preview";
import { rendererPipeline } from "./render/pipeline";
import { getMockupSceneRect } from "./scene-bounds";

export const appComposition: ToolcraftAppComposition = {
  canvasContent: <MockupPreview />,
  exportRenderer: mockupExportRenderer,
  /**
   * The one action the runtime does not own.
   *
   * Export PNG and Export Video carry roles, so the runtime writes those
   * itself. The embed has no role, so it arrives here instead — which is the
   * whole reason it can exist without the framework learning what a folder of
   * frames is.
   */
  onPanelAction: async ({ action, reportProgress, state }) => {
    if (action.value !== "export-embed") return undefined;

    const bundle = await createMockupEmbedBundle({
      onProgress: (completed, total) => reportProgress?.(completed / total),
      state,
    });

    downloadEmbedBundle(bundle);
    return undefined;
  },
  // The product renderer draws the device itself; the runtime's generic image
  // preview would otherwise show the raw screenshot on top of the render.
  renderDefaultCanvasMedia: false,
  rendererPipelineRegistration: rendererPipeline,
  schema: appSchema,
  // Required in Infinity mode: the runtime resolves the product scene frame
  // from this, for the preview and for the crop an export is cut to. Without
  // it the frame reports `unavailable`, the preview never learns its size, and
  // the camera keeps a 1:1 aspect — which renders a tall phone as a square.
  sceneBoundsProvider: ({ state }) => [getMockupSceneRect(state)],
};
