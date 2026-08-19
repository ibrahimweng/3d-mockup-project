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
): THREE.Texture {
  const rotationDeg = design?.rotationDeg ?? 0;
  const userFlipX = design?.flipHorizontal === true;
  const userFlipY = design?.flipVertical === true;
  const deviceFlipX = device.screenFlip?.x === true;
  const deviceFlipY = device.screenFlip?.y === true;

  const untouched =
    rotationDeg === 0 &&
    !userFlipX &&
    !userFlipY &&
    !deviceFlipX &&
    !deviceFlipY;

  const texture = untouched
    ? new THREE.Texture(image)
    : bake(image, {
        deviceFlipX,
        deviceFlipY,
        rotationDeg,
        userFlipX,
        userFlipY,
      });

  texture.colorSpace = THREE.SRGBColorSpace;
  // These models' own UVs expect a top-down texture, matching how their stock
  // wallpaper was authored.
  texture.flipY = false;
  texture.needsUpdate = true;
  return texture;
}

function bake(
  image: HTMLImageElement,
  options: {
    deviceFlipX: boolean;
    deviceFlipY: boolean;
    rotationDeg: number;
    userFlipX: boolean;
    userFlipY: boolean;
  },
): THREE.Texture {
  const width = Math.max(1, image.naturalWidth || image.width);
  const height = Math.max(1, image.naturalHeight || image.height);
  const quarterTurned =
    options.rotationDeg === 90 || options.rotationDeg === 270;

  const canvas = document.createElement("canvas");
  canvas.width = quarterTurned ? height : width;
  canvas.height = quarterTurned ? width : height;

  const context = canvas.getContext("2d");
  if (!context) return new THREE.Texture(image);

  context.translate(canvas.width / 2, canvas.height / 2);
  // The device correction describes the panel rather than the design, so it
  // wraps what the user did instead of composing into it.
  context.scale(options.deviceFlipX ? -1 : 1, options.deviceFlipY ? -1 : 1);
  if (options.rotationDeg !== 0) {
    context.rotate((options.rotationDeg * Math.PI) / 180);
  }
  context.scale(options.userFlipX ? -1 : 1, options.userFlipY ? -1 : 1);
  context.drawImage(image, -width / 2, -height / 2, width, height);

  return new THREE.CanvasTexture(canvas);
}
