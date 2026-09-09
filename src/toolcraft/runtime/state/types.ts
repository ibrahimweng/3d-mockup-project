import type {
  ToolcraftCanvasSize,
  ResolvedToolcraftAppSchema,
} from "../schema/types";
import type { ToolcraftModelAssetRecord } from "../model-import/model-import-types";
import type { ToolcraftPanelSnapEdge } from "../contracts/types";

export type ToolcraftCommand =
  | {
      history?: ToolcraftHistoryMode;
      historyGroup?: string;
      label?: string;
      target: string;
      type: "controls.setValue";
      value: unknown;
    }
  | { type: "controls.apply" }
  | { type: "controls.reset" }
  | { label?: string; targets: string[]; type: "controls.resetTargets" }
  | { insertIndex?: number; layer?: ToolcraftLayerDraft; type: "layers.add" }
  | { layerId: string; type: "layers.delete" }
  | { layerIds: string[]; parentGroupId: string | null; type: "layers.moveToGroup" }
  | { layerId: string; type: "layers.select" }
  | { layerId: string; name: string; type: "layers.rename" }
  | { layerId: string; type: "layers.toggleCollapsed" }
  | { layerId: string; type: "layers.toggleVisibility" }
  | { layers: ToolcraftLayer[]; selectedLayerId?: string | null; type: "layers.reorder" }
  | { delta: ToolcraftPoint; type: "canvas.panBy" }
  | { offset: ToolcraftPoint; type: "canvas.setOffset" }
  | { size: ToolcraftCanvasSize; type: "canvas.setSize" }
  | {
      aspectRatio?: unknown;
      history?: ToolcraftHistoryMode;
      historyGroup?: string;
      label?: string;
      mode: ToolcraftCanvasState["mode"];
      size: ToolcraftCanvasSize;
      type: "canvas.applySettings";
    }
  | { type: "canvas.center" }
  | { type: "canvas.zoomIn" }
  | { type: "canvas.zoomOut" }
  | { type: "canvas.zoomReset" }
  | { offset: ToolcraftPoint; type: "canvas.setViewport"; zoom: number }
  | {
      offset: ToolcraftPanelState["offset"];
      panelId: ToolcraftPanelId;
      type: "panels.setOffset";
    }
  | {
      hidden: boolean;
      panelId: ToolcraftPanelId;
      type: "panels.setHidden";
    }
  | {
      panelId: ToolcraftPanelId;
      patch: ToolcraftPanelPatch;
      type: "panels.update";
    }
  | {
      collapsed: boolean;
      sectionId: string;
      type: "panels.setSectionCollapsed";
    }
  | { panelId: ToolcraftPanelId; type: "panels.resetOffset" }
  | {
      asset: ToolcraftMediaImportAsset;
      replaceExisting?: boolean;
      type: "media.import";
    }
  | {
      assets: readonly ToolcraftMediaAssetDraft[];
      replaceExisting?: boolean;
      type: "media.importBatch";
    }
  | {
      activeDocumentRef: string;
      analysis: ToolcraftModelAsset["analysis"];
      appliedRepairRecipeId: string;
      assetId: string;
      expectedActiveDocumentRef: string;
      expectedRepairPlanRef: string;
      expectedSourceBundleDigest: string;
      expectedTopologyProfile: ToolcraftModelAsset["topologyProfile"];
      repairedDocumentRef: string;
      type: "media.commitModelRepair";
    }
  | {
      asset: ToolcraftModelAsset;
      expectedSourceBundleDigest: string;
      expectedTopologyProfile: ToolcraftModelAsset["topologyProfile"];
      type: "media.hydrateModel";
    }
  | {
      asset: ToolcraftModelAsset;
      expectedPlaceholderRef: string;
      type: "media.hydrateDefaultModel";
    }
  | {
      assetId: string;
      error?: ToolcraftMediaResourceError;
      expectedResourceRef: string;
      lifecycle: "ready" | "unavailable";
      type: "media.setBinaryResourceState";
    }
  | {
      assetId: string;
      expectedActiveDocumentRef: string;
      expectedSourceBundleDigest: string;
      feedback: ToolcraftModelAsset["lastRepairError"] | null;
      type: "media.setModelRepairError";
    }
  | { mediaId: string; type: "media.delete" }
  | { mediaIds: string[]; type: "media.reorder" }
  | {
      mediaId: string;
      operation: ToolcraftMediaTransformOperation;
      type: "media.transform";
    }
  | { currentTimeSeconds: number; type: "timeline.setCurrentTime" }
  | { durationSeconds: number; type: "timeline.setDuration" }
  | { expanded: boolean; type: "timeline.setExpanded" }
  | { isPlaying: boolean; type: "timeline.setPlaying" }
  | { type: "timeline.toggleExpanded" }
  | { type: "timeline.togglePlayback" }
  | { type: "timeline.toggleLoop" }
  | {
      /** Add to the selection rather than replacing it, the way Shift-click does. */
      additive?: boolean;
      keyframeId: string | null;
      type: "timeline.selectKeyframe";
    }
  | { keyframeIds: readonly string[]; type: "timeline.setKeyframeSelection" }
  | { keyframeId: string; type: "timeline.deleteKeyframe" }
  | { type: "timeline.deleteSelectedKeyframes" }
  | { controlId: string; type: "timeline.deleteControlKeyframes" }
  | {
      controlId: string;
      controlLabel: string;
      timeSeconds?: number;
      type: "timeline.toggleControlKeyframes";
      value: unknown;
      valueLabel: string;
    }
  | {
      controlId: string;
      controlLabel: string;
      /**
       * The same two fields `controls.setValue` takes, and for the same reason.
       * A drag writes a keyframe on every animation frame it lasts, and without
       * a group each of those is its own undo entry: turning the camera for a
       * second would take sixty presses to take back. Merged, one gesture is
       * one entry, and undo returns the track to what it was before the drag.
       */
      history?: ToolcraftHistoryMode;
      historyGroup?: string;
      timeSeconds?: number;
      type: "timeline.upsertControlKeyframe";
      value: unknown;
      valueLabel: string;
    }
  | { keyframeId: string; timeSeconds: number; type: "timeline.moveKeyframe" }
  | {
      /**
       * The keyframe under the pointer. It lands exactly on `timeSeconds` and
       * every other selected keyframe shifts by the same amount, so a selection
       * keeps its own shape while it is dragged.
       */
      anchorKeyframeId: string;
      timeSeconds: number;
      type: "timeline.moveSelectedKeyframes";
    }
  | {
      keyframes: readonly ToolcraftTimelineClipboardKeyframe[];
      timeSeconds: number;
      type: "timeline.pasteKeyframes";
    }
  | { playbackRate: number; type: "timeline.setPlaybackRate" }
  | {
      easing: ToolcraftTimelineKeyframeEasing;
      keyframeId: string;
      /**
       * Apply to every selected keyframe rather than just this one, so a curve
       * can be set across a whole track in one go instead of one popover per
       * keyframe.
       */
      applyToSelection?: boolean;
      type: "timeline.changeKeyframeEasing";
    }
  | {
      /** The incoming handle. Null clears it, handing the segment back to its start. */
      controlPoints: ToolcraftTimelineBezierControlPoints | null;
      keyframeId: string;
      applyToSelection?: boolean;
      type: "timeline.changeKeyframeEaseIn";
    }
  | { type: "history.undo" }
  | { type: "history.redo" };

export const toolcraftRuntimeCommandTypes = [
  "controls.setValue",
  "controls.apply",
  "controls.reset",
  "controls.resetTargets",
  "layers.add",
  "layers.delete",
  "layers.moveToGroup",
  "layers.select",
  "layers.rename",
  "layers.toggleCollapsed",
  "layers.toggleVisibility",
  "layers.reorder",
  "canvas.panBy",
  "canvas.setOffset",
  "canvas.setSize",
  "canvas.applySettings",
  "canvas.center",
  "canvas.zoomIn",
  "canvas.zoomOut",
  "canvas.zoomReset",
  "canvas.setViewport",
  "panels.setOffset",
  "panels.setHidden",
  "panels.update",
  "panels.setSectionCollapsed",
  "panels.resetOffset",
  "media.import",
  "media.importBatch",
  "media.commitModelRepair",
  "media.hydrateDefaultModel",
  "media.hydrateModel",
  "media.setBinaryResourceState",
  "media.setModelRepairError",
  "media.delete",
  "media.reorder",
  "media.transform",
  "timeline.setCurrentTime",
  "timeline.setDuration",
  "timeline.setExpanded",
  "timeline.setPlaying",
  "timeline.toggleExpanded",
  "timeline.togglePlayback",
  "timeline.toggleLoop",
  "timeline.selectKeyframe",
  "timeline.setKeyframeSelection",
  "timeline.deleteKeyframe",
  "timeline.deleteSelectedKeyframes",
  "timeline.deleteControlKeyframes",
  "timeline.toggleControlKeyframes",
  "timeline.upsertControlKeyframe",
  "timeline.moveKeyframe",
  "timeline.moveSelectedKeyframes",
  "timeline.pasteKeyframes",
  "timeline.setPlaybackRate",
  "timeline.changeKeyframeEasing",
  "timeline.changeKeyframeEaseIn",
  "history.undo",
  "history.redo",
] as const satisfies readonly ToolcraftCommand["type"][];

export type ToolcraftPoint = {
  x: number;
  y: number;
};

export type ToolcraftSceneElementFrame = {
  position: ToolcraftPoint;
  size: ToolcraftCanvasSize;
};

export type ToolcraftCanvasState = {
  mode: "finite" | "infinite";
  offset: ToolcraftPoint;
  size: ToolcraftCanvasSize;
  zoom: number;
};

export type ToolcraftLayerKind = "group" | "layer";

export type ToolcraftLayer = {
  collapsed?: boolean;
  displayName?: string;
  id: string;
  kind?: ToolcraftLayerKind;
  name: string;
  parentGroupId?: string;
  visible: boolean;
};

export type ToolcraftLayerDraft = {
  collapsed?: boolean;
  displayName?: string;
  id?: string;
  kind?: ToolcraftLayerKind;
  name?: string;
  parentGroupId?: string;
  visible?: boolean;
};

export type ToolcraftMediaAssetBase<AssetKind extends "file" | "image" | "model"> = {
  assetKind: AssetKind;
  fileName: string;
  id: string;
  layerId: string;
  mimeType: string;
  sourceTarget?: string;
};

export type ToolcraftMediaResourceError = {
  code: string;
  message: string;
};

export type ToolcraftMediaResourceState =
  | { lifecycle: "ready" | "restoring"; resourceRef: string }
  | {
      error: ToolcraftMediaResourceError;
      lifecycle: "unavailable";
      resourceRef: string;
    };

type ToolcraftBinaryMediaAssetBase<AssetKind extends "file" | "image"> =
  ToolcraftMediaAssetBase<AssetKind> & ToolcraftMediaResourceState;

export type ToolcraftImageAsset = ToolcraftBinaryMediaAssetBase<"image"> & {
  position: ToolcraftPoint;
  size?: ToolcraftCanvasSize;
  transform?: ToolcraftMediaTransform;
};

export type ToolcraftFileAsset = ToolcraftBinaryMediaAssetBase<"file"> & {
  position: ToolcraftPoint;
};

export type ToolcraftModelAsset = ToolcraftMediaAssetBase<"model"> &
  ToolcraftSceneElementFrame &
  ToolcraftModelAssetRecord;

export type ToolcraftLegacyModelAsset = ToolcraftMediaAssetBase<"model"> &
  Partial<ToolcraftSceneElementFrame> &
  ToolcraftModelAssetRecord;

export type ToolcraftMediaAsset =
  | ToolcraftFileAsset
  | ToolcraftImageAsset
  | ToolcraftModelAsset;

type ToolcraftMediaAssetDraftFor<Asset extends ToolcraftMediaAsset> =
  Asset extends ToolcraftMediaAsset
    ? Omit<Asset, "id" | "layerId"> & {
        id?: string;
        layerId?: string;
        layerName?: string;
      }
    : never;

export type ToolcraftFileAssetDraft =
  ToolcraftMediaAssetDraftFor<ToolcraftFileAsset>;

export type ToolcraftImageAssetDraft =
  ToolcraftMediaAssetDraftFor<ToolcraftImageAsset>;

export type ToolcraftModelAssetDraft =
  ToolcraftMediaAssetDraftFor<ToolcraftModelAsset>;

export type ToolcraftMediaAssetDraft =
  | ToolcraftFileAssetDraft
  | ToolcraftImageAssetDraft
  | ToolcraftModelAssetDraft;

export type ToolcraftLegacyImageAsset = Omit<
  ToolcraftMediaAssetBase<"image">,
  "assetKind"
> & {
  assetKind?: "image";
  dataUrl: string;
  position: ToolcraftPoint;
  size?: ToolcraftCanvasSize;
  transform?: ToolcraftMediaTransform;
};

export type ToolcraftLegacyFileAsset = ToolcraftMediaAssetBase<"file"> & {
  assetKind: "file";
  dataUrl: string;
  position: ToolcraftPoint;
};

export type ToolcraftLegacyImageAssetDraft = Omit<
  ToolcraftLegacyImageAsset,
  "assetKind" | "id" | "layerId"
> & {
  assetKind?: "image";
  id?: string;
  layerId?: string;
  layerName?: string;
};

export type ToolcraftLegacyFileAssetDraft = Omit<
  ToolcraftLegacyFileAsset,
  "id" | "layerId"
> & {
  id?: string;
  layerId?: string;
  layerName?: string;
};

export type ToolcraftMediaImportAsset =
  | ToolcraftLegacyFileAssetDraft
  | ToolcraftLegacyImageAssetDraft
  | ToolcraftMediaAssetDraft;

export type ToolcraftInitialMediaAsset =
  | ToolcraftLegacyFileAsset
  | ToolcraftLegacyImageAsset
  | ToolcraftLegacyModelAsset
  | ToolcraftMediaAsset;

export type ToolcraftMediaTransform = {
  flipHorizontal?: boolean;
  flipVertical?: boolean;
  rotationDeg?: 0 | 90 | 180 | 270;
};

export type ToolcraftMediaTransformOperation =
  | "flip-horizontal"
  | "flip-vertical"
  | "rotate-left"
  | "rotate-right";

export type ToolcraftHistoryPatch = {
  after: Record<string, unknown>;
  before: Record<string, unknown>;
  group?: string;
  label: string;
};

export type ToolcraftHistoryMode = "merge" | "record" | "skip";

export type ToolcraftTimelineBezierControlPoints = [number, number, number, number];

export type ToolcraftTimelineKeyframeEasing =
  | {
      controlPoints: ToolcraftTimelineBezierControlPoints;
      type: "bezier";
    }
  | {
      /**
       * Carry the motion through this keyframe at the speed it arrives, rather
       * than resting at it. The curve is solved from the keyframes on either
       * side at evaluation time, because the speed to carry through at is not
       * knowable from this keyframe alone and has to follow its neighbours when
       * they move.
       */
      type: "continuous";
    }
  | {
      type: "step";
    };

export type ToolcraftTimelineKeyframe = {
  controlId: string;
  controlLabel: string;
  easing?: ToolcraftTimelineKeyframeEasing;
  /**
   * How the motion *arrives* at this keyframe, as against `easing`, which says
   * how it leaves.
   *
   * A cubic segment has a handle at each end. Until this existed, both belonged
   * to the keyframe the segment left, so a keyframe had no say in how anything
   * reached it: easing the landing of a move meant reaching back and shaping
   * the keyframe before it, and a keyframe with different neighbours on either
   * side could not be eased on one side without changing the other. After
   * Effects gives every keyframe an incoming and an outgoing handle, and this
   * is that incoming one.
   *
   * Only the second pair is read, since the first belongs to the keyframe at
   * the other end of the segment. Absent, the segment keeps both handles from
   * the keyframe it leaves, which is exactly what every keyframe did before
   * this field existed — so an animation built earlier evaluates identically.
   */
  easeIn?: ToolcraftTimelineBezierControlPoints;
  id: string;
  timeSeconds: number;
  value?: unknown;
  valueLabel: string;
};

export type ToolcraftTimelineKeyframeGroup = {
  controlId: string;
  keyframes: ToolcraftTimelineKeyframe[];
  label: string;
};

/**
 * A copied keyframe, holding everything except where it was.
 *
 * `offsetSeconds` is how far this keyframe sat behind the earliest one in the
 * copy, so a paste can rebuild the group's shape starting at the playhead. The
 * id is deliberately absent: an id here is its control and its time, so a
 * pasted keyframe gets a new one at the time it lands on rather than carrying
 * the old one to a frame it no longer sits at.
 */
export type ToolcraftTimelineClipboardKeyframe = {
  controlId: string;
  controlLabel: string;
  easeIn?: ToolcraftTimelineBezierControlPoints;
  easing?: ToolcraftTimelineKeyframeEasing;
  offsetSeconds: number;
  value?: unknown;
  valueLabel: string;
};

export type ToolcraftTimelineState = {
  currentTimeSeconds: number;
  durationSeconds: number;
  expanded: boolean;
  isLooping: boolean;
  isPlaying: boolean;
  keyframeGroups: ToolcraftTimelineKeyframeGroup[];
  /**
   * How fast playback runs, as a multiple of real time.
   *
   * Review speed only. It scales the clock and nothing else, so the animation
   * itself — the keyframes, their times, the length of the loop — is untouched,
   * and an export is unaffected by whatever this was left at.
   */
  playbackRate: number;
  /**
   * The keyframe the single-keyframe tools act on: the curve editor, the time
   * readout, the arrow keys. It is the last keyframe added to the selection,
   * and it is always one of `selectedKeyframeIds` — null exactly when that is
   * empty.
   */
  selectedKeyframeId: string | null;
  /**
   * Every selected keyframe, in the order they were selected.
   *
   * Kept beside the anchor rather than replacing it because the two answer
   * different questions. "Which curve am I editing" has one answer and always
   * did; "which keyframes does this drag move" did not exist until a selection
   * could hold more than one. Collapsing them would have made every reader of
   * the anchor pick a keyframe out of a set for itself, each with its own idea
   * of which one.
   */
  selectedKeyframeIds: readonly string[];
};

export type ToolcraftPanelId = "controls" | "layers" | "timeline" | "toolbar";

export type ToolcraftPanelState = {
  collapsed?: boolean;
  extended?: boolean;
  hidden?: boolean;
  offset: { x: number; y: number };
  snapEdge?: ToolcraftPanelSnapEdge;
};

export type ToolcraftPanelPatch = Partial<
  Pick<
    ToolcraftPanelState,
    "collapsed" | "extended" | "hidden" | "offset" | "snapEdge"
  >
>;

export type ToolcraftControlsPanelState = ToolcraftPanelState & {
  collapsedSections: Record<string, boolean>;
};

export type ToolcraftPanelsState = {
  controls: ToolcraftControlsPanelState;
  layers: ToolcraftPanelState;
  timeline: ToolcraftPanelState;
  toolbar: ToolcraftPanelState;
};

export type ToolcraftState = {
  canvas: ToolcraftCanvasState;
  defaults: Record<string, unknown>;
  history: {
    redo: ToolcraftHistoryPatch[];
    undo: ToolcraftHistoryPatch[];
  };
  layers: ToolcraftLayer[];
  mediaAssets: ToolcraftMediaAsset[];
  panels: ToolcraftPanelsState;
  schema: ResolvedToolcraftAppSchema;
  selectedLayerId: string | null;
  timeline: ToolcraftTimelineState;
  values: Record<string, unknown>;
};

export type ToolcraftInitialState = {
  canvas?: Partial<ToolcraftCanvasState>;
  layers?: ToolcraftLayer[];
  mediaAssets?: ToolcraftInitialMediaAsset[];
  panels?: {
    controls?: Partial<ToolcraftControlsPanelState>;
    layers?: Partial<ToolcraftPanelState>;
    timeline?: Partial<ToolcraftPanelState>;
    toolbar?: Partial<ToolcraftPanelState>;
  };
  selectedLayerId?: string | null;
  timeline?: Partial<ToolcraftTimelineState>;
  values?: Record<string, unknown>;
};
