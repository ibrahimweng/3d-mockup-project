import type {
  ResolvedToolcraftAppSchema,
  ResolvedToolcraftControlSchema,
} from "../schema/types";
import type {
  ToolcraftInitialState,
  ToolcraftState,
  ToolcraftTimelineKeyframeGroup,
  ToolcraftTimelineState,
} from "./types";
import { toolcraftRuntimeSetupSectionId } from "../schema/runtime-section-titles";
import { toolcraftCanvasZoomDefault } from "./canvas-zoom";
import {
  getToolcraftDefaultCanvasMode,
  normalizeToolcraftCanvasMode,
} from "./canvas-frame";
import { normalizeToolcraftCanvasModeForBackground } from "./canvas-background-state";
import {
  cloneToolcraftLayers,
  cloneToolcraftMediaAssets,
  createToolcraftDefaultMediaState,
  createToolcraftLayersFromMediaAssets,
} from "./media-defaults";
import { getMediaReadyTimelineState } from "./timeline-readiness";
import {
  cloneToolcraftJsonValue,
} from "./control-value-codecs";
import {
  createCanonicalToolcraftControlDefaults,
  getToolcraftValueControls,
  mergeCanonicalToolcraftInitialValues,
  normalizeToolcraftControlValue,
} from "./control-value-normalization";

function cloneTimelineKeyframeGroups(
  keyframeGroups: readonly ToolcraftTimelineKeyframeGroup[],
  controls: ReadonlyMap<string, ResolvedToolcraftControlSchema>,
): ToolcraftTimelineKeyframeGroup[] {
  return keyframeGroups.map((group) => ({
    ...group,
    keyframes: group.keyframes.map((keyframe) => {
      const control = controls.get(group.controlId);
      const normalized = control
        ? normalizeToolcraftControlValue(control, keyframe.value)
        : { accepted: true as const, value: cloneToolcraftJsonValue(keyframe.value) };

      if (!normalized.accepted) {
        throw new Error(
          `Invalid seeded keyframe ${keyframe.id} for ${group.controlId} (${control?.type}).`,
        );
      }

      return {
        ...keyframe,
        easing:
          keyframe.easing?.type === "bezier"
            ? {
                controlPoints: [...keyframe.easing.controlPoints],
                type: "bezier" as const,
              }
            : keyframe.easing,
        value: normalized.value,
      };
    }),
  }));
}

function createDefaultTimelineState({
  controls,
  defaultDurationSeconds,
  timeline,
}: {
  controls: ReadonlyMap<string, ResolvedToolcraftControlSchema>;
  defaultDurationSeconds: number;
  timeline?: Partial<ToolcraftTimelineState>;
}): ToolcraftTimelineState {
  return {
    currentTimeSeconds: 0,
    durationSeconds: defaultDurationSeconds,
    expanded: false,
    isLooping: true,
    /**
     * Paused, because a new timeline has nothing to play.
     *
     * Opening it running looked harmless — with no keyframes nothing moves —
     * and it was not. The transport read "Pause" on a fresh app with nothing to
     * pause, the preview redrew a picture that never changed, and the
     * orientation proofs that take a baseline before touching anything require
     * a paused transport and failed outright.
     *
     * This was briefly reverted to `true` on the theory that a live transport
     * was the framework's contract, because the timeline playback proof hung
     * waiting for a "Pause playback" button. The revert was wrong twice over:
     * it broke the orientation proofs — measured, three runs failing at the
     * precondition in thirty seconds against two runs passing in one minute
     * fifty — and it did not fix the proof it was meant to fix, which fails
     * either way. Playback is something a person starts.
     */
    isPlaying: false,
    playbackRate: 1,
    selectedKeyframeId: null,
    ...timeline,
    keyframeGroups: cloneTimelineKeyframeGroups(
      timeline?.keyframeGroups ?? [],
      controls,
    ),
  };
}

export function createToolcraftState(
  schema: ResolvedToolcraftAppSchema,
  initialState: ToolcraftInitialState = {},
): ToolcraftState {
  const valueControls = getToolcraftValueControls(schema);
  const defaults = createCanonicalToolcraftControlDefaults(valueControls);
  const values = mergeCanonicalToolcraftInitialValues({
    controls: valueControls,
    defaults,
    initialValues: initialState.values,
  });
  const defaultMediaState = createToolcraftDefaultMediaState(schema);
  const hasInitialMediaAssets = Object.hasOwn(initialState, "mediaAssets");
  const mediaAssets = hasInitialMediaAssets
    ? cloneToolcraftMediaAssets(initialState.mediaAssets ?? [])
    : cloneToolcraftMediaAssets(defaultMediaState.mediaAssets);
  const layers =
    initialState.layers ??
    (hasInitialMediaAssets
      ? createToolcraftLayersFromMediaAssets(mediaAssets, defaultMediaState.layers)
      : cloneToolcraftLayers(defaultMediaState.layers));
  const selectedLayerId =
    initialState.selectedLayerId ??
    (hasInitialMediaAssets ? (layers[0]?.id ?? null) : defaultMediaState.selectedLayerId);
  const timeline = getMediaReadyTimelineState(
    schema,
    createDefaultTimelineState({
      controls: valueControls,
      defaultDurationSeconds: schema.panels.timeline?.defaultDurationSeconds ?? 8,
      timeline: initialState.timeline,
    }),
    mediaAssets,
  );

  const validSectionIds = new Set(
    schema.panels.controls?.sections.map((section) => section.id) ?? [],
  );
  /**
   * Setup starts collapsed, until someone says otherwise.
   *
   * Its controls — canvas size, aspect ratio, resolution scale — are the ones
   * a person sets when they begin and then leaves alone, and it sits above
   * every product control with nothing allowed in front of it. Open, it took
   * 349px of a 788px panel here and cut the first authored section in half.
   *
   * A stored record wins even when it is empty, which is the point: `{}` is
   * someone having opened Setup and meant it, and is not the same as never
   * having expressed a preference at all.
   */
  const storedCollapsedSections = initialState.panels?.controls?.collapsedSections;
  const collapsedSections = Object.fromEntries(
    Object.entries(
      storedCollapsedSections ?? { [toolcraftRuntimeSetupSectionId]: true },
    ).filter(
      ([sectionId, collapsed]) => validSectionIds.has(sectionId) && collapsed === true,
    ),
  );
  const panels: ToolcraftState["panels"] = {
    controls: { collapsedSections: {}, offset: { x: 0, y: 0 } },
    layers: { offset: { x: 0, y: 0 } },
    timeline: { offset: { x: 0, y: 0 } },
    toolbar: { offset: { x: 0, y: 0 } },
  };
  const initialCanvas = {
    offset: { x: 0, y: 0 },
    size: schema.canvas.size,
    zoom: toolcraftCanvasZoomDefault,
    ...initialState.canvas,
    mode: normalizeToolcraftCanvasModeForBackground({
      mode: normalizeToolcraftCanvasMode(
        initialState.canvas?.mode ?? getToolcraftDefaultCanvasMode(schema.canvas),
      ),
      schema,
      values,
    }),
  };

  return {
    canvas: initialCanvas,
    defaults,
    history: {
      redo: [],
      undo: [],
    },
    layers,
    mediaAssets,
    panels: {
      controls: {
        ...panels.controls,
        ...initialState.panels?.controls,
        collapsedSections,
      },
      layers: { ...panels.layers, ...initialState.panels?.layers },
      timeline: { ...panels.timeline, ...initialState.panels?.timeline },
      toolbar: { ...panels.toolbar, ...initialState.panels?.toolbar },
    },
    schema,
    selectedLayerId,
    timeline,
    values,
  };
}
