import { CircleHelp, Command } from "lucide-react";

import type { ToolcraftAppComposition } from "@/toolcraft/runtime/react";

import { appSchema } from "./app-schema";
import { CameraFrameLock } from "./camera-frame-lock";
import { mockupExportRenderer } from "./export-renderer";
import { MockupPreview } from "./preview";
import { GuideRuntime } from "./guide/guide-runtime";
import { guideSignal } from "./guide/open-signal";
import { QuickActionDialog } from "./quick-actions/quick-action-dialog";
import { SceneReport } from "./render/scene-report";
import { SignupCard } from "./signup/signup-card";
import { SponsorBox } from "./sponsor/sponsor-box";
import { openQuickActions } from "./quick-actions/quick-action-open";
import { readDeviceDefinition, readDeviceId } from "./product-domain";
import { rendererPipeline } from "./render/pipeline";
import { getMockupSceneRect } from "./scene-bounds";
import { downloadArtworkTemplates } from "./template-download";
import { MotionPicker } from "./motion-picker";
import { getMotionPresetCommand } from "./apply-motion-preset";
import { readMotionPresetId } from "./motion-presets";

export const appComposition: ToolcraftAppComposition = {
  // The palette renders into a portal, so where it is mounted decides only
  // that it is always alive to hear its shortcut — not where it appears.
  canvasContent: (
    <>
      <MockupPreview />
      <CameraFrameLock />
      <SceneReport />
      <QuickActionDialog />
      <GuideRuntime />
      <SignupCard />
      <SponsorBox />
    </>
  ),
  // Keyed by control type: `motionPicker` is a type the runtime does not
  // render, so this is the only control it reaches.
  controlRenderers: { motionPicker: MotionPicker },
  exportRenderer: mockupExportRenderer,
  /**
   * The two actions this product owns that the runtime does not.
   *
   * Export PNG and Export Video are typed export roles the runtime runs
   * itself; anything else reaching here is the product's. Both of these are
   * synchronous — one follows a link and one dispatches a command — so there is
   * nothing to report progress on and nothing to await.
   */
  onPanelAction: ({ action, dispatch, state }) => {
    if (action.value === "download-templates") {
      const id = readDeviceId((state.values as Record<string, unknown>)["device.model"]);
      downloadArtworkTemplates(readDeviceDefinition(id), id);
      return undefined;
    }

    if (action.value === "apply-motion") {
      const command = getMotionPresetCommand(
        state,
        readMotionPresetId((state.values as Record<string, unknown>)["motion.preset"]),
      );

      // Null means there is nothing to do — None chosen with none of its tracks
      // keyed — and dispatching a command that writes no tracks would still
      // cost a place in the history for a press that changed nothing.
      if (command) {
        dispatch(command);
        // A move that has just been laid down is a move somebody wants to see,
        // and the timeline opens paused because an empty loop has nothing to
        // show. Skipped when the preset was None: there is nothing to play.
        if (readMotionPresetId((state.values as Record<string, unknown>)["motion.preset"]) !== "none") {
          dispatch({ isPlaying: true, type: "timeline.setPlaying" });
        }
      }

      return undefined;
    }

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
