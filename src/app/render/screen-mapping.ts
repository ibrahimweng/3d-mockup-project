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
  /**
   * One design across every panel that prints, at one size.
   *
   * The other fields describe a design placed *on* a surface; this one says it
   * is not placed at all. An all-over print is cloth printed before it was cut,
   * so the design repeats at a physical size and each panel shows however much
   * of that repeat it is big enough to hold -- which is why the fit, the pan
   * and the stretch all stop meaning anything while it is on.
   */
  allOver: boolean;
  fit: "fill" | "fit" | "stretch";
  /** Pan, 0..1 per axis with 0.5 centred. */
  offset: { x: number; y: number };
  /** How many times an all-over design repeats across the front. */
  repeats: number;
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
 * Taking the two largest axes of the bounding box is correct for a flat panel.
 * A screen modelled at a tilt has depth in all three axes and reports a height
 * that is too small, which is why the catalog can override this.
 *
 * The box is the world one, and that is the whole of what this function got
 * wrong for a long time. Every judgement below is about how the panel sits in
 * the world -- which way is up, which axis runs away from the viewer -- and it
 * was reading the mesh's *local* box to make them. A node that rotates or
 * scales its panel therefore handed this the wrong shape entirely, and the
 * error was invisible on exactly the products whose nodes happen to be
 * identity: the shirt and the tote measured the same either way, so nothing
 * looked wrong there while the ID card was off by two and a half times.
 *
 * The card stands upright through its node, so locally it is a flat slab
 * 53.9 by 85.5 and in the world it is a panel 2.13 wide and 3.38 tall. Read
 * locally it came out 0.63 to 1, which is not merely wrong but the reciprocal
 * of the truth -- and the comment that used to sit here quoted that 0.63 as
 * the card's shape, so the previous attempt at this was reasoning from the
 * symptom. A design landing on it had Fit and Fill correcting the wrong axis,
 * which is what put every square upload on the card into a tall ellipse.
 */
export function measureScreenAspect(
  root: THREE.Object3D,
  screenMaterials: readonly THREE.MeshStandardMaterial[],
  fallback: number,
): number {
  let aspect = fallback;
  // Ancestors included: a panel's shape in the world is decided as much by the
  // nodes above it as by the mesh itself, and that is the point of measuring
  // here rather than off the geometry.
  root.updateWorldMatrix(true, true);
  const box = new THREE.Box3();
  const size = new THREE.Vector3();
  root.traverse((object) => {
    if (
      !(object instanceof THREE.Mesh) ||
      !screenMaterials.includes(object.material as THREE.MeshStandardMaterial)
    ) {
      return;
    }
    box.setFromObject(object);
    if (box.isEmpty()) return;
    box.getSize(size);
    // Height over width, which is what every caller reads this as.
    //
    // Up is up where the panel stands up, and where it lies flat -- a pad of
    // paper on a clipboard -- the axis running away from the viewer is what
    // reads as height, which is the shorter of the two the panel does span.
    const across = Math.max(size.x, size.z);
    const flat = size.y <= Math.min(size.x, size.z);
    const up = flat ? Math.min(size.x, size.z) : size.y;
    if (across > 0 && up > 0) aspect = up / across;
  });
  return aspect;
}
/**
 * How much of the world one whole turn of a zone's unwrap covers, per axis.
 *
 * A print zone's coordinates run 0 to 1 whatever the panel measures, so 0.5 is
 * halfway across a sleeve and halfway across a back and those are not the same
 * distance. An all-over print is the one thing that cares: the whole point of
 * it is that the repeat is the same size on every panel, which cannot be said
 * in a coordinate that means something different on each.
 *
 * Two numbers rather than one, because these unwraps are not square. A tote's
 * front is 380mm across and 430mm up and its coordinates run 0 to 1 both ways,
 * so one turn of u and one turn of v are different distances -- what keeps a
 * design undistorted is that its template is cut to the panel's own shape, not
 * that the two axes agree. Measured as one number, from the square root of the
 * area, the bag's narrow side came out 1.7 times too large and its pattern
 * printed correspondingly bigger than the front's, which is the exact fault
 * this exists to prevent.
 *
 * Per triangle: the world edges against the coordinate edges give the two
 * directions the cloth runs in per unit of u and of v, and their lengths are
 * the distances. Averaged over the zone weighted by world area, so a panel is
 * described by the cloth it actually has rather than by whichever triangle
 * happened to be first.
 *
 * Zeroes when the zone carries no unwrap to measure, which the caller reads as
 * "cannot be tiled" rather than as a size.
 */
export function measureZoneScale(
  root: THREE.Object3D,
  screenMaterials: readonly THREE.MeshStandardMaterial[],
): { u: number; v: number } {
  let alongU = 0;
  let alongV = 0;
  let weight = 0;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const edge1 = new THREE.Vector3();
  const edge2 = new THREE.Vector3();
  const runU = new THREE.Vector3();
  const runV = new THREE.Vector3();
  root.updateWorldMatrix(true, true);
  root.traverse((object) => {
    if (
      !(object instanceof THREE.Mesh) ||
      !screenMaterials.includes(object.material as THREE.MeshStandardMaterial)
    ) {
      return;
    }
    const position = object.geometry.getAttribute("position");
    const uv = object.geometry.getAttribute("uv");
    if (!position || !uv) return;
    const index = object.geometry.getIndex();
    const count = index ? index.count : position.count;
    for (let i = 0; i + 2 < count; i += 3) {
      const corners = [0, 1, 2].map((k) => (index ? index.getX(i + k) : i + k));
      a.fromBufferAttribute(position, corners[0]).applyMatrix4(object.matrixWorld);
      b.fromBufferAttribute(position, corners[1]).applyMatrix4(object.matrixWorld);
      c.fromBufferAttribute(position, corners[2]).applyMatrix4(object.matrixWorld);
      edge1.subVectors(b, a);
      edge2.subVectors(c, a);
      const du1 = uv.getX(corners[1]) - uv.getX(corners[0]);
      const dv1 = uv.getY(corners[1]) - uv.getY(corners[0]);
      const du2 = uv.getX(corners[2]) - uv.getX(corners[0]);
      const dv2 = uv.getY(corners[2]) - uv.getY(corners[0]);
      const det = du1 * dv2 - du2 * dv1;
      // A triangle with no area in the unwrap says nothing about its scale.
      if (Math.abs(det) < 1e-12) continue;
      const area = edge1.clone().cross(edge2).length() / 2;
      if (area <= 0) continue;
      runU.copy(edge1).multiplyScalar(dv2).addScaledVector(edge2, -dv1).divideScalar(det);
      runV.copy(edge2).multiplyScalar(du1).addScaledVector(edge1, -du2).divideScalar(det);
      alongU += runU.length() * area;
      alongV += runV.length() * area;
      weight += area;
    }
  });
  return weight > 0
    ? { u: alongU / weight, v: alongV / weight }
    : { u: 0, v: 0 };
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
