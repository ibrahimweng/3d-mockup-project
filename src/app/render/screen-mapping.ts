import * as THREE from "three";

import type { DeviceDefinition } from "../product-domain";

/**
 * Getting a picture onto a panel that was modelled, not drawn.
 *
 * Every device in the catalog carries its display as real geometry with
 * whatever unwrap its author gave it, which is rarely the square from nought
 * to one that a texture wants. This is the whole of that reconciliation: find
 * the panels, measure the shape they actually are, rebuild their coordinates
 * where the file's are unusable, and map the design into them.
 */

export type ScreenTransform = {
  fit: "fill" | "fit" | "stretch";
  /** Pan, 0..1 per axis with 0.5 centred. */
  offset: { x: number; y: number };
  /** Uniform zoom, as a percentage. */
  scale: number;
  /** Independent width/height, -1..1 per axis with 0 unstretched. */
  stretch: { x: number; y: number };
};
export type ScreenSlack = { x: number; y: number };
/**
 * Locate the display material by name, falling back to emission.
 *
 * A name lookup is exact but brittle across re-exports; ranking by emissive
 * strength finds the display anywhere, because a screen modelled as a lit panel
 * stays a lit panel even when its material is renamed. Ranking by size or by
 * largest texture does not work: on these phones two correctly-sized unlit
 * panels sit behind the real display and are never seen.
 */
export function findScreenMaterials(
  root: THREE.Object3D,
  materialName: string,
): THREE.MeshStandardMaterial[] {
  // Every material carrying the configured name, not just the first found. A
  // model can duplicate its display material across several meshes, and setting
  // only one instance leaves the visible panel showing its stock wallpaper --
  // or the panel the user is looking at unchanged while a hidden twin updates.
  const byName: THREE.MeshStandardMaterial[] = [];
  let byEmission: THREE.MeshStandardMaterial | null = null;
  let strongest = 0;

  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const material = object.material;
    if (
      Array.isArray(material) ||
      !(material instanceof THREE.MeshStandardMaterial)
    ) {
      return;
    }

    if (material.name === materialName) {
      if (!byName.includes(material)) byName.push(material);
      return;
    }

    const emissive = material.emissive;
    const strength = emissive ? emissive.r + emissive.g + emissive.b : 0;
    if (strength > strongest) {
      strongest = strength;
      byEmission = material;
    }
  });

  if (byName.length > 0) return byName;
  return byEmission ? [byEmission] : [];
}
/**
 * Measure the display's proportions from the mesh carrying its material.
 *
 * Taking the two largest axes of the local bounding box is correct for a flat
 * panel. A screen modelled at a tilt has depth in all three axes and reports a
 * height that is too small, which is why the catalog can override this.
 */
export function measureScreenAspect(
  root: THREE.Object3D,
  screenMaterials: readonly THREE.MeshStandardMaterial[],
  fallback: number,
): number {
  let aspect = fallback;
  root.traverse((object) => {
    if (
      !(object instanceof THREE.Mesh) ||
      !screenMaterials.includes(object.material as THREE.MeshStandardMaterial)
    ) {
      return;
    }
    object.geometry.computeBoundingBox();
    const box = object.geometry.boundingBox;
    if (!box) return;
    const size = box.getSize(new THREE.Vector3());
    const axes = [size.x, size.y, size.z].sort((a, b) => b - a);
    if (axes[0] > 0 && axes[1] > 0) aspect = axes[1] / axes[0];
  });
  return aspect;
}
/**
 * Map the screen controls onto a texture's repeat/offset.
 *
 * `repeat` below 1 zooms *in*, because it is how much of the texture spans the
 * surface rather than how large the image is drawn — so every factor here is
 * inverted relative to how the control reads.
 */
export function applyScreenTransform(
  texture: THREE.Texture,
  screenAspect: number,
  transform: ScreenTransform | undefined,
  slack: ScreenSlack,
): void {
  // Sampling outside 0..1 must clamp, not tile: a zoomed-in screenshot would
  // otherwise repeat itself around the edges of the display.
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  // Scale and stretch operate about the middle of the image rather than its
  // corner, so zooming keeps the subject centred instead of drifting.
  texture.center.set(0.5, 0.5);

  if (!transform) {
    texture.repeat.set(1, 1);
    texture.offset.set(0, 0);
    slack.x = 0;
    slack.y = 0;
    texture.needsUpdate = true;
    return;
  }

  // The panel is measured as height over width, because that is what reads
  // naturally for a device; an image is described the other way round. Both
  // are put in width-over-height here so the comparison below is between like
  // and like — mixing the two silently squared the error and cropped every
  // design far tighter than its aspect called for.
  const screenRatio = screenAspect > 0 ? 1 / screenAspect : 1;
  const image = texture.image as { height?: number; width?: number } | undefined;
  const imageAspect =
    image?.width && image?.height ? image.width / image.height : screenRatio;

  // Base fit. `fill` covers and crops, `fit` shows everything and leaves
  // margins, `stretch` ignores aspect entirely and distorts to the display.
  //
  // `repeat` is how much of the image spans the panel, so a number below one
  // magnifies and crops and a number above one leaves room. Covering and
  // containing are therefore reciprocals of each other, not the same number
  // moved to the other axis — which is what this was, so Fit cropped exactly
  // as hard as Fill did, on the opposite axis, and a square design on a
  // sixteen-by-ten display lost a fifth of its width off each side while the
  // control promised margins.
  let repeatX = 1;
  let repeatY = 1;
  if (transform.fit !== "stretch") {
    const ratio = imageAspect / screenRatio;
    const wider = ratio > 1;
    if (transform.fit === "fill") {
      if (wider) repeatX = 1 / ratio;
      else repeatY = ratio;
    } else if (wider) {
      repeatY = ratio;
    } else {
      repeatX = 1 / ratio;
    }
  }

  // Manual zoom on top of the fit.
  const zoom = Math.max(0.05, transform.scale / 100);
  repeatX /= zoom;
  repeatY /= zoom;

  // Stretch maps the pad's -1..1 onto a half-to-double factor per axis. It is
  // a power rather than a line so that the centre really is untouched and one
  // step either way squashes and extends by the same proportion.
  const stretchX = 2 ** transform.stretch.x;
  const stretchY = 2 ** transform.stretch.y;
  repeatX /= stretchX;
  repeatY /= stretchY;

  texture.repeat.set(repeatX, repeatY);

  // Pan across whatever is being cropped. With nothing cropped there is no
  // slack on that axis and the offset correctly does nothing.
  const slackX = Math.max(0, 1 - repeatX);
  const slackY = Math.max(0, 1 - repeatY);
  slack.x = slackX;
  slack.y = slackY;
  texture.offset.set(
    (Math.max(0, Math.min(1, transform.offset.x)) - 0.5) * slackX,
    (Math.max(0, Math.min(1, transform.offset.y)) - 0.5) * slackY,
  );

  texture.needsUpdate = true;
}
/**
 * Rebuild the display's texture coordinates from its own geometry.
 *
 * Panels are frequently unwrapped into a corner of a shared atlas, which is
 * right for a wallpaper baked into the file and wrong for a design supplied at
 * runtime — that design would land squeezed into part of the panel and cropped
 * by the rest. Doing it here rather than in the file keeps a supplied model
 * byte for byte as its author sent it.
 *
 * A display is flat, so the two axes it spans are the two with any extent, and
 * position maps to texture coordinate along them. The remaining axis is the
 * panel's own thickness and is ignored.
 */
export function unwrapScreen(meshes: readonly THREE.Mesh[]): void {
  for (const mesh of meshes) {
    // `Object3D.clone` shares geometry with its source, and the source is the
    // parsed model held in the cache for the life of the page. Writing to it
    // would reach every other scene built from the same file, so the panel
    // gets its own copy first. It is a handful of vertices.
    const geometry = mesh.geometry.clone();
    mesh.geometry = geometry;
    const position = geometry.getAttribute("position");
    if (!position) continue;

    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    if (!box) continue;
    const size = box.getSize(new THREE.Vector3()).toArray();
    const [horizontal, vertical] = [0, 1, 2]
      .sort((a, b) => size[b] - size[a])
      .slice(0, 2);
    if (!(size[horizontal] > 0) || !(size[vertical] > 0)) continue;

    const min = box.min.toArray();
    const uv = new Float32Array(position.count * 2);
    for (let index = 0; index < position.count; index += 1) {
      const point = [
        position.getX(index),
        position.getY(index),
        position.getZ(index),
      ];
      uv[index * 2] =
        (point[horizontal] - min[horizontal]) / size[horizontal];
      // Textures are uploaded unflipped, so v runs down from the top edge.
      uv[index * 2 + 1] = 1 - (point[vertical] - min[vertical]) / size[vertical];
    }
    geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  }
}
