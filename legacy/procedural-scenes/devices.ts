import * as THREE from "three";
import {
  mergeGeometries,
  mergeVertices,
} from "three/examples/jsm/utils/BufferGeometryUtils.js";

export type DeviceKind = "imac" | "ipad" | "iphone" | "macbook";

/**
 * Real dimensions in millimetres.
 *
 * Proportion is what makes a device recognisable long before surface detail
 * does — a phone with the right aspect and corner radius reads correctly as a
 * grey slab, while a wrong-proportioned one stays wrong no matter how many
 * buttons it grows. These are measured from current hardware.
 */
const DIMENSIONS = {
  imac: { bezel: 9, chin: 44, depth: 11.5, height: 461, width: 547 },
  ipad: { bezel: 7, corner: 18, depth: 5.9, height: 249.7, width: 177.5 },
  iphone: { bezel: 3.2, corner: 24, depth: 8.25, height: 146.6, width: 70.6 },
  macbook: { baseDepth: 15.5, bezel: 5, hinge: 8, height: 221.2, width: 312.6 },
} as const;

export type DeviceMaterials = {
  /** Anodised body. */
  body: THREE.Material;
  /** Dark glass for lenses and camera cutouts. */
  glass: THREE.Material;
  /** The display surface. Carries the artwork when one is present. */
  screen: THREE.Material;
};

/**
 * Superellipse outline — the "squircle".
 *
 * Apple's corners are continuous-curvature, not circular arcs: the radius eases
 * in rather than meeting the straight edge at a tangent discontinuity. A plain
 * rounded rectangle is the single biggest tell that a phone model is not a
 * phone, because the highlight running along the rail breaks at each corner
 * instead of flowing through it. An exponent near 5 approximates Apple's curve
 * closely enough that the specular sweep stays continuous.
 */
export function squircleShape(
  halfWidth: number,
  halfHeight: number,
  exponent = 5,
  segments = 96,
): THREE.Shape {
  const shape = new THREE.Shape();
  for (let i = 0; i <= segments; i += 1) {
    const t = (i / segments) * Math.PI * 2;
    const cos = Math.cos(t);
    const sin = Math.sin(t);
    // Signed superellipse: |x/a|^n + |y/b|^n = 1
    const x = Math.sign(cos) * Math.abs(cos) ** (2 / exponent) * halfWidth;
    const y = Math.sign(sin) * Math.abs(sin) ** (2 / exponent) * halfHeight;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return shape;
}

function extrude(
  shape: THREE.Shape,
  depth: number,
  bevel: number,
): THREE.BufferGeometry {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    bevelEnabled: bevel > 0,
    bevelSegments: 4,
    bevelSize: bevel,
    bevelThickness: bevel,
    curveSegments: 8,
    depth,
  });
  geometry.center();
  const indexed = mergeVertices(geometry);
  geometry.dispose();
  indexed.computeVertexNormals();
  return indexed;
}

/**
 * A display surface with UVs the artwork can be mapped onto directly.
 *
 * PlaneGeometry's default UVs run bottom-up, which assumes a texture uploaded
 * with flipY. Artwork textures here are pinned raw top-down so they agree with
 * the DataTexture relief maps, so the plane flips its own V.
 */
function screenPlane(
  width: number,
  height: number,
  exponent = 0,
): THREE.BufferGeometry {
  // A rectangular display in a curved body is one of the clearest tells that a
  // device is modelled rather than photographed: on real hardware the screen
  // corners follow the case, leaving an even bezel the whole way round. An
  // exponent of 0 keeps the plain rectangle for panels that genuinely are one.
  const geometry =
    exponent > 0
      ? new THREE.ShapeGeometry(
          squircleShape(width / 2, height / 2, exponent, 64),
          12,
        )
      : new THREE.PlaneGeometry(width, height);

  // ShapeGeometry emits world-space UVs, exactly like ExtrudeGeometry, so they
  // are rebuilt across the bounding box. PlaneGeometry's are already 0..1 but
  // run bottom-up, and artwork textures here are pinned raw top-down.
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  const position = geometry.getAttribute("position");
  if (!bounds || !position) return geometry;

  const spanX = Math.max(1e-6, bounds.max.x - bounds.min.x);
  const spanY = Math.max(1e-6, bounds.max.y - bounds.min.y);
  const uv = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i += 1) {
    uv[i * 2] = (position.getX(i) - bounds.min.x) / spanX;
    uv[i * 2 + 1] = 1 - (position.getY(i) - bounds.min.y) / spanY;
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return geometry;
}

/** Rounded rectangle for keyboard wells, trackpads, and camera islands. */
function roundedRect(
  halfWidth: number,
  halfHeight: number,
  radius: number,
): THREE.Shape {
  const shape = new THREE.Shape();
  const r = Math.min(radius, halfWidth, halfHeight);
  shape.moveTo(-halfWidth + r, halfHeight);
  shape.lineTo(halfWidth - r, halfHeight);
  shape.quadraticCurveTo(halfWidth, halfHeight, halfWidth, halfHeight - r);
  shape.lineTo(halfWidth, -halfHeight + r);
  shape.quadraticCurveTo(halfWidth, -halfHeight, halfWidth - r, -halfHeight);
  shape.lineTo(-halfWidth + r, -halfHeight);
  shape.quadraticCurveTo(-halfWidth, -halfHeight, -halfWidth, -halfHeight + r);
  shape.lineTo(-halfWidth, halfHeight - r);
  shape.quadraticCurveTo(-halfWidth, halfHeight, -halfWidth + r, halfHeight);
  return shape;
}

/**
 * Offset a rounded-rect outline along Y and return it as a hole path.
 *
 * Holes are cut in the shape's own 2D space, before the extrusion is rotated
 * flat, so a laptop's front-to-back axis is Y here rather than Z.
 */
function wellHoleAt(shape: THREE.Shape, offsetY: number): THREE.Path {
  const path = new THREE.Path();
  const points = shape.getPoints(48);
  points.forEach((point, index) => {
    if (index === 0) path.moveTo(point.x, point.y + offsetY);
    else path.lineTo(point.x, point.y + offsetY);
  });
  path.closePath();
  return path;
}

type Built = { group: THREE.Group; disposables: THREE.BufferGeometry[] };

function buildIPhone(materials: DeviceMaterials, unit: number): Built {
  const d = DIMENSIONS.iphone;
  const halfWidth = (d.width / 2) * unit;
  const halfHeight = (d.height / 2) * unit;
  const depth = d.depth * unit;
  const disposables: THREE.BufferGeometry[] = [];
  const group = new THREE.Group();

  // Flat rails: a very small bevel, not a rounded edge. The near-square rail
  // catching a hard specular line is characteristic of the current design.
  // Exponent 8, not the 5 a pure squircle would use. A low exponent spreads
  // curvature evenly around the whole outline, which reads as a bar of soap; a
  // phone has genuinely flat rails with the curve concentrated in the corners.
  const bodyGeometry = extrude(
    squircleShape(halfWidth, halfHeight, 8),
    depth,
    depth * 0.06,
  );
  disposables.push(bodyGeometry);
  group.add(new THREE.Mesh(bodyGeometry, materials.body));

  // The screen follows the case curve, leaving an even bezel all the way round.
  const screenGeometry = screenPlane(
    halfWidth * 2 - d.bezel * unit * 2,
    halfHeight * 2 - d.bezel * unit * 2,
    8,
  );
  disposables.push(screenGeometry);
  const screen = new THREE.Mesh(screenGeometry, materials.screen);
  screen.position.z = depth / 2 + depth * 0.012;
  group.add(screen);

  // Dynamic Island: a stadium cut-out floating below the top bezel, not touching
  // it. Two capsule ends joined by a bar.
  const islandPillHalf = halfWidth * 0.2;
  const islandPillRadius = halfWidth * 0.075;
  const pillBar = new THREE.BoxGeometry(
    islandPillHalf * 2,
    islandPillRadius * 2,
    depth * 0.06,
  );
  const pillEnd = new THREE.CylinderGeometry(
    islandPillRadius,
    islandPillRadius,
    depth * 0.06,
    24,
  );
  const pillLeft = pillEnd.clone();
  pillLeft.rotateX(Math.PI / 2);
  pillLeft.translate(-islandPillHalf, 0, 0);
  const pillRight = pillEnd.clone();
  pillRight.rotateX(Math.PI / 2);
  pillRight.translate(islandPillHalf, 0, 0);
  const pill = mergeGeometries([pillBar, pillLeft, pillRight], false);
  pillBar.dispose();
  pillEnd.dispose();
  pillLeft.dispose();
  pillRight.dispose();
  if (pill) {
    disposables.push(pill);
    const islandPill = new THREE.Mesh(pill, materials.glass);
    islandPill.position.set(0, halfHeight * 0.8, depth / 2 + depth * 0.02);
    group.add(islandPill);
  }

  // Camera plateau: a raised squircle on the back, upper left.
  const islandHalf = halfWidth * 0.42;
  const islandGeometry = extrude(
    squircleShape(islandHalf, islandHalf, 5),
    depth * 0.42,
    depth * 0.08,
  );
  disposables.push(islandGeometry);
  const island = new THREE.Mesh(islandGeometry, materials.body);
  island.position.set(-halfWidth * 0.42, halfHeight * 0.72, -depth * 0.68);
  group.add(island);

  // Each lens is three parts: a raised metal barrel, the dark glass dome inside
  // it, and a narrow aperture ring. A single flat disc reads as a printed dot.
  const barrelRadius = islandHalf * 0.32;
  const lensBarrel = new THREE.CylinderGeometry(
    barrelRadius,
    barrelRadius * 1.04,
    depth * 0.34,
    32,
  );
  const lensDome = new THREE.SphereGeometry(
    barrelRadius * 0.74,
    24,
    16,
    0,
    Math.PI * 2,
    0,
    Math.PI / 2,
  );
  disposables.push(lensBarrel, lensDome);

  const lensOffsets = [
    [-islandHalf * 0.42, islandHalf * 0.42],
    [islandHalf * 0.42, islandHalf * 0.42],
    [-islandHalf * 0.42, -islandHalf * 0.42],
  ];
  for (const [x, y] of lensOffsets) {
    const barrel = new THREE.Mesh(lensBarrel, materials.body);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(island.position.x + x, island.position.y + y, -depth * 0.9);
    group.add(barrel);

    const dome = new THREE.Mesh(lensDome, materials.glass);
    dome.rotation.x = -Math.PI / 2;
    dome.position.set(
      island.position.x + x,
      island.position.y + y,
      -depth * 1.02,
    );
    group.add(dome);
  }

  // Flash and LiDAR, the two smaller circles that complete the cluster.
  const sensorGeometry = new THREE.CylinderGeometry(
    barrelRadius * 0.42,
    barrelRadius * 0.42,
    depth * 0.22,
    20,
  );
  disposables.push(sensorGeometry);
  for (const [x, y] of [
    [islandHalf * 0.44, -islandHalf * 0.4],
    [islandHalf * 0.06, -islandHalf * 0.52],
  ]) {
    const sensor = new THREE.Mesh(sensorGeometry, materials.glass);
    sensor.rotation.x = Math.PI / 2;
    sensor.position.set(
      island.position.x + x,
      island.position.y + y,
      -depth * 0.86,
    );
    group.add(sensor);
  }

  // Speaker grille and USB-C cut-out along the bottom rail, merged to one buffer.
  const grilleParts: THREE.BufferGeometry[] = [];
  const holeRadius = halfWidth * 0.018;
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < 5; i += 1) {
      const hole = new THREE.CylinderGeometry(holeRadius, holeRadius, depth, 12);
      hole.rotateZ(Math.PI / 2);
      hole.translate(side * (halfWidth * 0.34 + i * holeRadius * 3), -halfHeight, 0);
      grilleParts.push(hole);
    }
  }
  const port = new THREE.BoxGeometry(halfWidth * 0.26, depth * 0.44, depth);
  port.translate(0, -halfHeight, 0);
  grilleParts.push(port);

  // Antenna bands: thin insets interrupting the rail near each corner. Barely
  // visible head-on, but they break the otherwise unbroken specular line running
  // down the rail, which is what stops the metal reading as a plain extrusion.
  const bandThickness = halfHeight * 0.011;
  for (const y of [halfHeight * 0.86, -halfHeight * 0.86]) {
    for (const x of [-halfWidth, halfWidth]) {
      const band = new THREE.BoxGeometry(depth * 0.6, bandThickness, depth * 1.02);
      band.translate(x, y, 0);
      grilleParts.push(band);
    }
  }
  for (const x of [-halfWidth * 0.5, halfWidth * 0.5]) {
    const band = new THREE.BoxGeometry(bandThickness, depth * 0.6, depth * 1.02);
    band.translate(x, halfHeight, 0);
    grilleParts.push(band);
  }

  const grille = mergeGeometries(grilleParts, false);
  for (const part of grilleParts) part.dispose();
  if (grille) {
    disposables.push(grille);
    group.add(new THREE.Mesh(grille, materials.glass));
  }

  // Side buttons: volume pair and action button left, power right.
  const buttonGeometry = new THREE.BoxGeometry(
    depth * 0.34,
    halfHeight * 0.14,
    depth * 0.55,
  );
  disposables.push(buttonGeometry);
  const buttonPlacements: [number, number][] = [
    [-halfWidth, halfHeight * 0.34],
    [-halfWidth, halfHeight * 0.12],
    [-halfWidth, halfHeight * 0.56],
    [halfWidth, halfHeight * 0.3],
  ];
  for (const [x, y] of buttonPlacements) {
    const button = new THREE.Mesh(buttonGeometry, materials.body);
    button.position.set(x, y, 0);
    group.add(button);
  }

  return { disposables, group };
}

function buildIPad(materials: DeviceMaterials, unit: number): Built {
  const d = DIMENSIONS.ipad;
  const halfWidth = (d.width / 2) * unit;
  const halfHeight = (d.height / 2) * unit;
  const depth = d.depth * unit;
  const disposables: THREE.BufferGeometry[] = [];
  const group = new THREE.Group();

  // A tablet's corner radius is proportionally far smaller than a phone's, so
  // a higher exponent keeps the edges longer and straighter.
  const bodyGeometry = extrude(
    squircleShape(halfWidth, halfHeight, 9),
    depth,
    depth * 0.1,
  );
  disposables.push(bodyGeometry);
  group.add(new THREE.Mesh(bodyGeometry, materials.body));

  const screenGeometry = screenPlane(
    halfWidth * 2 - d.bezel * unit * 2,
    halfHeight * 2 - d.bezel * unit * 2,
    7,
  );
  disposables.push(screenGeometry);
  const screen = new THREE.Mesh(screenGeometry, materials.screen);
  screen.position.z = depth / 2 + depth * 0.02;
  group.add(screen);

  // Speaker grilles at both short ends, merged into one buffer.
  const grilleParts: THREE.BufferGeometry[] = [];
  const holeRadius = halfWidth * 0.012;
  for (let end = -1; end <= 1; end += 2) {
    for (let i = -3; i <= 3; i += 1) {
      const hole = new THREE.CylinderGeometry(holeRadius, holeRadius, depth, 10);
      hole.rotateZ(Math.PI / 2);
      hole.translate(i * holeRadius * 3.2, end * halfHeight, 0);
      grilleParts.push(hole);
    }
  }
  const grille = mergeGeometries(grilleParts, false);
  for (const part of grilleParts) part.dispose();
  if (grille) {
    disposables.push(grille);
    group.add(new THREE.Mesh(grille, materials.glass));
  }

  // Magnetic connector contacts on the long edge.
  const contactGeometry = new THREE.BoxGeometry(
    halfWidth * 0.012,
    halfHeight * 0.07,
    depth * 0.3,
  );
  disposables.push(contactGeometry);
  for (let i = -1; i <= 1; i += 1) {
    const contact = new THREE.Mesh(contactGeometry, materials.glass);
    contact.position.set(halfWidth, i * halfHeight * 0.1, 0);
    group.add(contact);
  }

  // Single rear camera, no island.
  const lensGeometry = new THREE.CylinderGeometry(
    halfWidth * 0.07,
    halfWidth * 0.07,
    depth * 0.5,
    32,
  );
  disposables.push(lensGeometry);
  const lens = new THREE.Mesh(lensGeometry, materials.glass);
  lens.rotation.x = Math.PI / 2;
  lens.position.set(-halfWidth * 0.78, halfHeight * 0.86, -depth * 0.6);
  group.add(lens);

  return { disposables, group };
}

function buildMacBook(materials: DeviceMaterials, unit: number): Built {
  const d = DIMENSIONS.macbook;
  const halfWidth = (d.width / 2) * unit;
  const halfDepth = (d.height / 2) * unit;
  const baseHeight = d.baseDepth * unit;
  const disposables: THREE.BufferGeometry[] = [];
  const group = new THREE.Group();

  // Recesses are cut as real holes through the base, with a floor plate closing
  // them underneath. There is no CSG in three.js, so placing a solid tray inside
  // a solid slab produces nothing at all — the interior geometry is simply
  // enclosed and never seen.
  const wellHalfWidth = halfWidth * 0.86;
  const wellHalfDepth = halfDepth * 0.4;
  const wellDepth = baseHeight * 0.34;
  const wellCentre = -halfDepth * 0.36;
  const trackpadHalfWidth = halfWidth * 0.24;
  const trackpadHalfDepth = halfDepth * 0.26;
  const trackpadCentre = halfDepth * 0.48;

  const baseOutline = squircleShape(halfWidth, halfDepth, 8);
  // The base mesh is laid flat by a -90 degree rotation about X, which maps
  // shape-space Y onto world -Z. The centres below are world positions, so they
  // are negated on the way into shape space; without this the holes are cut at
  // the front while the keys and trackpad sit at the back, buried under solid
  // material.
  baseOutline.holes.push(
    wellHoleAt(
      roundedRect(wellHalfWidth, wellHalfDepth, halfWidth * 0.02),
      -wellCentre,
    ),
  );
  baseOutline.holes.push(
    wellHoleAt(
      roundedRect(trackpadHalfWidth, trackpadHalfDepth, halfWidth * 0.012),
      -trackpadCentre,
    ),
  );

  const baseGeometry = extrude(baseOutline, wellDepth, baseHeight * 0.06);
  disposables.push(baseGeometry);
  const base = new THREE.Mesh(baseGeometry, materials.body);
  base.rotation.x = -Math.PI / 2;
  base.position.y = baseHeight / 2 - wellDepth / 2;
  group.add(base);

  // Floor plate under the cut-outs, forming the bottom of both recesses and the
  // underside of the machine.
  const floorGeometry = extrude(
    squircleShape(halfWidth, halfDepth, 8),
    baseHeight - wellDepth,
    baseHeight * 0.08,
  );
  disposables.push(floorGeometry);
  const floor = new THREE.Mesh(floorGeometry, materials.body);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -baseHeight / 2 + (baseHeight - wellDepth) / 2;
  group.add(floor);

  // Individual keys, merged into one buffer. three-gpu-pathtracer has no
  // instancing, so 78 separate meshes would mean 78 BVH subtrees; merging keeps
  // the visual detail at a fraction of the trace cost.
  const keyRows = [14, 14, 13, 12, 11, 8];
  const keyGeometries: THREE.BufferGeometry[] = [];
  const keyGap = wellHalfWidth * 0.012;
  const rowDepth = (wellHalfDepth * 2 * 0.88) / keyRows.length;

  keyRows.forEach((count, rowIndex) => {
    const keyWidth = (wellHalfWidth * 2 * 0.96) / count - keyGap;
    for (let i = 0; i < count; i += 1) {
      const key = new THREE.BoxGeometry(
        keyWidth,
        wellDepth * 0.78,
        rowDepth - keyGap,
      );
      key.translate(
        -wellHalfWidth * 0.96 + keyWidth / 2 + i * (keyWidth + keyGap),
        baseHeight / 2 - wellDepth * 0.42,
        wellCentre - wellHalfDepth * 0.88 + rowDepth * (rowIndex + 0.5),
      );
      keyGeometries.push(key);
    }
  });

  const keys = mergeGeometries(keyGeometries, false);
  for (const geometry of keyGeometries) geometry.dispose();
  if (keys) {
    disposables.push(keys);
    group.add(new THREE.Mesh(keys, materials.body));
  }

  // Trackpad surface, sitting just below the cut-out's rim.
  const trackpadGeometry = new THREE.BoxGeometry(
    trackpadHalfWidth * 2 * 0.98,
    wellDepth * 0.14,
    trackpadHalfDepth * 2 * 0.98,
  );
  disposables.push(trackpadGeometry);
  const trackpad = new THREE.Mesh(trackpadGeometry, materials.glass);
  trackpad.position.set(0, baseHeight / 2 - wellDepth * 0.2, trackpadCentre);
  group.add(trackpad);

  // Hinge barrel, visible in the gap between lid and base.
  const hingeGeometry = new THREE.CylinderGeometry(
    baseHeight * 0.22,
    baseHeight * 0.22,
    halfWidth * 1.5,
    24,
  );
  disposables.push(hingeGeometry);
  const hingeBarrel = new THREE.Mesh(hingeGeometry, materials.glass);
  hingeBarrel.rotation.z = Math.PI / 2;
  hingeBarrel.position.set(0, baseHeight * 0.36, -halfDepth * 0.97);
  group.add(hingeBarrel);

  // Lid, hinged at the back edge and opened past vertical the way a laptop
  // actually sits.
  const lidThickness = baseHeight * 0.38;
  const lidGeometry = extrude(
    squircleShape(halfWidth, halfDepth, 8),
    lidThickness,
    lidThickness * 0.18,
  );
  disposables.push(lidGeometry);

  // The lid is assembled lying flat on the base, then the whole pivot is
  // rotated about the hinge line at the back edge. Rotating the lid about its
  // own centre instead would swing the panel away from the base as it opens.
  const lidPivot = new THREE.Group();

  const lidBody = new THREE.Mesh(lidGeometry, materials.body);
  lidBody.rotation.x = -Math.PI / 2;
  lidBody.position.z = halfDepth;
  lidPivot.add(lidBody);

  const screenGeometry = screenPlane(
    halfWidth * 2 - d.bezel * unit * 2,
    halfDepth * 2 - d.bezel * unit * 2,
    10,
  );
  disposables.push(screenGeometry);
  const screen = new THREE.Mesh(screenGeometry, materials.screen);
  // Facing up while flat, so it faces the viewer once the lid is raised.
  screen.rotation.x = -Math.PI / 2;
  screen.position.set(0, lidThickness / 2 + lidThickness * 0.04, halfDepth);
  lidPivot.add(screen);

  // Camera notch, centred in the top bezel. On the Pro this is a cut into the
  // panel rather than a pill floating inside the display area.
  const notchGeometry = new THREE.BoxGeometry(
    halfWidth * 0.16,
    lidThickness * 0.4,
    halfDepth * 0.05,
  );
  disposables.push(notchGeometry);
  const notch = new THREE.Mesh(notchGeometry, materials.glass);
  notch.position.set(
    0,
    lidThickness / 2 + lidThickness * 0.06,
    halfDepth * 1.97,
  );
  lidPivot.add(notch);

  // Roughly 100 degrees open — just past vertical, where a laptop rests. The
  // pivot sits on the hinge axis itself so the lid's lower edge stays against
  // the base instead of lifting away from it as the angle opens.
  lidPivot.rotation.x = -Math.PI * 0.555;
  lidPivot.position.set(0, baseHeight * 0.36, -halfDepth * 0.97);
  group.add(lidPivot);

  // The front lip — the finger scoop in the leading edge — is deliberately not
  // modelled. It is a subtractive feature, and with no CSG available, adding a
  // cylinder there produces a protruding nub rather than a scoop. Cutting it
  // properly means a hole through the base outline plus a filled floor, the way
  // the keyboard well is built, and it is not worth that geometry for a detail
  // this small. Absent reads as neutral; a wart does not.

  // Rubber feet, and the port cut-outs down both flanks.
  const detailParts: THREE.BufferGeometry[] = [];
  for (const x of [-halfWidth * 0.78, halfWidth * 0.78]) {
    for (const z of [-halfDepth * 0.82, halfDepth * 0.82]) {
      const foot = new THREE.CylinderGeometry(
        halfWidth * 0.035,
        halfWidth * 0.035,
        baseHeight * 0.16,
        16,
      );
      foot.translate(x, -baseHeight / 2 - baseHeight * 0.06, z);
      detailParts.push(foot);
    }
  }
  // Three ports left, two right — the asymmetry is characteristic.
  for (const [x, z] of [
    [-halfWidth, -halfDepth * 0.42],
    [-halfWidth, -halfDepth * 0.12],
    [-halfWidth, halfDepth * 0.18],
    [halfWidth, -halfDepth * 0.3],
    [halfWidth, halfDepth * 0.05],
  ]) {
    const portCut = new THREE.BoxGeometry(
      baseHeight * 0.5,
      baseHeight * 0.34,
      halfDepth * 0.16,
    );
    portCut.translate(x, 0, z);
    detailParts.push(portCut);
  }
  const details = mergeGeometries(detailParts, false);
  for (const part of detailParts) part.dispose();
  if (details) {
    disposables.push(details);
    group.add(new THREE.Mesh(details, materials.glass));
  }

  return { disposables, group };
}

function buildIMac(materials: DeviceMaterials, unit: number): Built {
  const d = DIMENSIONS.imac;
  const halfWidth = (d.width / 2) * unit;
  const chin = d.chin * unit;
  const panelHeight = d.height * unit;
  const halfPanel = panelHeight / 2;
  const depth = d.depth * unit;
  const disposables: THREE.BufferGeometry[] = [];
  const group = new THREE.Group();

  // The display is a single flat slab including the chin — the chin is not a
  // separate part, it is the same panel continuing below the screen, which is
  // why the front face reads as one uninterrupted surface.
  const bodyGeometry = extrude(
    squircleShape(halfWidth, halfPanel, 14),
    depth,
    depth * 0.2,
  );
  disposables.push(bodyGeometry);
  group.add(new THREE.Mesh(bodyGeometry, materials.body));

  const screenGeometry = screenPlane(
    halfWidth * 2 - d.bezel * unit * 2,
    panelHeight - chin - d.bezel * unit * 2,
    12,
  );
  disposables.push(screenGeometry);
  const screen = new THREE.Mesh(screenGeometry, materials.screen);
  screen.position.set(0, chin / 2, depth / 2 + depth * 0.04);
  group.add(screen);

  // Neck and foot. The neck is a thin flat blade, not a cylinder.
  const neckGeometry = new THREE.BoxGeometry(
    halfWidth * 0.34,
    panelHeight * 0.34,
    depth * 0.9,
  );
  disposables.push(neckGeometry);
  const neck = new THREE.Mesh(neckGeometry, materials.body);
  neck.position.set(0, -halfPanel - panelHeight * 0.12, -depth * 0.6);
  group.add(neck);

  const footGeometry = extrude(
    roundedRect(halfWidth * 0.62, panelHeight * 0.16, halfWidth * 0.06),
    depth * 0.5,
    depth * 0.12,
  );
  disposables.push(footGeometry);
  const foot = new THREE.Mesh(footGeometry, materials.body);
  foot.rotation.x = -Math.PI / 2;
  foot.position.set(0, -halfPanel - panelHeight * 0.28, -depth * 0.3);
  group.add(foot);

  // Rear detail: the port cluster beside the neck and the power inlet. The 24"
  // iMac has a genuinely flat back, so there is no dome to model here — adding
  // one would be inventing a curve the hardware does not have.
  const rearParts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i += 1) {
    const portCut = new THREE.BoxGeometry(
      halfWidth * 0.055,
      panelHeight * 0.022,
      depth * 0.4,
    );
    portCut.translate(
      halfWidth * 0.16 + i * halfWidth * 0.085,
      -halfPanel + panelHeight * 0.13,
      -depth * 0.5,
    );
    rearParts.push(portCut);
  }
  const inlet = new THREE.CylinderGeometry(
    halfWidth * 0.038,
    halfWidth * 0.038,
    depth * 0.4,
    20,
  );
  inlet.rotateX(Math.PI / 2);
  inlet.translate(-halfWidth * 0.3, -halfPanel + panelHeight * 0.13, -depth * 0.5);
  rearParts.push(inlet);

  const rear = mergeGeometries(rearParts, false);
  for (const part of rearParts) part.dispose();
  if (rear) {
    disposables.push(rear);
    group.add(new THREE.Mesh(rear, materials.glass));
  }

  return { disposables, group };
}

/**
 * Build a device at a given longest-edge size in scene units.
 *
 * Everything is derived from the millimetre table, so changing the size control
 * scales the whole assembly without distorting any proportion.
 */
export function buildDevice(
  kind: DeviceKind,
  materials: DeviceMaterials,
  longestEdge: number,
): Built {
  const d = DIMENSIONS[kind];
  const unit = longestEdge / Math.max(d.width, d.height);

  switch (kind) {
    case "imac":
      return buildIMac(materials, unit);
    case "ipad":
      return buildIPad(materials, unit);
    case "macbook":
      return buildMacBook(materials, unit);
    default:
      return buildIPhone(materials, unit);
  }
}
