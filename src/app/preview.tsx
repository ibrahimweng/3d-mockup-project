import * as React from "react";
import * as THREE from "three";
import type { ToolcraftImageAsset } from "@/toolcraft/runtime";
import {
  readToolcraftOrientationPose,
  useToolcraft,
  useToolcraftEvaluatedValues,
  useToolcraftMediaPresentationUrls,
  useToolcraftModelOrbitInteraction,
  useToolcraftProductSceneFrame,
} from "@/toolcraft/runtime/react";

import { forgetArtworkUrl, publishArtworkUrl } from "./artwork-store";
import { useDesignDrag } from "./design-drag";
import { useViewOrbit } from "./view-orbit";
import { readDeviceDefinition } from "./product-domain";
import { RasterRenderer } from "./render/raster-renderer";
import { createScreenTexture } from "./render/screen-texture";
import { readRasterSettings, readScreenTransform } from "./render/settings";
import styles from "./preview.module.css";

export function MockupPreview(): React.ReactElement {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const rendererRef = React.useRef<RasterRenderer | null>(null);
  const artworkRef = React.useRef<THREE.Texture | null>(null);
  // A frame is only drawn when something has invalidated it. Redrawing a static
  // scene every tick would hold the GPU at load for no visible change.
  const dirtyRef = React.useRef(true);
  const [sceneVersion, setSceneVersion] = React.useState(0);

  const values = useToolcraftEvaluatedValues();
  const frame = useToolcraftProductSceneFrame();
  const { state } = useToolcraft();

  const artworkAssets = React.useMemo(
    () =>
      state.mediaAssets.filter(
        (asset): asset is ToolcraftImageAsset =>
          asset.assetKind === "image" && asset.sourceTarget === "artwork.image",
      ),
    [state.mediaAssets],
  );
  const urls = useToolcraftMediaPresentationUrls(artworkAssets);

  const settings = React.useMemo(() => readRasterSettings(values), [values]);
  const screen = React.useMemo(() => readScreenTransform(values), [values]);
  const screenRef = React.useRef(screen);
  screenRef.current = screen;
  const pose = React.useMemo(
    () => readToolcraftOrientationPose(values["camera.orbit"]),
    [values],
  );

  // The renderer owns a WebGL context, so it is created once against the canvas
  // and torn down only on unmount.
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const renderer = new RasterRenderer(canvas);
    // A studio swapped in place changes the lighting without rebuilding the
    // scene, so the frame has to be invalidated when it finishes convolving.
    renderer.onEnvironmentReady = () => {
      dirtyRef.current = true;
    };
    rendererRef.current = renderer;
    return () => {
      rendererRef.current = null;
      renderer.onEnvironmentReady = null;
      renderer.dispose();
    };
  }, []);

  // Model and environment load asynchronously, so the scene announces itself
  // when ready rather than the first frame racing an empty scene. Switching
  // device runs through the same path.
  React.useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    void renderer.update(settings, () => {
      renderer.setArtwork(artworkRef.current, screenRef.current);
      setSceneVersion((version) => version + 1);
      dirtyRef.current = true;
    });
  }, [settings]);

  const artworkAsset = artworkAssets.at(-1) ?? null;
  const artworkUrl = artworkAsset ? (urls.get(artworkAsset.id) ?? null) : null;
  // Runtime owns rotate and flip through the actions under the uploader; the
  // renderer reads that state rather than keeping its own copy.
  const designTransform = artworkAsset?.transform;
  const designTransformKey = JSON.stringify(designTransform ?? {});

  React.useEffect(() => {
    if (!artworkAsset || !artworkUrl) return undefined;
    const assetId = artworkAsset.id;
    publishArtworkUrl(assetId, artworkUrl);
    return () => forgetArtworkUrl(assetId);
  }, [artworkAsset, artworkUrl]);

  React.useEffect(() => {
    if (!artworkUrl) {
      artworkRef.current?.dispose();
      artworkRef.current = null;
      rendererRef.current?.setArtwork(null);
      dirtyRef.current = true;
      return undefined;
    }

    let cancelled = false;
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.src = artworkUrl;
    void image
      .decode()
      .then(() => {
        if (cancelled) return;
        const texture = createScreenTexture(
          image,
          readDeviceDefinition(settings.device),
          designTransform,
        );

        artworkRef.current?.dispose();
        artworkRef.current = texture;
        rendererRef.current?.setArtwork(texture, screenRef.current);
        dirtyRef.current = true;
      })
      .catch(() => {
        // A source that cannot decode leaves the previous screen in place.
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the transform is
    // tracked by its serialized key so a new object identity alone cannot
    // re-decode the source image.
  }, [artworkUrl, designTransformKey, sceneVersion, settings.device]);

  React.useEffect(() => {
    rendererRef.current?.setPose(pose);
    dirtyRef.current = true;
  }, [pose, sceneVersion, settings.focalLength]);

  // Fit, scale, stretch and position only remap the display texture, so they
  // redraw a frame without touching the model or the environment.
  React.useEffect(() => {
    rendererRef.current?.setArtwork(artworkRef.current, screen);
    dirtyRef.current = true;
  }, [screen]);

  const rect =
    frame.kind === "finite" || frame.kind === "infinite" ? frame.rect : null;
  const width = rect?.width ?? 0;
  const height = rect?.height ?? 0;
  const renderScale = Number(values["canvas.renderScale"] ?? 2) || 2;

  React.useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer || width <= 0 || height <= 0) return;
    renderer.setSize(width, height, window.devicePixelRatio * renderScale);
    renderer.setPose(pose);
    dirtyRef.current = true;
  }, [height, pose, renderScale, sceneVersion, width]);

  // Three surfaces share one pointer. The screen edits the design, the body
  // rotates the device, and a miss falls through to the runtime and pans the
  // viewport. Orbit therefore declines a hit that landed on a display, so the
  // design drag can claim it first.
  const hitTest = React.useCallback(
    (clientX: number, clientY: number) => {
      const renderer = rendererRef.current;
      if (!renderer?.hitTest(clientX, clientY)) return false;
      return renderer.hitScreenUV(clientX, clientY) === null;
    },
    [],
  );
  const orbitHandlers = useToolcraftModelOrbitInteraction<HTMLCanvasElement>({
    hitTest,
    historyLabel: "Rotate view",
    target: "camera.orbit",
  });
  const designDrag = useDesignDrag(rendererRef, artworkUrl !== null);
  const viewOrbit = useViewOrbit();

  // Pointer priority, highest first: a dedicated orbit binding, then the design
  // drag on a display, then the runtime's own model orbit, then CanvasShell.
  // Each declines what is not its own, so there is never a mode to switch.
  const pointerHandlers = React.useMemo(
    () => ({
      onPointerCancel: (event: React.PointerEvent<HTMLCanvasElement>) => {
        if (viewOrbit.onPointerCancel(event)) return;
        if (designDrag.onPointerCancel(event)) return;
        orbitHandlers.onPointerCancel?.(event);
      },
      onPointerDown: (event: React.PointerEvent<HTMLCanvasElement>) => {
        if (viewOrbit.onPointerDown(event)) return;
        if (designDrag.onPointerDown(event)) return;
        orbitHandlers.onPointerDown?.(event);
      },
      onPointerMove: (event: React.PointerEvent<HTMLCanvasElement>) => {
        if (viewOrbit.onPointerMove(event)) return;
        if (designDrag.onPointerMove(event)) return;
        orbitHandlers.onPointerMove?.(event);
      },
      onPointerUp: (event: React.PointerEvent<HTMLCanvasElement>) => {
        if (viewOrbit.onPointerUp(event)) return;
        if (designDrag.onPointerUp(event)) return;
        orbitHandlers.onPointerUp?.(event);
      },
    }),
    [designDrag, orbitHandlers, viewOrbit],
  );

  React.useEffect(() => {
    let handle = 0;
    const tick = () => {
      handle = requestAnimationFrame(tick);
      if (!dirtyRef.current) return;
      const renderer = rendererRef.current;
      if (!renderer?.ready) return;
      dirtyRef.current = false;
      renderer.render();
    };
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, []);

  return (
    <canvas
      className={styles.surface}
      data-toolcraft-product-output
      ref={canvasRef}
      {...orbitHandlers}
      {...pointerHandlers}
    />
  );
}
