import * as THREE from "three";

import { readDeviceDefinition, readFinishId } from "../product-domain";
import type { PartColors } from "./model-appearance";
import { fingerprint } from "./fingerprint";
import {
  fitDistance,
  fovDegreesFor,
  heldBox,
  readFitBasis,
} from "./camera-fit";
import {
  buildDeviceScene,
  loadEnvironment,
  type DeviceScene,
  type FloorSettings,
  type LightingSettings,
  type ScreenTransform,
  type SurfaceSettings,
  type SweepSettings,
} from "./device-scene";

/** How many rows of the frame the output signature is read from. */
const SIGNATURE_ROWS = 4;

type Pose = Readonly<{
  position: readonly [number, number, number];
  up: readonly [number, number, number];
}>;

export type RasterSettings = {
  backgroundColor: string;
  device: string;
  environment: string;
  exposure: number;
  finish: string;
  /** One hex per colour slot the selected product declares. */
  partColors: PartColors;
  /**
   * What decides the frame: an artboard somebody chose, or the set itself.
   *
   * An artboard is composed into — the subject is placed inside a shape it did
   * not pick, with room around it — and Infinity canvas has no artboard, so the
   * frame is cut from the set instead and the set has to fill it.
   */
  fit: "artboard" | "scene";
  floor: FloorSettings;
  focalLength: number;
  /** Where the subject sits in the picture, each axis -1 to 1 with 0 centred. */
  framing: { x: number; y: number };
  lighting: LightingSettings;
  showBackground: boolean;
  /** How far the device is turned about its own upright axis, in degrees. */
  spin: number;
  /**
   * Where the device stands and how big it is.
   *
   * The offsets are fractions of the device's own radius rather than scene
   * units, so the same numbers place a watch and a laptop the same way.
   */
  transform: {
    offsetX: number;
    offsetY: number;
    offsetZ: number;
    roll: number;
    scale: number;
    tilt: number;
  };
  surface: SurfaceSettings;
  sweep: SweepSettings;
  /** How tightly the picture is cropped on the fitted framing, 1 being it. */
  zoom: number;
};

/**
 * Real-time renderer for the device scene.
 *
 * There is no accumulator, no sample budget, no convergence and no settle
 * window. A frame is one `render()` call, so the only question is whether
 * anything changed since the last one.
 */
export class RasterRenderer {
  private built: DeviceScene | null = null;
  private disposed = false;
  private loading: Promise<void> | null = null;
  private lastKey = "";
  private pointer = new THREE.Vector2();
  private raycaster = new THREE.Raycaster();
  private settings: RasterSettings | null = null;
  /** Reused across frames, because a fresh one per frame is garbage per frame. */
  private signature: Uint8Array | null = null;
  // Remembered so a scene that finishes loading after the canvas was sized
  // still adopts the correct aspect. Without this the camera keeps its
  // constructor default of 1 and renders a tall phone square.
  private viewport = { height: 0, width: 0 };
  private pixelRatio = 0;
  private pose: Pose | null = null;
  private lastEnvironment = "";
  private lastLiveKey = "";
  /** Set when a request arrived mid-load, so it can be served afterwards. */
  private pendingReady: (() => void) | null = null;
  /** Called when a swapped-in studio has finished convolving. */
  onEnvironmentReady: (() => void) | null = null;

  readonly renderer: THREE.WebGLRenderer;

  /**
   * How much depth map to spend, against what the preview uses.
   *
   * The preview is redrawn on every drag and has to hold a frame rate; an
   * export is drawn once and looked at closely, so the two want different
   * answers to the same question. This is the multiplier the export turns up.
   */
  private readonly shadowDetail: number;

  constructor(
    canvas: HTMLCanvasElement,
    options?: { antialias?: boolean; shadowDetail?: number },
  ) {
    this.shadowDetail = Math.max(1, options?.shadowDetail ?? 1);
    this.renderer = new THREE.WebGLRenderer({
      alpha: true,
      // Multisampling resolves edges by shading several samples per pixel, so
      // it multiplies the most expensive part of the frame. Drawing at two
      // device pixels per CSS pixel already resolves them by supersampling,
      // and paying for both is the difference between six and twenty-three
      // million samples a frame for an edge nobody can tell apart. It stays on
      // where there is no supersampling to lean on.
      antialias: options?.antialias ?? true,
      canvas,
    });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    // Percentage-closer filtering, which is the only path in this version of
    // three that reads the shadow's blur radius at all: `PCFSoftShadowMap` is
    // absent from its define table and silently falls through to the
    // unfiltered one, which is how a rig built around a soft key was drawing a
    // stair-stepped edge and ignoring every attempt to change it.
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    // The shadow depends on the light and the object, not on where the camera
    // is looking from. Left on automatic, three.js redraws the whole scene into
    // a 2048-square depth map on every frame, so an orbit — which moves neither
    // the light nor the object — costs two full passes instead of one.
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;
  }

  /** The shadow is stale: redraw the depth map on the next frame. */
  private invalidateShadow(): void {
    this.renderer.shadowMap.needsUpdate = true;
  }

  get ready(): boolean {
    return this.built !== null;
  }

  /** Highest anisotropy this context supports, for the display texture. */
  get maxAnisotropy(): number {
    return this.renderer.capabilities.getMaxAnisotropy();
  }

  /** Rebuild only when something the scene is actually made of has changed. */
  async update(settings: RasterSettings, onReady: () => void): Promise<void> {
    if (this.disposed) return;

    this.settings = settings;
    this.renderer.toneMappingExposure = settings.exposure / 100;

    // Only the model and the studio decide whether a scene has to be built.
    // Everything else — the rig, the finish, the ground — is applied to the
    // scene already on screen, so moving a light no longer re-decodes a 21MB
    // device or re-convolves an environment.
    const key = JSON.stringify([settings.device]);
    if (key === this.lastKey && this.built) {
      this.applyLiveSettings(settings);
      return;
    }
    // A device takes seconds to decode, and anything the app asks for in that
    // window would be lost if it were simply ignored: a studio preset applies
    // on first paint, and a second device picked while the first is still
    // loading is a normal impatient thing to do. Both are remembered and
    // replayed once the load settles, against whatever the settings are then.
    if (this.loading) {
      this.pendingReady = onReady;
      return;
    }

    this.lastKey = key;
    this.loading = buildDeviceScene({
      backgroundColor: settings.backgroundColor,
      device: readDeviceDefinition(settings.device),
      environmentUrl: `${import.meta.env.BASE_URL}hdri/${settings.environment}.hdr`,
      finish: readFinishId(settings.finish),
      floor: settings.floor,
      lighting: settings.lighting,
      shadowDetail: this.shadowDetail,
      // A tabletop's maps land after the frame that asked for them, so the
      // frame has to be asked for again. Without this the slab sits
      // untextured until something else happens to invalidate it, which on a
      // preset applied at load is "until the user touches a control".
      onSurfaceReady: () => {
        if (this.disposed) return;
        this.invalidateShadow();
        this.onEnvironmentReady?.();
      },
      partColors: settings.partColors,
      renderer: this.renderer,
      showGround: settings.showBackground,
      surface: settings.surface,
      sweep: settings.sweep,
    })
      .then((scene) => {
        if (this.disposed) {
          scene.dispose();
          return;
        }
        this.built?.dispose();
        this.built = scene;
        this.lastEnvironment = settings.environment;
        this.lastLiveKey = "";
        // The settings this scene was built from are already history: the
        // preset that runs on mount writes a dozen of them while the first
        // model is still decoding. What is current now is what the scene has
        // to show.
        this.applyLiveSettings(this.settings ?? settings);
        this.invalidateShadow();
        this.applyViewport();
        onReady();
      })
      .catch((error: unknown) => {
        // Loudly. A build that fails leaves the previous device on screen while
        // every control reads the new one, which is indistinguishable from the
        // app ignoring the click — and swallowing it is how a dead-zone read in
        // the shadow sizing survived several sweeps. The previous scene is
        // still better than a blank canvas, and the key is cleared so the next
        // change retries, but it does not happen quietly.
        console.error("Device scene build failed", error);
        this.lastKey = "";
      })
      .finally(() => {
        this.loading = null;
        this.drainPending();
      });
  }

  /**
   * Serve whatever was asked for while a device was loading.
   *
   * Only the latest request matters — clicking through three devices should
   * load the third, not all three in turn — so this replays the current
   * settings once rather than a queue.
   */
  private drainPending(): void {
    const onReady = this.pendingReady;
    const settings = this.settings;
    if (!onReady || !settings || this.disposed) return;
    this.pendingReady = null;
    void this.update(settings, onReady);
  }

  /**
   * Everything a scene can absorb without being rebuilt.
   *
   * Guarded by its own key because the settings object is rebuilt on every
   * store change, and during a drag that is every pointer move. Without the
   * guard a rotation repainted every material in the model, replaced the whole
   * light rig and rebuilt the ground sixty times a second, none of which had
   * changed.
   */
  private applyLiveSettings(settings: RasterSettings): void {
    const built = this.built;
    if (!built) return;

    const key = JSON.stringify([
      settings.backgroundColor,
      settings.environment,
      settings.finish,
      settings.floor,
      settings.lighting,
      settings.showBackground,
      settings.spin,
      settings.transform,
      settings.surface,
      settings.sweep,
    ]);
    if (key === this.lastLiveKey) return;
    this.lastLiveKey = key;

    this.applyEnvironment(built, settings.environment);
    built.setFinish(readFinishId(settings.finish));
    built.setPartColors(settings.partColors);
    built.setLighting(settings.lighting);
    built.setSurface(settings.surface);
    built.setSweep(settings.sweep);
    built.setGround(settings.showBackground, settings.backgroundColor);
    built.setFloor(settings.floor);
    built.setTransform({ ...settings.transform, spin: settings.spin });
    // Colour, lights and the ground plane all feed the depth map.
    this.invalidateShadow();
  }

  /**
   * Swap the captured studio in place.
   *
   * Convolving is cached per renderer, so returning to a studio already used is
   * free; the first use of one pays for it once and never again.
   */
  private applyEnvironment(built: DeviceScene, environment: string): void {
    if (environment === this.lastEnvironment) return;
    this.lastEnvironment = environment;
    const url = `${import.meta.env.BASE_URL}hdri/${environment}.hdr`;
    void loadEnvironment(this.renderer, url)
      .then((texture) => {
        if (this.disposed || this.built !== built) return;
        built.setEnvironment(texture);
        this.onEnvironmentReady?.();
      })
      .catch(() => {
        // A studio that fails to load leaves the previous one lighting the
        // scene; the next change retries.
        this.lastEnvironment = "";
      });
  }

  setArtwork(texture: THREE.Texture | null, transform?: ScreenTransform): void {
    this.built?.setArtwork(texture, transform);
  }

  /**
   * Point the camera. Direction comes from the pose; distance is derived from
   * the subject and the current field of view so the device stays framed at any
   * focal length — and at any size, from a watch to a laptop.
   */
  setPose(pose: Pose): void {
    // Remembered because the framing distance is derived from the viewport
    // aspect, so a resize has to re-derive it from the pose already in force.
    this.pose = pose;
    const built = this.built;
    const settings = this.settings;
    if (!built || !settings) return;

    const basis = readFitBasis(pose);

    /**
     * The shape of the frame, taken from the frame rather than from the camera.
     *
     * `setViewOffset` assigns `camera.aspect` from the full size it is handed,
     * and `clearViewOffset` never puts the old value back. Reading the camera
     * therefore means one shifted framing can leave a stale aspect behind and
     * every later pose gets fitted to a frame that is not the one being drawn.
     * The viewport is what the picture is actually going into, so it is what
     * the camera is told.
     */
    const aspect =
      this.viewport.width > 0 && this.viewport.height > 0
        ? this.viewport.width / this.viewport.height
        : built.camera.aspect;
    built.camera.aspect = aspect;

    // 36mm full-frame equivalent, so the focal length control means what it
    // means on a real camera body.
    built.camera.fov = fovDegreesFor(settings.focalLength);
    const halfFovRad = THREE.MathUtils.degToRad(built.camera.fov) / 2;

    const held = heldBox(built.framing, built.standTop, aspect);
    const centre = held.getCenter(new THREE.Vector3());
    const distance = fitDistance({
      aspect,
      basis,
      box: held,
      halfFovRad,
      // A frame cut from the set has no composition rule to obey: the whole
      // point of it is that the set reaches its edges. Standing back far enough
      // to leave the usual air would make the picture smaller than the frame it
      // was measured for, which on a tall subject is most of the picture.
      subjectRadius: settings.fit === "scene" ? 0 : built.subjectRadius,
    });

    built.camera.position
      .copy(basis.direction)
      .multiplyScalar(distance)
      .add(centre);
    built.camera.up.copy(basis.up);
    built.camera.lookAt(centre);

    /**
     * Crop, rather than move.
     *
     * Zoom narrows the projection and leaves the camera where the fit put it,
     * which is the only way it can be a size control and nothing else.
     * Perspective is a property of where the camera is standing: dolly in and
     * a long lens stops being a long lens. This way the focal length keeps
     * meaning exactly one thing — how compressed the picture is — and the zoom
     * keeps meaning exactly one thing, how much of the frame the subject
     * fills. Past one it crops, which is the point of having it.
     */
    built.camera.zoom = Math.max(0.05, settings.zoom);

    /**
     * And shift, rather than swing.
     *
     * Moving the subject off centre by turning the camera towards one side
     * converges the verticals — the table starts to lean — because the picture
     * plane is no longer parallel to what is in front of it. Offsetting the
     * projection instead is what a shift lens does on a real camera and what
     * an architectural photographer reaches for: the same view, framed off
     * centre, with everything still standing up straight.
     */
    // The pad reads -1..1 about its centre, and the handle marks where the
    // subject should sit, so the frustum moves the opposite way. A third of a
    // frame at full deflection leaves the device near the edge with the whole
    // of the other side free, which is as far as a headline ever needs.
    const shift = 0.35;
    const across2 = -settings.framing.x * shift;
    const down = -settings.framing.y * shift;
    if (Math.abs(across2) > 1e-4 || Math.abs(down) > 1e-4) {
      // Full size and window size are the same, so only the offset counts —
      // but the units cannot be anything, because `setViewOffset` takes the
      // full size as the camera's aspect. Handing it a unit square projected a
      // square picture into whatever shape the canvas actually was, which
      // squashed the entire scene sideways on every frame that was not itself
      // square, in the preview and in the export. The full size is the frame's
      // shape, and the sideways offset carries that shape with it so it stays
      // the same fraction of the picture it always was.
      built.camera.setViewOffset(aspect, 1, across2 * aspect, down, aspect, 1);
    } else if (built.camera.view?.enabled) {
      built.camera.clearViewOffset();
    }
    built.camera.updateProjectionMatrix();
    // A camera move that resizes the set leaves the depth map drawn for the
    // set that was there before. Without this the wall behind the device keeps
    // whichever shadow it happened to be given, and the same settings render
    // two different pictures depending on what else invalidated in between.
    if (built.onCameraMoved()) this.invalidateShadow();
  }

  /**
   * Resize the drawing buffer, and only actually do it when it changed.
   *
   * `WebGLRenderer.setSize` assigns to `canvas.width` and `canvas.height`, and
   * the HTML spec says assigning those reallocates and clears the drawing
   * buffer whether or not the value differs. With multisampling and a depth
   * attachment on a retina-sized canvas that is the most expensive single
   * thing this renderer can be asked to do, and it stalls the pipeline. Called
   * once per pointer move — which is what a rotation used to do — it costs far
   * more than drawing the frame.
   */
  setSize(width: number, height: number, pixelRatio: number): void {
    if (this.disposed || width <= 0 || height <= 0) return;
    if (
      width === this.viewport.width &&
      height === this.viewport.height &&
      pixelRatio === this.pixelRatio
    ) {
      return;
    }
    this.viewport = { height, width };
    this.pixelRatio = pixelRatio;
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
    this.applyViewport();
  }

  private applyViewport(): void {
    const { height, width } = this.viewport;
    if (!this.built || width <= 0 || height <= 0) return;
    // A narrower viewport needs the camera further back to keep the device in
    // frame, so the pose is re-derived against the new aspect. `setPose` reads
    // the aspect off the viewport itself, so it needs nothing set up first;
    // with no pose to re-derive there is only the projection to match.
    if (this.pose) {
      this.setPose(this.pose);
      return;
    }
    this.built.camera.aspect = width / height;
    this.built.camera.updateProjectionMatrix();
  }

  /** Is the device under this client point? Misses fall through to viewport pan. */
  hitTest(clientX: number, clientY: number): boolean {
    const built = this.aim(clientX, clientY);
    if (!built) return false;

    // Only the device counts. The ground fills the frame, so including it would
    // make every drag a rotation and leave no way to pan.
    return this.raycaster.intersectObject(built.subject, true).length > 0;
  }

  /**
   * Where on the display this client point lands, in the design's own
   * coordinates, or null if the point is not on a screen.
   *
   * Reading the UV rather than projecting the pointer onto a plane keeps the
   * drag correct at any camera angle: the design tracks the pointer across a
   * screen seen almost edge-on exactly as it does head-on.
   */
  hitScreenUV(clientX: number, clientY: number): { u: number; v: number } | null {
    const built = this.aim(clientX, clientY);
    if (!built || built.screenMeshes.length === 0) return null;

    const hit = this.raycaster
      .intersectObjects(built.screenMeshes, false)
      .find((intersection) => intersection.uv);
    return hit?.uv ? { u: hit.uv.x, v: hit.uv.y } : null;
  }

  /** How much of the design is currently cropped, per axis. */
  screenSlack(): { x: number; y: number } {
    return this.built?.getScreenSlack() ?? { x: 0, y: 0 };
  }

  private aim(clientX: number, clientY: number): DeviceScene | null {
    if (this.disposed || !this.built) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;

    this.pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.built.camera);
    return this.built;
  }

  render(): void {
    if (this.disposed || !this.built) return;
    this.renderer.render(this.built.scene, this.built.camera);
  }

  /**
   * A signature of the frame just drawn, read back off the drawing buffer.
   *
   * The app has to be able to say what came out, not only what it asked for:
   * the orientation proof turns on the rendered pixels changing while the
   * pointer is still down, and a signature derived from the settings would
   * report a change whether or not anything was drawn.
   *
   * A strip the full width of the frame and four rows tall, across its middle.
   * That crosses the device, both of its edges and the backdrop either side of
   * it, so nothing can turn without changing it — a small square in the centre
   * can sit on a flat part of a screenshot and hold still through a rotation.
   * Shape is free: the cost here is the pipeline stall that reading at all
   * forces, measured at 0.21ms for anything from one pixel up to a full-width
   * strip, against 24ms for the whole frame. So the strip is as much of the
   * picture as can be had for the price of the cheapest possible read.
   *
   * Valid only in the same task as `render`. Once the frame is presented the
   * buffer is cleared, and without `preserveDrawingBuffer` — which costs a
   * copy of every frame whether or not anyone reads it — there is nothing left
   * to sample.
   */
  sampleSignature(): string {
    if (this.disposed || !this.built) return "";
    const context = this.renderer.getContext();
    const width = this.renderer.domElement.width;
    const height = this.renderer.domElement.height;
    if (width <= 0 || height <= 0) return "";

    const wanted = width * SIGNATURE_ROWS * 4;
    if (!this.signature || this.signature.length !== wanted) {
      this.signature = new Uint8Array(wanted);
    }
    context.readPixels(
      0,
      Math.max(0, Math.floor(height / 2) - SIGNATURE_ROWS / 2),
      width,
      SIGNATURE_ROWS,
      context.RGBA,
      context.UNSIGNED_BYTE,
      this.signature,
    );

    return fingerprint(this.signature);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.pendingReady = null;
    this.built?.dispose();
    this.renderer.dispose();
  }
}
