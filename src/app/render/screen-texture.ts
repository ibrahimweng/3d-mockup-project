import * as THREE from "three";

import type { DeviceDefinition } from "../product-domain";

/**
 * How the user has rotated or flipped the uploaded design.
 *
 * This is the runtime's own media transform, written by the rotate and flip
 * actions the runtime renders under the uploader. Product code consumes it
 * rather than keeping a second copy of the same intent.
 */
export type DesignTransform = {
  flipHorizontal?: boolean;
  flipVertical?: boolean;
  rotationDeg?: 0 | 90 | 180 | 270;
};

/**
 * Build the display texture for a device.
 *
 * Two independent transforms land here. The first is the user's: rotate and
 * flip, straight off the runtime's media actions. The second is the device's:
 * each model authors its screen UVs however its creator unwrapped them, so a
 * design that reads correctly on one panel arrives mirrored on another.
 *
 * Both are baked into the bitmap rather than expressed as a signed
 * `texture.repeat`, because the fit maths already writes repeat on one axis.
 * Drawing the source once into a canvas costs one blit per change rather than
 * per frame, and leaves the fit maths working on positive magnitudes.
 */
export function createScreenTexture(
  image: HTMLImageElement,
  device: DeviceDefinition,
  design?: DesignTransform,
  /**
   * Highest anisotropy the renderer supports.
   *
   * A display is almost never seen square on, and a foreshortened surface
   * sampled without anisotropy takes a mip level chosen for its *narrowest*
   * axis — so the whole panel blurs to match the direction that happens to be
   * most compressed. This is the single largest thing standing between a
   * screenshot on a tilted screen and a legible one.
   */
  maxAnisotropy = 1,
  /**
   * The colour to lay the design over, for a surface that is printed on.
   *
   * A real print file is a mark on nothing: the areas that are not ink are
   * transparent, because the garment is what shows through them. Bound
   * straight to an opaque material that is not what happens — three.js
   * samples the colour channels and ignores alpha, and a transparent pixel
   * is stored as black with zero alpha, so an entire panel comes out black
   * behind the logo. Compositing here rather than making the material
   * transparent keeps the surface opaque, which matters on a garment whose
   * front and back panels overlap and would otherwise have to be sorted
   * against each other every frame.
   *
   * Undefined for a display, and deliberately: a screenshot with transparent
   * corners showing black is what a real screen does.
   */
  background?: string,
): THREE.Texture {
  const rotationDeg = design?.rotationDeg ?? 0;
  const userFlipX = design?.flipHorizontal === true;
  const userFlipY = design?.flipVertical === true;
  const deviceFlipX = device.screenFlip?.x === true;
  const deviceFlipY = device.screenFlip?.y === true;

  const untouched =
    background === undefined &&
    rotationDeg === 0 &&
    !userFlipX &&
    !userFlipY &&
    !deviceFlipX &&
    !deviceFlipY;

  const texture = untouched
    ? new THREE.Texture(image)
    : bake(image, {
        background,
        deviceFlipX,
        deviceFlipY,
        rotationDeg,
        userFlipX,
        userFlipY,
      });

  dressTexture(texture, maxAnisotropy);
  return texture;
}

/** How every design is sampled, still or moving. */
function dressTexture(texture: THREE.Texture, maxAnisotropy: number): void {
  texture.anisotropy = Math.max(1, maxAnisotropy);
  texture.colorSpace = THREE.SRGBColorSpace;
  // Trilinear between mip levels rather than a hard switch, so a screen at a
  // shallow angle does not band where the level changes.
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  // These models' own UVs expect a top-down texture, matching how their stock
  // wallpaper was authored.
  texture.flipY = false;
  texture.needsUpdate = true;
}

type PaintOptions = {
  background?: string;
  deviceFlipX: boolean;
  deviceFlipY: boolean;
  rotationDeg: number;
  userFlipX: boolean;
  userFlipY: boolean;
};

/**
 * Draw one frame into a canvas already sized for it.
 *
 * Pulled out of `bake` so a design that moves can be redrawn into the same
 * canvas on every frame, through exactly the transforms the still path uses.
 * Two copies of this would be two chances for a video to arrive mirrored on a
 * panel where a photograph does not.
 */
function paintFrame(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  source: CanvasImageSource,
  width: number,
  height: number,
  options: PaintOptions,
): void {
  context.setTransform(1, 0, 0, 1, 0, 0);
  // Cleared rather than drawn over: a frame with transparency would otherwise
  // show the frame before it through its own holes.
  context.clearRect(0, 0, canvas.width, canvas.height);

  // Before the transforms, and covering the whole canvas rather than the
  // image: the design is drawn over this, so it has to be under every pixel
  // the design could reach.
  if (options.background !== undefined) {
    context.fillStyle = options.background;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }

  context.translate(canvas.width / 2, canvas.height / 2);
  // The device correction describes the panel rather than the design, so it
  // wraps what the user did instead of composing into it.
  context.scale(options.deviceFlipX ? -1 : 1, options.deviceFlipY ? -1 : 1);
  if (options.rotationDeg !== 0) {
    context.rotate((options.rotationDeg * Math.PI) / 180);
  }
  context.scale(options.userFlipX ? -1 : 1, options.userFlipY ? -1 : 1);
  context.drawImage(source, -width / 2, -height / 2, width, height);
}

/** A canvas sized for this design, and the context to keep drawing into it. */
function makeTarget(
  width: number,
  height: number,
  rotationDeg: number,
): { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D } | null {
  const quarterTurned = rotationDeg === 90 || rotationDeg === 270;
  const canvas = document.createElement("canvas");
  canvas.width = quarterTurned ? height : width;
  canvas.height = quarterTurned ? width : height;
  const context = canvas.getContext("2d");
  return context ? { canvas, context } : null;
}

function bake(image: HTMLImageElement, options: PaintOptions): THREE.Texture {
  const width = Math.max(1, image.naturalWidth || image.width);
  const height = Math.max(1, image.naturalHeight || image.height);
  const target = makeTarget(width, height, options.rotationDeg);
  if (!target) return new THREE.Texture(image);
  paintFrame(target.context, target.canvas, image, width, height, options);
  return new THREE.CanvasTexture(target.canvas);
}

/** A texture that can be given a new frame without being rebuilt. */
export type ScreenPainter = {
  /** Draw this frame onto the texture. */
  paint: (frame: CanvasImageSource) => void;
  texture: THREE.Texture;
};

/**
 * The same texture a still design gets, kept open for the next frame.
 *
 * Always canvas-backed, where a still may hand three.js the image directly:
 * there has to be something to redraw into. The size is the clip's, fixed at
 * open, so every frame lands on the same pixels and the fit maths that reads
 * `texture.image` sees one shape for the whole clip rather than one per frame.
 */
export function createScreenPainter(
  size: { height: number; width: number },
  device: DeviceDefinition,
  design?: DesignTransform,
  maxAnisotropy = 1,
  background?: string,
): ScreenPainter | null {
  const options = readPaintOptions(device, design, background);
  const width = Math.max(1, size.width);
  const height = Math.max(1, size.height);
  const target = makeTarget(width, height, options.rotationDeg);
  if (!target) return null;

  const texture = new THREE.CanvasTexture(target.canvas);
  dressTexture(texture, maxAnisotropy);
  return {
    paint: (frame) => {
      paintFrame(target.context, target.canvas, frame, width, height, options);
      texture.needsUpdate = true;
    },
    texture,
  };
}

function readPaintOptions(
  device: DeviceDefinition,
  design: DesignTransform | undefined,
  background: string | undefined,
): PaintOptions {
  return {
    background,
    deviceFlipX: device.screenFlip?.x === true,
    deviceFlipY: device.screenFlip?.y === true,
    rotationDeg: design?.rotationDeg ?? 0,
    userFlipX: design?.flipHorizontal === true,
    userFlipY: design?.flipVertical === true,
  };
}
