import { CircleHelp, Command } from "lucide-react";

import type { ToolcraftAppComposition } from "@/toolcraft/runtime/react";

import { appSchema } from "./app-schema";
import { mockupExportRenderer } from "./export-renderer";
import { MockupPreview } from "./preview";
import { GuideRuntime } from "./guide/guide-runtime";
import { guideSignal } from "./guide/open-signal";
import { QuickActionDialog } from "./quick-actions/quick-action-dialog";
import { openQuickActions } from "./quick-actions/quick-action-open";
import { rendererPipeline } from "./render/pipeline";
import { getMockupSceneRect } from "./scene-bounds";

export const appComposition: ToolcraftAppComposition = {
  // The palette renders into a portal, so where it is mounted decides only
  // that it is always alive to hear its shortcut — not where it appears.
  canvasContent: (
    <>
      <MockupPreview />
      <QuickActionDialog />
      <GuideRuntime />
    </>
  ),
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
  // The shortcut is the fast way in and the button is the only way anyone
  // finds out the shortcut exists.
  toolbarActions: [
    {
      icon: <Command />,
      id: "quick-actions",
      label: "Quick actions",
      onSelect: openQuickActions,
    },
    {
      icon: <CircleHelp />,
      id: "guide",
      label: "How to use this",
      onSelect: () => guideSignal.open(),
    },
  ],
};
