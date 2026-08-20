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
import { useAdaptiveQuality } from "./adaptive-quality";
import { useScenePreset } from "./apply-scene-preset";
import { useSurfaceFraming } from "./apply-surface-framing";
import { useDesignDrag } from "./design-drag";
import { useViewOrbit } from "./view-orbit";
import { useViewPan } from "./view-pan";
import { readDeviceDefinition } from "./product-domain";
import { RasterRenderer } from "./render/raster-renderer";
import { createScreenTexture } from "./render/screen-texture";
import { readRasterSettings, readScreenTransform } from "./render/settings";
import styles from "./preview.module.css";

/** Drawing above the display's own ratio is pixels nobody can see. */
const MAX_PIXEL_RATIO = 2;

export function MockupPreview(): React.ReactElement {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const rendererRef = React.useRef<RasterRenderer | null>(null);
  const artworkRef = React.useRef<THREE.Texture | null>(null);
  // A frame is only drawn when something has invalidated it. Redrawing a static
  // scene every tick would hold the GPU at load for no visible change.
  const dirtyRef = React.useRef(true);
  const [sceneVersion, setSceneVersion] = React.useState(0);
  // Dragging trades resolution for frame rate. Nothing is being inspected
  // closely while the scene is in motion, and the alternative is a sharp
  // picture that arrives after the pointer has already moved on.
  // Only used to decide which frames are worth timing: a frame drawn because a
  // slider moved says nothing about whether a rotation will hold up. The frame
  // loop is created once, so it reads this through a ref rather than closing
  // over a value that would be stale by the first frame.
  const interactingRef = React.useRef(false);
  const quality = useAdaptiveQuality();
  // Writes the chosen studio into the ordinary controls, once per change.
  useScenePreset();
  // And lifts the camera when a table appears under one too low to see it.
  useSurfaceFraming();

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
  // Keyed on the values rather than the object, because the object is rebuilt
  // on every store change — including a rotation, which does not touch the
  // screen at all — and remapping the display texture rebinds it each time.
  const screenKey = JSON.stringify(screen);
  const pose = React.useMemo(
    () => readToolcraftOrientationPose(values["camera.orbit"]),
    [values],
  );

  // The renderer owns a WebGL context, so it is created once against the canvas
  // and torn down only on unmount.
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const renderer = new RasterRenderer(canvas, {
      antialias: (window.devicePixelRatio || 1) < 2,
    });
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
  const designTransformKey = JSON.stringify(artworkAsset?.transform ?? null);
  /**
   * The transform, rebuilt from its own serialization.
   *
   * The runtime hands back a fresh object on every store change, so depending
   * on it directly re-decodes the source image whenever anything at all moves.
   * Deriving it from the key instead makes "the same transform is the same
   * value" true rather than asserted — which is what the two suppressions here
   * used to assert in a comment.
   */
  const designTransform = React.useMemo(
    () =>
      (JSON.parse(designTransformKey) as ToolcraftImageAsset["transform"] | null) ??
      undefined,
    [designTransformKey],
  );

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
          rendererRef.current?.maxAnisotropy ?? 1,
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
  }, [artworkUrl, designTransform, sceneVersion, settings.device]);

  React.useEffect(() => {
    rendererRef.current?.setPose(pose);
    dirtyRef.current = true;
  }, [pose, sceneVersion, settings.focalLength]);

  // Fit, scale, stretch and position only remap the display texture, so they
  // redraw a frame without touching the model or the environment.
  React.useEffect(() => {
    rendererRef.current?.setArtwork(artworkRef.current, screenRef.current);
    dirtyRef.current = true;
  }, [screenKey]);

  const rect =
    frame.kind === "finite" || frame.kind === "infinite" ? frame.rect : null;
  const width = rect?.width ?? 0;
  const height = rect?.height ?? 0;
  const renderScale = Number(values["canvas.renderScale"] ?? 2) || 2;

  /**
   * Device pixels per CSS pixel to draw the preview at.
   *
   * This used to be `devicePixelRatio * renderScale`, which on a retina
   * display meant four device pixels per CSS pixel — sixteen times the pixel
   * count of the box it is shown in, and 23 megapixels a frame for a preview
   * 1080 wide. Export does not come through this canvas at all; it builds its
   * own renderer at the requested size. So the scale became a ceiling rather
   * than a multiplier on top of the display's own ratio.
   *
   * It is a ceiling on the total, not a clamp to the display, and the
   * difference matters: drawing above the display's ratio and letting the
   * browser resolve it down is supersampling, which is real added sharpness on
   * any screen. Clamping to the display threw that away, and on an ordinary
   * one-to-one monitor it collapsed the whole control — every setting produced
   * the same picture.
   *
   * Dragging drops further still, because a frame that arrives late is worse
   * than a frame that is slightly soft.
   */
  const pixelRatio = React.useMemo(() => {
    const still = Math.min(MAX_PIXEL_RATIO, Math.max(1, renderScale));
    // Full sharpness is the default, dragging included. There used to be a
    // flat reduction on every drag, which cost every machine detail whether or
    // not it needed to and made the preview look soft to anyone judging the
    // picture. What is left is earned: the scale only leaves 1 once frames
    // have actually been late, and it climbs back as soon as they are not.
    return Math.max(1, still * quality.scale);
  }, [quality.scale, renderScale]);

  // Deliberately not keyed on the pose. The camera has its own effect above,
  // and resizing is the one operation that must not run per pointer move.
  React.useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer || width <= 0 || height <= 0) return;
    renderer.setSize(width, height, pixelRatio);
    dirtyRef.current = true;
  }, [height, pixelRatio, sceneVersion, width]);

  // The runtime's own model orbit still backs this up for a press that reaches
  // it, and it declines a hit that landed on a display so the design drag can
  // claim that first.
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
  const viewPan = useViewPan();

  // One pointer, three verbs, decided by which button is down and what is
  // under it rather than by a mode:
  //
  //   middle button      -> move the board (two fingers do this already, as a
  //                         wheel event the runtime handles itself)
  //   primary on screen  -> move the design across the display
  //   primary elsewhere  -> rotate the device, including the empty space
  //                         beside it, so there is nothing to aim at
  //
  // Order matters only between the middle two: the design drag has to see a
  // press before the orbit claims everything primary. Each declines what is
  // not its own and the rest falls through to the runtime.
  const pointerHandlers = React.useMemo(
    () => ({
      onPointerCancel: (event: React.PointerEvent<HTMLCanvasElement>) => {
        interactingRef.current = false;
        quality.reset();
        if (viewPan.onPointerCancel(event)) return;
        if (designDrag.onPointerCancel(event)) return;
        if (viewOrbit.onPointerCancel(event)) return;
        orbitHandlers.onPointerCancel?.(event);
      },
      onPointerDown: (event: React.PointerEvent<HTMLCanvasElement>) => {
        const claimed =
          viewPan.onPointerDown(event) ||
          designDrag.onPointerDown(event) ||
          viewOrbit.onPointerDown(event);
        if (claimed) {
          interactingRef.current = true;
          return;
        }
        orbitHandlers.onPointerDown?.(event);
      },
      onPointerMove: (event: React.PointerEvent<HTMLCanvasElement>) => {
        if (viewPan.onPointerMove(event)) return;
        if (designDrag.onPointerMove(event)) return;
        if (viewOrbit.onPointerMove(event)) return;
        orbitHandlers.onPointerMove?.(event);
      },
      onPointerUp: (event: React.PointerEvent<HTMLCanvasElement>) => {
        interactingRef.current = false;
        quality.reset();
        if (viewPan.onPointerUp(event)) return;
        if (designDrag.onPointerUp(event)) return;
        if (viewOrbit.onPointerUp(event)) return;
        orbitHandlers.onPointerUp?.(event);
      },
    }),
    [designDrag, orbitHandlers, quality, viewOrbit, viewPan],
  );

  React.useEffect(() => {
    let handle = 0;
    const tick = (now: number) => {
      handle = requestAnimationFrame(tick);
      if (!dirtyRef.current) return;
      const renderer = rendererRef.current;
      if (!renderer?.ready) return;
      dirtyRef.current = false;
      renderer.render();
      // Only a drag is timed. A frame drawn because a slider moved says
      // nothing about whether the machine can hold a rotation.
      // Only a drag is timed. A frame drawn because a slider moved says
      // nothing about whether the machine can hold a rotation.
      if (interactingRef.current) quality.sample(now);
    };
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, [quality]);

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
