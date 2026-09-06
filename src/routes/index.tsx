import { ToolcraftApp } from "@/toolcraft/runtime/react";

import { appComposition } from "../app/app-composition";
import {
  SmallScreenNote,
  useSmallScreenHold,
} from "../app/small-screen-note";
import { StudioBoundary } from "../app/studio-boundary";

/**
 * The studio, with something to say if it ever stops.
 *
 * The boundary is outside the app rather than inside it because the throw that
 * mattered came from creating the WebGL context, which happens as the canvas
 * mounts. Anything inside would already be gone by then.
 */
export function AppHome(): React.JSX.Element {
  const { holding, release } = useSmallScreenHold();

  // The studio is not mounted while the note is up, so a phone downloads the
  // note and nothing else. Opening it anyway mounts it from nothing, which is
  // where it would have started in any case.
  if (holding) return <SmallScreenNote onContinue={release} />;

  return (
    <StudioBoundary>
      <ToolcraftApp
        canvasContent={appComposition.canvasContent}
        className="h-dvh min-h-dvh"
        controlRenderers={appComposition.controlRenderers}
        exportRenderer={appComposition.exportRenderer}
        infiniteCanvasContent={appComposition.infiniteCanvasContent}
        modelPresentation={appComposition.modelPresentation}
        onPanelAction={appComposition.onPanelAction}
        renderDefaultCanvasMedia={appComposition.renderDefaultCanvasMedia}
        rendererPipelineRegistration={
          appComposition.rendererPipelineRegistration
        }
        sceneBoundsProvider={appComposition.sceneBoundsProvider}
        schema={appComposition.schema}
        svgExportRenderer={appComposition.svgExportRenderer}
        toolbarActions={appComposition.toolbarActions}
      />
    </StudioBoundary>
  );
}
