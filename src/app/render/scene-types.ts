import type * as THREE from "three";

import type {
  ArtworkZoneId,
  FinishId,
  LightPatternId,
} from "../product-domain";
import type { PartColors } from "./model-appearance";
import type { ScreenSlack, ScreenTransform } from "./screen-mapping";

/**
 * What a built scene is, and what can be asked of it once it exists.
 *
 * Gathered here because these are the contract between the renderer and the
 * scene rather than part of building one: every field is either a setting the
 * app can change without a rebuild, or a handle the camera needs.
 */

/**
 * How the floor behaves under the device.
 *
 * A matte floor takes a shadow and nothing else, which is what a paper sweep
 * does. A polished one also carries the device's reflection, which is most of
 * what makes the references read as photographs rather than renders.
 */
export type SurfaceSettings = {
  /**
   * Whether the device stands on a table, and which one.
   *
   * "none" is the app as it was: an endless floor that dissolves at its rim.
   * That dissolve is right for a backdrop and is exactly why a backdrop can
   * never be furniture — a table is defined by the thing a sweep exists to
   * hide, which is an edge with a lit top on one side of it and a shaded face
   * on the other.
   */
  kind: string;
};
export type SweepSettings = {
  /**
   * How wide the cove is, 0 a corner and 1 a broad cyclorama.
   *
   * The bend is what makes a backdrop graduate. A surface curving away from
   * the light turns a little further from it with every step up, so the tone
   * falls off across the curve on its own — no painted gradient, and it takes
   * a shadow and bounces onto the device while it is at it.
   */
  curve: number;
  /** How far the sweep rises behind the device, 0 leaving a bare floor. */
  height: number;
  /**
   * A lamp tucked into the cove, lighting the paper rather than the device.
   *
   * This is the one light in the rig with any falloff, and it is here because
   * the graduation a backdrop is prized for cannot come from anywhere else.
   * The key, the fill and the rim are all directional or hemispherical: they
   * arrive as parallel rays with no notion of distance, so a large flat wall
   * under them comes back one even tone however it is shaped. A photographer
   * solves this exactly this way, with a small light on the floor behind the
   * subject aimed at the paper.
   */
  light: number;
};
export type FloorSettings = {
  /**
   * How much of the captured room the floor picks up, 0 to 1.
   *
   * Separate from the device's own environment response, because the two want
   * opposite things: metal needs a bright capture to have anything to reflect,
   * while a floor given the same capture turns grey. The floor is very large
   * and most of it is seen at a grazing angle, where reflectance approaches
   * total — so a black floor under a bright room reads as a grey sheet with a
   * horizon, which is the opposite of a void.
   */
  environment: number;
  /**
   * How much of the device's reflection shows, 0 to 1.
   *
   * Zero leaves the floor exactly as it was. Anything above draws the device a
   * second time, mirrored beneath the floor, and lets it show through.
   */
  reflection: number;
  /** Surface roughness of the floor itself, 0 polished to 1 matte. */
  roughness: number;
};
/**
 * How the device is standing.
 *
 * Angles are degrees, scale is a multiplier where 1 is the model's own size,
 * and the offsets are fractions of the device's radius rather than scene
 * units, so the same numbers place any model the same way.
 */
export type DeviceTransform = {
  offsetX: number;
  offsetY: number;
  offsetZ: number;
  roll: number;
  scale: number;
  spin: number;
  tilt: number;
};

export type DeviceScene = {
  camera: THREE.PerspectiveCamera;
  dispose: () => void;
  /**
   * How much of the design is cropped on each axis, 0..1.
   *
   * Dragging can only move the design across what is actually hidden, so this
   * is what converts a pointer delta into an offset delta.
   */
  getScreenSlack: () => ScreenSlack;
  /** The display meshes, for hit testing the screen apart from the body. */
  screenMeshes: THREE.Mesh[];
  /** Repaint the shell without rebuilding anything. */
  setFinish: (finish: FinishId) => void;
  /** Repaint the product's named parts without rebuilding anything. */
  setPartColors: (colors: PartColors) => void;
  /** Recolour the blank cloth a design is printed on, panels and plain alike. */
  setBlankStock: (hex: string | undefined) => void;
  /** Move and re-balance the rig without rebuilding anything. */
  setLighting: (lighting: LightingSettings) => void;
  /** Show, hide, and recolour the ground without rebuilding anything. */
  setGround: (visible: boolean, color: string) => void;
  /** Change the floor's finish and how much reflection it carries. */
  setFloor: (floor: FloorSettings) => void;
  /** Raise or lower the paper behind the device. */
  setSweep: (sweep: SweepSettings) => void;
  /** Stand the device on a table, or take it away again. */
  setSurface: (surface: SurfaceSettings) => void;
  /** Re-judge the reflection after the camera has been placed. */
  /** Returns whether the set was recut, and so whether the shadow is stale. */
  onCameraMoved: () => boolean;
  /** Swap the captured studio without rebuilding anything. */
  setEnvironment: (environment: THREE.Texture) => void;
  /**
   * Stand the device somewhere, turned some way, at some size.
   *
   * Returns whether the pose actually changed, so a redraw is only spent when
   * there is something new to draw.
   */
  setTransform: (transform: DeviceTransform) => boolean;
  /** The device geometry, so a hit test can ignore the ground. */
  subject: THREE.Object3D;
  /**
   * Put a design on each of the product's zones.
   *
   * Every zone the product declares is written on every call, including the
   * ones the map has nothing for: a zone left out is a zone cleared, which is
   * what returns it to the template the file ships with rather than leaving
   * the last upload on it after the slot was emptied.
   */
  setArtwork: (
    textures: ReadonlyMap<ArtworkZoneId, THREE.Texture | null>,
    transform?: ScreenTransform,
  ) => void;
  scene: THREE.Scene;
  /** Bounding sphere radius of the device, for framing. */
  subjectRadius: number;
  /**
   * Everything the camera is meant to hold, as a box in world space.
   *
   * The device alone with nothing under it; the device and its furniture when
   * there is furniture. Framing off the subject's radius alone is right for a
   * device standing on an endless floor and wrong the moment it is standing on
   * something — a table is four times the width of the laptop on it, so the
   * shot that framed the laptop cropped three quarters of the table away.
   *
   * Mutated in place when the surface changes, so the camera has one thing to
   * read rather than a rule per surface.
   */
  framing: THREE.Box3;
  /**
   * The height the device is standing at.
   *
   * Everything below it is furniture: the table's sides and its legs. A frame
   * that has to hold all of that spends its height on legs, which reads well
   * on a square canvas and leaves a wide one mostly floor.
   */
  standTop: number;
  target: THREE.Vector3;
};
export type LightingSettings = {
  /** How strongly the captured studio itself lights the device. */
  environmentIntensity: number;
  /** Bounce from below and behind, lifting the shadow side. */
  fillIntensity: number;
  keyColor: string;
  keyIntensity: number;
  /** Where the key sits, -1..1 per axis with 0 straight on. */
  keyDirection: { x: number; y: number };
  /** A hard edge light behind the device, separating it from the ground. */
  rimIntensity: number;
  /**
   * How wide the key's shadow spreads, 0 for a cut edge and 1 for a haze.
   *
   * This is the size of the light source, expressed as its only visible
   * consequence. A bare bulb is a point and throws an edge you could cut round;
   * a metre-square softbox throws one that takes a hand's width to fade. Every
   * light in this rig is directional, which means infinitely far away and
   * infinitely small, so the shadow is where its apparent size has to be told.
   */
  shadowSoftness: number;
  /** What the key shines through: nothing, a window, or a set of blinds. */
  pattern: LightPatternId;
};
