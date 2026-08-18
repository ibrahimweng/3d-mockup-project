import type { ToolcraftAppComposition } from "@/toolcraft/runtime/react";

import { appSchema } from "./app-schema";
import { mockupExportRenderer } from "./export-renderer";
import { MockupPreview } from "./preview";
import { rendererPipeline } from "./render/pipeline";

/** Output size when the workspace is unbounded, matching the finite default. */
const INFINITE_SCENE = { height: 1350, width: 1080 };

export const appComposition: ToolcraftAppComposition = {
  canvasContent: <MockupPreview />,
  exportRenderer: mockupExportRenderer,
  // The product renderer draws the device itself; the runtime's generic image
  // preview would otherwise show the raw screenshot on top of the render.
  renderDefaultCanvasMedia: false,
  rendererPipelineRegistration: rendererPipeline,
  schema: appSchema,
  // Required in Infinity mode: the runtime resolves the product scene frame
  // from this. Without it the frame reports `unavailable`, the preview never
  // learns its size, and the camera keeps a 1:1 aspect — which renders a tall
  // phone as a square.
  sceneBoundsProvider: () => [
    {
      height: INFINITE_SCENE.height,
      width: INFINITE_SCENE.width,
      x: -INFINITE_SCENE.width / 2,
      y: -INFINITE_SCENE.height / 2,
    },
  ],
};
