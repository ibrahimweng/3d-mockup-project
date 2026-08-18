import * as React from "react";
import * as THREE from "three";
import {
  readToolcraftOrientationPose,
  useToolcraft,
  useToolcraftEvaluatedValues,
  useToolcraftMediaPresentationUrls,
  useToolcraftModelOrbitInteraction,
  useToolcraftProductSceneFrame,
} from "@/toolcraft/runtime/react";

import { forgetArtworkUrl, publishArtworkUrl } from "./artwork-store";
import { RasterRenderer } from "./render/raster-renderer";
import { readRasterSettings, readScreenTransform } from "./render/settings";
import styles from "./preview.module.css";

export function PlinthPreview(): React.ReactElement {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const rendererRef = React.useRef<RasterRenderer | null>(null);
  const artworkRef = React.useRef<THREE.Texture | null>(null);
  // A frame is only drawn when something has invalidated it. Redrawing a static
  // scene every tick is what held the GPU at load in the previous renderer.
  const dirtyRef = React.useRef(true);
  const [sceneVersion, setSceneVersion] = React.useState(0);

  const values = useToolcraftEvaluatedValues();
  const frame = useToolcraftProductSceneFrame();
  const { state } = useToolcraft();

  const artworkAssets = React.useMemo(
    () =>
      state.mediaAssets.filter(
        (asset) =>
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
    rendererRef.current = renderer;
    return () => {
      rendererRef.current = null;
      renderer.dispose();
    };
  }, []);

  // Model and environment load asynchronously, so the scene announces itself
  // when ready rather than the first frame racing an empty scene.
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
        const texture = new THREE.Texture(image);
        texture.colorSpace = THREE.SRGBColorSpace;
        // The model's own UVs expect a top-down texture, matching how its stock
        // wallpaper was authored.
        texture.flipY = false;
        texture.needsUpdate = true;

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
  }, [artworkUrl, sceneVersion]);

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

  // Dragging the phone rotates it; a drag that misses falls through to the
  // runtime and pans the viewport. Two-finger pan and pinch zoom are already
  // native to CanvasShell.
  const hitTest = React.useCallback(
    (clientX: number, clientY: number) =>
      rendererRef.current?.hitTest(clientX, clientY) ?? false,
    [],
  );
  const orbitHandlers = useToolcraftModelOrbitInteraction<HTMLCanvasElement>({
    hitTest,
    historyLabel: "Rotate view",
    target: "camera.orbit",
  });

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
    />
  );
}
