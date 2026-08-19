import * as THREE from "three";

import { readDeviceDefinition, readFinishId } from "../product-domain";
import {
  buildDeviceScene,
  loadEnvironment,
  type DeviceScene,
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
  private lastEnvironment = "";
  /** Called when a swapped-in studio has finished convolving. */
  onEnvironmentReady: (() => void) | null = null;

  readonly renderer: THREE.WebGLRenderer;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      canvas,
    });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    // Soft percentage-closer filtering. The shadow exists to ground the device,
    // and a hard-edged one reads as a cutout pasted onto the backdrop.
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  get ready(): boolean {
    return this.built !== null;
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
    if (this.loading) return;

    this.lastKey = key;
    this.loading = buildDeviceScene({
      backgroundColor: settings.backgroundColor,
      device: readDeviceDefinition(settings.device),
      environmentUrl: `${import.meta.env.BASE_URL}hdri/${settings.environment}.hdr`,
      finish: readFinishId(settings.finish),
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
        this.applyLiveSettings(settings);
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
      });
  }

  /** Everything a scene can absorb without being rebuilt. */
  private applyLiveSettings(settings: RasterSettings): void {
    const built = this.built;
    if (!built) return;
    this.applyEnvironment(built, settings.environment);
    built.setFinish(readFinishId(settings.finish));
    built.setLighting(settings.lighting);
    built.setGround(settings.showBackground, settings.backgroundColor);
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
  }

  setSize(width: number, height: number, pixelRatio: number): void {
    if (this.disposed || width <= 0 || height <= 0) return;
    this.viewport = { height, width };
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
    this.applyViewport();
  }

  private applyViewport(): void {
    const { height, width } = this.viewport;
    if (!this.built || width <= 0 || height <= 0) return;
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

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.built?.dispose();
    this.renderer.dispose();
  }
}
