import * as THREE from "three";

import { readDeviceDefinition, readFinishId } from "../product-domain";
import {
  buildDeviceScene,
  loadEnvironment,
  type DeviceScene,
  type FloorSettings,
  type LightingSettings,
  type ScreenTransform,
} from "./device-scene";

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
  floor: FloorSettings;
  focalLength: number;
  lighting: LightingSettings;
  showBackground: boolean;
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

  constructor(canvas: HTMLCanvasElement, options?: { antialias?: boolean }) {
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
    // Soft percentage-closer filtering. The shadow exists to ground the device,
    // and a hard-edged one reads as a cutout pasted onto the backdrop.
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
      renderer: this.renderer,
      showGround: settings.showBackground,
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
      .catch(() => {
        // A failed load leaves the previous scene visible rather than blanking
        // the canvas; the key is cleared so the next change retries.
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
    ]);
    if (key === this.lastLiveKey) return;
    this.lastLiveKey = key;

    this.applyEnvironment(built, settings.environment);
    built.setFinish(readFinishId(settings.finish));
    built.setLighting(settings.lighting);
    built.setGround(settings.showBackground, settings.backgroundColor);
    built.setFloor(settings.floor);
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

    const direction = new THREE.Vector3(
      pose.position[0],
      pose.position[1],
      pose.position[2],
    );
    if (direction.lengthSq() < 1e-6) direction.set(0, 0.6, 3.4);
    direction.normalize();

    // 36mm full-frame equivalent, so the focal length control means what it
    // means on a real camera body.
    built.camera.fov =
      2 * Math.atan(36 / (2 * settings.focalLength)) * (180 / Math.PI);

    const halfFov = THREE.MathUtils.degToRad(built.camera.fov) / 2;
    const aspectCorrection =
      built.camera.aspect < 1 ? 1 / built.camera.aspect : 1;
    const distance =
      ((built.subjectRadius * 1.25) / Math.tan(halfFov)) * aspectCorrection;

    built.camera.position.copy(direction.multiplyScalar(distance));
    built.camera.up.set(pose.up[0], pose.up[1], pose.up[2]);
    built.camera.lookAt(built.target);
    built.camera.updateProjectionMatrix();
    built.onCameraMoved();
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
    this.built.camera.aspect = width / height;
    this.built.camera.updateProjectionMatrix();
    // A narrower viewport needs the camera further back to keep the device in
    // frame, so the pose is re-derived against the new aspect.
    if (this.pose) this.setPose(this.pose);
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

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.pendingReady = null;
    this.built?.dispose();
    this.renderer.dispose();
  }
}
