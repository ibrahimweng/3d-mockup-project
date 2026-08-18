import * as THREE from "three";

import type { DeviceDefinition } from "../product-domain";

/**
 * Build the display texture for a device, mirroring the source when that
 * device's screen UVs are mirrored.
 *
 * The mirror is baked into the bitmap rather than expressed as a negative
 * `texture.repeat`, because the fit maths already writes repeat on one axis and
 * a signed repeat did not reliably mirror both axes. Drawing the source once
 * into a canvas is deterministic, costs one blit per screenshot rather than per
 * frame, and leaves the fit/scale/stretch maths working on positive magnitudes.
 */
export function createScreenTexture(
  image: HTMLImageElement,
  device: DeviceDefinition,
): THREE.Texture {
  const flipX = device.screenFlip?.x === true;
  const flipY = device.screenFlip?.y === true;

  const texture = flipX || flipY ? mirrored(image, flipX, flipY) : plain(image);
  texture.colorSpace = THREE.SRGBColorSpace;
  // These models' own UVs expect a top-down texture, matching how their stock
  // wallpaper was authored.
  texture.flipY = false;
  texture.needsUpdate = true;
  return texture;
}

function plain(image: HTMLImageElement): THREE.Texture {
  return new THREE.Texture(image);
}

function mirrored(
  image: HTMLImageElement,
  flipX: boolean,
  flipY: boolean,
): THREE.Texture {
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);

  const context = canvas.getContext("2d");
  if (!context) return plain(image);

  context.translate(flipX ? canvas.width : 0, flipY ? canvas.height : 0);
  context.scale(flipX ? -1 : 1, flipY ? -1 : 1);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  return new THREE.CanvasTexture(canvas);
}
