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
import { readZoneAssets } from "./artwork-slots";
import { resolveCanvasCursor } from "./canvas-cursor";
import { DRAG_SAMPLING, PLAYBACK_SAMPLING, useAdaptiveQuality } from "./adaptive-quality";
import { useScenePreset } from "./apply-scene-preset";
import { useArtworkZoneCorrection } from "./artwork-zone";
import { useSurfaceFraming } from "./apply-surface-framing";
import { useDesignDrag } from "./design-drag";
import { useCanvasKeyboardOrbit, useViewOrbit } from "./view-orbit";
import { useViewPan } from "./view-pan";
import {
  readDeviceDefinition,
  readDeviceId,
  type ArtworkZoneId,
} from "./product-domain";
import {
  setSceneStatus,
  useSceneRetryCount,
} from "./render/scene-status";
import { fingerprint } from "./render/fingerprint";
import { RasterRenderer } from "./render/raster-renderer";
import { createScreenPainter, createScreenTexture } from "./render/screen-texture";
import { isAnimatedMimeType, openAnimatedArtwork } from "./render/animated-artwork";
import { paintMovingSlots, type MovingSlot } from "./render/moving-slots";
import {
  readArtworkBackground,
  readRasterSettings,
  readScreenTransform,
} from "./render/settings";
import styles from "./preview.module.css";

/** Drawing above the display's own ratio is pixels nobody can see. */
const MAX_PIXEL_RATIO = 2;


export function MockupPreview(): React.ReactElement {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const rendererRef = React.useRef<RasterRenderer | null>(null);
  const artworkRef = React.useRef<ReadonlyMap<ArtworkZoneId, THREE.Texture | null>>(
    new Map(),
  );
  // A frame is only drawn when something has invalidated it. Redrawing a static
  // scene every tick would hold the GPU at load for no visible change.
  const dirtyRef = React.useRef(true);
  // The zones whose designs move, walked once a frame. Empty for every product
  // nobody has dropped a GIF or a video onto, which is the ordinary case.
  const movingRef = React.useRef<MovingSlot[]>([]);
  // When a design with no timeline to follow started running, so it loops from
  // where it came in rather than from whenever the page was opened.
  const freeRunFromRef = React.useRef(0);
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
  useArtworkZoneCorrection();
  // And lifts the camera when a table appears under one too low to see it.
  useSurfaceFraming();

  /**
   * The evaluated values, held still while they say the same thing.
   *
   * The runtime rebuilds this object on every store change, so its identity
   * says nothing about whether the scene changed. Everything below derives from
   * it — the scene settings, the camera pose, the screen transform — and each
   * is memoized on the object, so a fresh identity alone invalidated the frame
   * and bought a full redraw of a picture that had not moved. Two of those
   * derivations already worked around this privately; holding the values
   * themselves fixes all of them at once, and a change that really does move
   * something still produces a new object and still redraws.
   */
  const evaluatedValues = useToolcraftEvaluatedValues();
  const evaluatedValuesKey = JSON.stringify(evaluatedValues);
  const evaluatedValuesRef = React.useRef(evaluatedValues);
  evaluatedValuesRef.current = evaluatedValues;
  const values = React.useMemo(
    () => evaluatedValuesRef.current,
    [evaluatedValuesKey],
  );
  const frame = useToolcraftProductSceneFrame();
  const { state } = useToolcraft();

  const zoneAssets = React.useMemo(
    () => readZoneAssets(state.mediaAssets),
    [state.mediaAssets],
  );
  const artworkAssets = React.useMemo(
    () => [...zoneAssets.values()],
    [zoneAssets],
  );
  const urls = useToolcraftMediaPresentationUrls(artworkAssets);

  // Infinity mode hands the renderer a frame cut from the set rather than an
  // artboard, and the camera composes for the two differently.
  const onCanvasKeyDown = useCanvasKeyboardOrbit();
  const canvasMode = frame.kind === "infinite" ? "infinite" : "finite";
  const settings = React.useMemo(
    () => readRasterSettings(values, canvasMode),
    [canvasMode, values],
  );
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

  /**
   * What the app can say about the frame it is showing.
   *
   * The runtime cannot see inside a WebGL canvas, so an orientation proof is
   * only worth anything if the product reports its own output: that the pose it
   * was given is the pose it drew, which model it drew, and — separately —
   * what actually came out. `outputSignature` is the frame that was asked for,
   * `pixelSignature` is the frame that arrived, and the pair is the point.
   * Either one alone can move while the picture does not.
   *
   * The viewport offset is here because the same proof has to tell a rotation
   * apart from a pan: one changes the pose and leaves the board alone, the
   * other does the opposite.
   */
  const observation = React.useMemo(
    () => ({
      /**
       * The device's own pose, in the numbers a person set.
       *
       * `pose` below is the camera's, and until this was added it was the only
       * pose published — so the observation claimed to say what was drawn while
       * saying nothing about the thing in the middle of the frame. Anything
       * that animates the device moves these numbers and nothing else, which
       * makes them the only readout that can tell one frame of an animation
       * from another without going through the pixels.
       */
      deviceTransform: { ...settings.transform, spin: settings.spin },
      outputSignature: fingerprint(JSON.stringify([settings, screen, pose])),
      pose,
      poseTarget: "camera.orbit",
      // The URL is the key `loadModel` caches the parsed device under, so this
      // is the shared entry rather than a name for one.
      presentationCacheKey: `${import.meta.env.BASE_URL}models/${
        readDeviceDefinition(settings.device).modelFile
      }`,
      presentationDocumentId: settings.device,
      viewportOffsetX: state.canvas.offset.x,
      viewportOffsetY: state.canvas.offset.y,
    }),
    [pose, screen, settings, state.canvas.offset.x, state.canvas.offset.y],
  );
  const observationRef = React.useRef(observation);
  observationRef.current = observation;
  const pixelSignatureRef = React.useRef("");
  const timelineReport = `${state.timeline.currentTimeSeconds}|${state.timeline.durationSeconds}|${String(state.timeline.isPlaying)}`;
  const timelineRef = React.useRef(state.timeline);
  timelineRef.current = state.timeline;

  /**
   * Publish it, with whichever sampled frame is current.
   *
   * Written from two places because the two halves change on different beats:
   * a rotation redraws, and a pan moves the board with CSS and draws nothing at
   * all. Publishing only on a redraw would leave a pan invisible here.
   */
  const publishObservation = React.useCallback((pixelSignature?: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (pixelSignature) pixelSignatureRef.current = pixelSignature;
    canvas.dataset.mockupOrientation = JSON.stringify({
      ...observationRef.current,
      pixelSignature: pixelSignatureRef.current,
    });
    /**
     * Where the product is in the animation, said by the product.
     *
     * The runtime owns the clock, but only the renderer can say which frame it
     * drew for a given tick, and a proof that reads the runtime's own state
     * back to itself proves nothing. The cycle is the timeline's duration
     * because that is exactly what one loop of this animation is: keyframes are
     * evaluated against it, so there is no separate local period to drift from.
     */
    canvas.dataset.mockupTimeline = JSON.stringify({
      cycleSeconds: timelineRef.current.durationSeconds,
      pixelSignature: pixelSignatureRef.current,
      playing: timelineRef.current.isPlaying,
      timeSeconds: timelineRef.current.currentTimeSeconds,
    });
  }, []);

  React.useEffect(() => {
    publishObservation();
  }, [observation, publishObservation, timelineReport]);

  /**
   * Start each run of playback measuring from scratch.
   *
   * The sampler folds the gap between one timed frame and the next, so without
   * this the first gap it sees when playback starts is the whole idle stretch
   * since the last drag -- seconds, usually -- and it would drop the
   * resolution to the floor for a scene that had not been asked to draw
   * anything yet. Clearing it on both edges also means stopping playback does
   * not leave a stale timestamp for the next drag to measure against.
   */
  const isPlaying = state.timeline.isPlaying;
  React.useEffect(() => {
    quality.reset();
  }, [isPlaying, quality]);

  // The renderer owns a WebGL context, so it is created once against the canvas
  // and torn down only on unmount.
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    let renderer: RasterRenderer;
    try {
      renderer = new RasterRenderer(canvas, {
        antialias: (window.devicePixelRatio || 1) < 2,
      });
    } catch (error: unknown) {
      /*
       * No WebGL, and this is the only place that can tell.
       *
       * three.js throws out of the constructor when it cannot get a context,
       * and this effect had nothing around it, so the throw unwound React and
       * left a white page with no words on it. Everything the studio does is
       * this renderer, so there is no reduced version to fall back to. What
       * there is instead is a sentence saying what is wrong, which is the
       * difference between a broken app and an app that cannot run here.
       */
      console.error("WebGL is not available", error);
      setSceneStatus({ kind: "unavailable" });
      return undefined;
    }

    // A studio swapped in place changes the lighting without rebuilding the
    // scene, so the frame has to be invalidated when it finishes convolving.
    renderer.onEnvironmentReady = () => {
      dirtyRef.current = true;
    };
    renderer.onSceneLoad = (device) => {
      setSceneStatus({ device, kind: "loading" });
    };
    renderer.onSceneLoaded = () => setSceneStatus({ kind: "ready" });
    renderer.onSceneFailed = (device) => {
      setSceneStatus({ device, kind: "failed" });
    };

    /*
     * A context lost is a scene gone, and it happens without an error.
     *
     * A driver reset, a machine waking from sleep, or too many contexts open
     * across tabs all take the context away. Everything drawn afterwards goes
     * nowhere, so without this the canvas simply stops, looking exactly like a
     * studio that has finished loading and has nothing to show.
     */
    const onContextLost = (event: Event) => {
      event.preventDefault();
      setSceneStatus({ kind: "unavailable" });
    };
    canvas.addEventListener("webglcontextlost", onContextLost);

    rendererRef.current = renderer;
    return () => {
      canvas.removeEventListener("webglcontextlost", onContextLost);
      rendererRef.current = null;
      renderer.onEnvironmentReady = null;
      renderer.onSceneLoad = null;
      renderer.onSceneLoaded = null;
      renderer.onSceneFailed = null;
      renderer.dispose();
    };
  }, []);

  // Model and environment load asynchronously, so the scene announces itself
  // when ready rather than the first frame racing an empty scene. Switching
  // device runs through the same path.
  const retryCount = useSceneRetryCount();
  React.useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    void renderer.update(settings, () => {
      renderer.setArtwork(artworkRef.current, screenRef.current);
      setSceneVersion((version) => version + 1);
      dirtyRef.current = true;
    });
    // And whatever `update` just did, whether or not it built anything.
    //
    // The callback above runs only when a scene is built. Everything else --
    // a colour, a light, a finish, the ground -- is applied to the scene
    // already on screen and returns without it, so nothing here asks for the
    // frame that would show it. Today another effect happens to invalidate
    // the frame on the same store write and it is drawn anyway; that is an
    // accident of which effects run, not something this one arranged, and it
    // is one dependency list away from leaving a repainted model on screen
    // wearing its old colours until the user orbits.
    dirtyRef.current = true;
    // `retryCount` is not read here. It is listed so that pressing Retry after
    // a failed load runs this again, which is a real attempt rather than a
    // cache hit: the renderer clears its own scene key when a build fails.
  }, [retryCount, settings]);

  const artworkUrl = urls.get(zoneAssets.get("front")?.id ?? "") ?? null;
  /**
   * Every slot's source and its transform, as one string.
   *
   * The runtime hands back fresh objects on every store change — including a
   * rotation, which touches no upload at all — so depending on them directly
   * re-decodes every image whenever anything moves. Serializing makes "the
   * same slots are the same value" true rather than asserted, and it is one
   * key for all four because one decode pass fills all four.
   *
   * Rotate and flip belong to the runtime's own actions under each uploader;
   * the renderer reads that state rather than keeping a copy.
   */
  const slotsKey = JSON.stringify(
    [...zoneAssets].map(([zone, asset]) => [
      zone,
      urls.get(asset.id) ?? null,
      asset.transform ?? null,
      // What kind of upload it is, because a GIF and a PNG arrive down the
      // same slot and only one of them has to be taken apart frame by frame.
      asset.mimeType ?? null,
    ]),
  );
  const slots = React.useMemo(
    () =>
      JSON.parse(slotsKey) as [
        ArtworkZoneId,
        string | null,
        ToolcraftImageAsset["transform"] | null,
        string | null,
      ][],
    [slotsKey],
  );

  React.useEffect(() => {
    const published = [...zoneAssets.values()]
      .map((asset) => [asset.id, urls.get(asset.id), asset.mimeType ?? ""] as const)
      .filter((entry): entry is readonly [string, string, string] => Boolean(entry[1]));
    // With the kind, because export has to know whether a URL is one picture
    // or a reel of them before it can ask for the frame at a given moment.
    for (const [id, url, mimeType] of published) publishArtworkUrl(id, url, mimeType);
    return () => {
      for (const [id] of published) forgetArtworkUrl(id);
    };
  }, [zoneAssets, urls]);

  /**
   * Decode every slot, then bind the whole set at once.
   *
   * One pass rather than an effect per zone, because `setArtwork` writes every
   * zone the product has on every call — a zone left out of the map is a zone
   * cleared. Binding them one at a time would clear the other three each time
   * one arrived, and four images would land as one.
   */
  // Baked into the bitmap rather than written on the material, so a change
  // has to re-decode every slot; it belongs with the sources rather than with
  // the transform the rebind reads.
  const background = readArtworkBackground(
    values,
    readDeviceDefinition(settings.device).artworkSurface === "print",
  );

  React.useEffect(() => {
    let cancelled = false;
    const device = readDeviceDefinition(settings.device);
    const opened: MovingSlot[] = [];

    /**
     * A design that moves, if this one does and this browser can take it apart.
     *
     * Falls back to the still path on every failure rather than reporting one,
     * so a GIF in a browser with no image decoder shows its first frame -- the
     * same thing an `<img>` would have shown -- instead of an empty panel.
     */
    const openMoving = async (
      zone: ArtworkZoneId,
      url: string,
      transform: ToolcraftImageAsset["transform"] | null,
      mimeType: string,
    ): Promise<THREE.Texture | null> => {
      const source = await openAnimatedArtwork(url, mimeType, () => {
        dirtyRef.current = true;
      });
      if (!source) return null;
      const painter = createScreenPainter(
        source,
        device,
        transform ?? undefined,
        rendererRef.current?.maxAnisotropy ?? 1,
        background,
      );
      if (!painter) {
        source.dispose();
        return null;
      }
      if (cancelled) {
        source.dispose();
        painter.texture.dispose();
        return null;
      }
      opened.push({ painter, shown: null, source, zone });
      return painter.texture;
    };

    const decode = async (
      url: string,
      transform: ToolcraftImageAsset["transform"] | null,
    ): Promise<THREE.Texture | null> => {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.src = url;
      try {
        await image.decode();
      } catch {
        // A source that cannot decode leaves that zone on its template.
        return null;
      }
      return createScreenTexture(
        image,
        device,
        transform ?? undefined,
        rendererRef.current?.maxAnisotropy ?? 1,
        background,
      );
    };

    void Promise.all(
      slots.map(async ([zone, url, transform, mimeType]) => {
        if (!url) return null;
        const moving = isAnimatedMimeType(mimeType ?? undefined)
          ? await openMoving(zone, url, transform, mimeType ?? "")
          : null;
        return [zone, moving ?? (await decode(url, transform))] as const;
      }),
    ).then((decoded) => {
      const textures = new Map<ArtworkZoneId, THREE.Texture | null>(
        decoded.filter((entry) => entry !== null),
      );
      if (cancelled) {
        for (const texture of textures.values()) texture?.dispose();
        return;
      }
      for (const texture of artworkRef.current.values()) texture?.dispose();
      artworkRef.current = textures;
      movingRef.current = opened;
      rendererRef.current?.setArtwork(textures, screenRef.current);
      dirtyRef.current = true;
    });

    return () => {
      cancelled = true;
      // Decoders and video elements are not garbage: one holds a parsed file
      // and a frame, the other a media pipeline. Both are let go when the slot
      // that opened them changes.
      for (const slot of opened) slot.source.dispose();
      if (movingRef.current === opened) movingRef.current = [];
    };
  }, [background, slots, sceneVersion, settings.device]);

  React.useEffect(() => {
    rendererRef.current?.setPose(pose);
    dirtyRef.current = true;
  }, [pose, sceneVersion, settings.fit, settings.focalLength]);

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
  /**
   * Which gesture is in progress, if any, so the cursor can say what a press
   * is doing as well as what it would do.
   */
  const draggingRef = React.useRef<false | "design" | "turn" | "view">(false);
  const hasDesign = artworkUrl !== null;

  /**
   * Written straight onto the node rather than held in state. The cursor
   * changes as the pointer crosses onto the display, which is every few
   * pixels of a mouse move; re-rendering the preview that often to change one
   * CSS property would cost far more than the hint is worth.
   */
  const applyCursor = React.useCallback(
    (clientX: number, clientY: number): void => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dragging = draggingRef.current;
      const overScreen =
        dragging === false && hasDesign
          ? rendererRef.current?.hitScreenUV(clientX, clientY) != null
          : false;
      canvas.style.cursor = resolveCanvasCursor({ hasDesign, isDragging: dragging, overScreen });
    },
    [hasDesign],
  );

  // Order matters only between the middle two: the design drag has to see a
  // press before the orbit claims everything primary. Each declines what is
  // not its own and the rest falls through to the runtime.
  const pointerHandlers = React.useMemo(
    () => ({
      onPointerCancel: (event: React.PointerEvent<HTMLCanvasElement>) => {
        interactingRef.current = false;
        draggingRef.current = false;
        quality.reset();
        if (viewPan.onPointerCancel(event)) return;
        if (designDrag.onPointerCancel(event)) return;
        if (viewOrbit.onPointerCancel(event)) return;
        orbitHandlers.onPointerCancel?.(event);
      },
      onPointerDown: (event: React.PointerEvent<HTMLCanvasElement>) => {
        if (viewPan.onPointerDown(event)) {
          interactingRef.current = true;
          draggingRef.current = "view";
          applyCursor(event.clientX, event.clientY);
          return;
        }
        if (designDrag.onPointerDown(event)) {
          interactingRef.current = true;
          draggingRef.current = "design";
          applyCursor(event.clientX, event.clientY);
          return;
        }
        if (viewOrbit.onPointerDown(event)) {
          interactingRef.current = true;
          draggingRef.current = "turn";
          applyCursor(event.clientX, event.clientY);
          return;
        }
        orbitHandlers.onPointerDown?.(event);
      },
      onPointerMove: (event: React.PointerEvent<HTMLCanvasElement>) => {
        // Only while nothing is being dragged: mid-gesture the shape is already
        // decided, and asking the scene what is under the pointer costs a
        // raycast that the drag path deliberately budgets for once a frame.
        if (draggingRef.current === false) applyCursor(event.clientX, event.clientY);
        if (viewPan.onPointerMove(event)) return;
        if (designDrag.onPointerMove(event)) return;
        if (viewOrbit.onPointerMove(event)) return;
        orbitHandlers.onPointerMove?.(event);
      },
      onPointerUp: (event: React.PointerEvent<HTMLCanvasElement>) => {
        interactingRef.current = false;
        draggingRef.current = false;
        applyCursor(event.clientX, event.clientY);
        quality.reset();
        if (viewPan.onPointerUp(event)) return;
        if (designDrag.onPointerUp(event)) return;
        if (viewOrbit.onPointerUp(event)) return;
        orbitHandlers.onPointerUp?.(event);
      },
    }),
    [applyCursor, designDrag, orbitHandlers, quality, viewOrbit, viewPan],
  );

  React.useEffect(() => {
    let handle = 0;
    const tick = (now: number) => {
      handle = requestAnimationFrame(tick);
      /**
       * Move every design that moves, before anything decides to draw.
       *
       * On the timeline's clock rather than the clip's, so scrubbing scrubs
       * the design, pausing holds it on a frame, and the same export rendered
       * twice is the same animation both times. `frameAt` never waits: it
       * hands back the newest frame it has and goes after the one asked for,
       * so a slow decode costs this frame nothing.
       */
      const moving = movingRef.current;
      let paced = timelineRef.current.isPlaying;
      if (moving.length > 0) {
        if (freeRunFromRef.current === 0) freeRunFromRef.current = now;
        const moved = paintMovingSlots(
          moving,
          timelineRef.current,
          (now - freeRunFromRef.current) / 1000,
        );
        paced = paced || moved.playing;
        if (moved.painted) dirtyRef.current = true;
      } else {
        freeRunFromRef.current = 0;
      }
      if (!dirtyRef.current) return;
      const renderer = rendererRef.current;
      if (!renderer?.ready) return;
      dirtyRef.current = false;
      renderer.render();
      // Sampled here rather than anywhere else because the drawing buffer is
      // only readable in the same task as the draw that filled it.
      publishObservation(renderer.sampleSignature());
      // Timed whenever frames have to keep arriving: a drag, and playback.
      //
      // Only the drag was timed before, and playback is the case that needs
      // this most. Adaptive quality is the one safety net the preview has --
      // it notices late frames and trades resolution for them until they
      // arrive on time -- and a turntable ran entirely outside it, rendering
      // at full sharpness however slowly each frame came back, with nothing
      // watching. Dragging the same scene adapted within a few frames and felt
      // fine, which is what made playback the thing that stuttered.
      //
      // A frame drawn because a slider moved is still not timed: one frame in
      // isolation says nothing about whether the machine can hold a rotation.
      //
      // Judged differently in each case: a drag discards long gaps because a
      // hand that stopped is not a machine that struggled, and playback must
      // not, because there is no hand.
      if (interactingRef.current) quality.sample(now, DRAG_SAMPLING);
      else if (paced) quality.sample(now, PLAYBACK_SAMPLING);
    };
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, [publishObservation, quality]);

  const productName = readDeviceDefinition(
    readDeviceId(values["device.model"]),
  ).label;

  return (
    <canvas
      /*
       * The name of the one thing this whole app is.
       *
       * A canvas is a blank element to anything that cannot see it, so without
       * this the studio's entire output was not there at all: no name, no role,
       * nothing to land on with Tab, and nothing said about what it holds.
       */
      aria-label={`${productName}, lit and turned in a studio. Arrow keys turn it.`}
      className={styles.surface}
      // The design is dragged on this surface, so this surface is the handle.
      // There is no chrome to drag instead: the affordance is the design
      // itself, sitting on a screen that is geometry rather than an element.
      data-testid="toolcraft-product-output"
      data-toolcraft-canvas-handle
      data-toolcraft-product-output
      onKeyDown={(event) => {
        if (onCanvasKeyDown(event)) return;
      }}
      ref={canvasRef}
      /*
       * A focus stop, because the arrows only turn the product once this has
       * focus. Reaching it with Tab is the whole way in for anyone not using a
       * pointer, and the browser's own focus ring is left alone so it is
       * visible when they get here.
       */
      tabIndex={0}
      {...orbitHandlers}
      {...pointerHandlers}
    >
      {/*
        * Read instead of the picture by anything that cannot render it. The
        * element's own children are what a browser shows when it cannot draw a
        * canvas, and what a screen reader reads.
        */}
      A 3D preview of the {productName}. Use the arrow keys to turn it, and the
      controls beside it to change the product, its design and its lighting.
    </canvas>
  );
}
