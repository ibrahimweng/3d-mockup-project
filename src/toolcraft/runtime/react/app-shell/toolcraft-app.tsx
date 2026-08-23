"use client";

import * as React from "react";

import type { ResolvedToolcraftAppSchema } from "../../schema/types";
import type { AnyToolcraftRendererPipelineRegistration } from "../../rendering";
import {
  createToolcraftRuntimeSceneVisibility,
  type ToolcraftProductSceneBoundsProvider,
} from "../../scene";
import type { ToolcraftState } from "../../state/types";
import {
  getToolcraftExportRendererCoverageErrors,
} from "../../export/export-renderer-coverage";
import type { ToolcraftProductExportRenderer } from "../../export/product-export-renderer";
import type { ToolcraftProductSvgExportRenderer } from "../../export/product-svg-export-renderer";
import { CanvasShell } from "../canvas/canvas-shell";
import { ToolcraftProductSceneBoundsBoundary } from "../canvas/product-scene-surface";
import {
  ControlsPanel,
  type ToolcraftPanelActionHandler,
} from "../controls-panel/controls-panel";
import type { ToolcraftControlRendererMap } from "../controls-panel/control-renderers";
import type { ToolcraftControlsSceneExport } from "../controls-panel/actions/controls-panel-actions";
import { ToolcraftRoot } from "./toolcraft-root";
import { LayersPanel } from "../layers/layers-panel";
import { useToolcraftModelRenderPreparationStatus } from "../model-rendering/model-render-provider";
import { TimelinePanel } from "../timeline/timeline-panel";
import { ToolbarPanel } from "./toolbar-panel";
import { useToolcraftCommittedSelector } from "./toolcraft-selectors";
import type { ToolcraftModelPresentationMode } from "../model-rendering/model-render-binding";
import { useToolcraftPersistenceStatus } from "./use-toolcraft-persistence";

export type ToolcraftAppComposition = {
  canvasContent?: React.ReactNode;
  controlRenderers?: ToolcraftControlRendererMap;
  exportRenderer?: ToolcraftProductExportRenderer;
  infiniteCanvasContent?: React.ReactNode;
  modelPresentation?: ToolcraftModelPresentationMode;
  onPanelAction?: ToolcraftPanelActionHandler;
  renderDefaultCanvasMedia?: boolean;
  rendererPipelineRegistration?: AnyToolcraftRendererPipelineRegistration;
  sceneBoundsProvider?: ToolcraftProductSceneBoundsProvider;
  schema: ResolvedToolcraftAppSchema;
  svgExportRenderer?: ToolcraftProductSvgExportRenderer;
};

export type ToolcraftAppProps = ToolcraftAppComposition & {
  className?: string;
  style?: React.CSSProperties;
};

const toolcraftMinAppWidthPx = 1024;

const selectAppSurfaces = (state: ToolcraftState) =>
  state.schema.assembly.surfaces;
function cn(...classNames: Array<string | false | null | undefined>): string {
  return classNames.filter(Boolean).join(" ");
}

function ToolcraftAppContent({
  canvasContent,
  className,
  controlRenderers,
  infiniteCanvasContent,
  onPanelAction,
  renderDefaultCanvasMedia = true,
  sceneExport,
  style,
}: Omit<
  ToolcraftAppProps,
  | "modelPresentation"
  | "rendererPipelineRegistration"
  | "sceneBoundsProvider"
  | "schema"
> & Readonly<{ sceneExport: ToolcraftControlsSceneExport }>): React.JSX.Element {
  const surfaces = useToolcraftCommittedSelector(selectAppSurfaces);
  /**
   * One timeline, opened and closed by one control.
   *
   * There used to be two gates: a switch in the controls panel that turned the
   * compact transport into a real panel, and then a toggle inside that panel
   * which revealed the tracks. Two controls for one idea, and neither of them
   * where a person looks for a timeline. The panel is now always the full
   * thing, and its own chevron is the single open/close.
   */
  const timelinePanelVariant = "extended" as const;
  const modelRendererStatus = useToolcraftModelRenderPreparationStatus();
  const persistenceStatus = useToolcraftPersistenceStatus();

  return (
    <div
      className={cn(
        "relative flex min-h-[640px] w-full flex-col overflow-hidden bg-[color:var(--background)]",
        className,
      )}
      data-slot="toolcraft-runtime-app"
      data-toolcraft-model-renderer-status={modelRendererStatus}
      data-toolcraft-persistence-failure-reason={
        persistenceStatus.status === "failed"
          ? persistenceStatus.reason
          : undefined
      }
      data-toolcraft-persistence-status={persistenceStatus.status}
      style={{
        ...style,
        minWidth: toolcraftMinAppWidthPx,
      }}
    >
      {/*
        The stage: everything that floats over the picture. It gives up
        whatever height the timeline band below it takes, so the two occupy
        separate bands rather than the timeline covering the bottom of the
        shot — a strip of the canvas you cannot see is a strip you cannot
        compose in.
      */}
      <div className="relative min-h-0 flex-1" data-slot="toolcraft-runtime-stage">
        {surfaces.canvas.enabled ? (
          <CanvasShell
            infiniteCanvasContent={infiniteCanvasContent}
            renderDefaultMedia={renderDefaultCanvasMedia}
          >
            {canvasContent}
          </CanvasShell>
        ) : null}
        {surfaces.panels.layers?.enabled ? (
          <LayersPanel panelPlacement="floating" />
        ) : null}
        {surfaces.panels.controls?.enabled ? (
          <ControlsPanel
            controlRenderers={controlRenderers}
            onPanelAction={onPanelAction}
            panelPlacement="floating"
            sceneExport={sceneExport}
          />
        ) : null}
        {surfaces.panels.toolbar.enabled ? (
          <ToolbarPanel panelPlacement="floating" />
        ) : null}
      </div>
      {surfaces.panels.timeline?.enabled ? (
        <TimelinePanel panelPlacement="floating" variant={timelinePanelVariant} />
      ) : null}
    </div>
  );
}

export function ToolcraftApp({
  canvasContent,
  exportRenderer,
  modelPresentation,
  renderDefaultCanvasMedia = true,
  rendererPipelineRegistration,
  sceneBoundsProvider,
  schema,
  svgExportRenderer,
  ...props
}: ToolcraftAppProps): React.JSX.Element {
  const suppressedModelTargets = modelPresentation?.mode === "custom"
    ? modelPresentation.consumers.map(({ sourceTarget }) => sourceTarget)
    : [];
  const productSceneRequired =
    React.Children.count(canvasContent) > 0 ||
    rendererPipelineRegistration !== undefined ||
    suppressedModelTargets.length > 0;
  const exportRendererErrors = getToolcraftExportRendererCoverageErrors({
    exportRenderer,
    productSceneRequired,
    schema,
    svgExportRenderer,
  });
  if (exportRendererErrors.length > 0) {
    throw new Error(
      `Toolcraft export renderer configuration is invalid:\n- ${exportRendererErrors.join("\n- ")}`,
    );
  }
  const sceneExport: ToolcraftControlsSceneExport = Object.freeze({
    ...(sceneBoundsProvider ? { boundsProvider: sceneBoundsProvider } : {}),
    ...(exportRenderer ? { exportRenderer } : {}),
    productSceneRequired,
    ...(svgExportRenderer ? { svgExportRenderer } : {}),
    visibility: createToolcraftRuntimeSceneVisibility({
      renderDefaultImages: renderDefaultCanvasMedia,
      suppressedModelTargets,
    }),
  });

  return (
    <ToolcraftRoot
      modelPresentation={modelPresentation}
      rendererPipelineRegistration={rendererPipelineRegistration}
      schema={schema}
    >
      <ToolcraftProductSceneBoundsBoundary
        boundsProvider={sceneBoundsProvider}
      >
        <ToolcraftAppContent
          {...props}
          canvasContent={canvasContent}
          renderDefaultCanvasMedia={renderDefaultCanvasMedia}
          sceneExport={sceneExport}
        />
      </ToolcraftProductSceneBoundsBoundary>
    </ToolcraftRoot>
  );
}
