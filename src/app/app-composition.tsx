import type { ToolcraftAppComposition } from "@/toolcraft/runtime/react";

import { appSchema } from "./app-schema";
import { mockupExportRenderer } from "./export-renderer";
import { MockupPreview } from "./preview";
import { rendererPipeline } from "./render/pipeline";
import { getMockupSceneRect } from "./scene-bounds";

export const appComposition: ToolcraftAppComposition = {
  canvasContent: <MockupPreview />,
  exportRenderer: mockupExportRenderer,
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
