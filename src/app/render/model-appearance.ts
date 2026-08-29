import * as THREE from "three";
import { toCreasedNormals } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import type {
  ColorPartId,
  DeviceDefinition,
  FinishId,
} from "../product-domain";
import {
  COLOR_PART_IDS,
  SPLIT_MATERIAL_SEPARATOR,
} from "../product-domain";

/**
 * Repairing and repainting what the file shipped with.
 *
 * A supplied model is authored for whatever renderer its author had, so some
 * of what it carries is wrong here and some of it is missing: normals averaged
 * across an edge that should be sharp, a material set up for a pipeline that
 * is not this one, and no notion at all of the finish a user is about to pick.
 * None of this changes the geometry, only how it is read.
 */

/**
 * Give every surface a normal that matches the face it belongs to.
 *
 * A model that welds a flat panel to its rounded bevel leaves the corner
 * vertices holding an average of both, so the flat face shades as a gradient
 * between them — a soft fan spreading from a corner, on a surface that should
 * be uniform. Recomputing with a crease threshold splits the sharp edges and
 * leaves the fillets smooth.
 *
 * The geometry is cloned first because `Object3D.clone` shares it with the
 * parsed model in the cache, and this must not reach another scene.
 */
export function creaseNormals(root: THREE.Object3D, angleDegrees: number): void {
  const creaseAngle = THREE.MathUtils.degToRad(angleDegrees);
  const done = new Map<THREE.BufferGeometry, THREE.BufferGeometry>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const existing = done.get(object.geometry);
    if (existing) {
      object.geometry = existing;
      return;
    }
    const creased = toCreasedNormals(object.geometry, creaseAngle);
    done.set(object.geometry, creased);
    object.geometry = creased;
  });
}
/**
 * Repair the materials a model got wrong, before anything else touches them.
 *
 * This runs once per built scene and on the scene's own material clones, so a
 * correction never reaches the cached source and never leaks between devices.
 * A named material the model does not contain is simply skipped, which keeps a
 * correction harmless if a re-export renames the part it describes.
 */
export function applyMaterialCorrections(
  root: THREE.Object3D,
  device: DeviceDefinition,
): void {
  const corrections = device.materialCorrections;
  if (!corrections) return;

  for (const material of standardMaterials(root)) {
    const correction = corrections[material.name];
    if (!correction) continue;

    if (correction.color !== undefined) material.color.set(correction.color);
    if (correction.metalness !== undefined) {
      material.metalness = correction.metalness;
    }
    if (correction.roughness !== undefined) {
      material.roughness = correction.roughness;
    }
    material.needsUpdate = true;
  }
}
/**
 * What every material looks like once corrections are in and before any
 * colourway is chosen — in other words, what Natural means for this model.
 *
 * A finish is applied to the scene on screen rather than by rebuilding it, so
 * without somewhere to return to, leaving a colourway would leave its paint
 * behind and Natural would be reachable only by reloading the device.
 *
 * The base-colour texture is kept alongside the colour because a colourway can
 * set it aside — see `repaintedMaterials` — and Natural has to put it back.
 */
type BaseAppearance = { color: THREE.Color; map: THREE.Texture | null };
export type BaseColors = Map<THREE.MeshStandardMaterial, BaseAppearance>;
export function standardMaterials(root: THREE.Object3D): THREE.MeshStandardMaterial[] {
  const seen = new Set<THREE.MeshStandardMaterial>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of materials) {
      if (material instanceof THREE.MeshStandardMaterial) seen.add(material);
    }
  });
  return [...seen];
}
export function captureBaseColors(root: THREE.Object3D): BaseColors {
  const colors: BaseColors = new Map();
  for (const material of standardMaterials(root)) {
    colors.set(material, { color: material.color.clone(), map: material.map });
  }
  return colors;
}
/**
 * Repaint the materials a colourway names.
 *
 * Only base colour is rewritten. Metalness and roughness stay as the model's
 * author set them, so a brushed enclosure stays brushed and a polished rail
 * stays polished — the finish changes the colour, not the material.
 *
 * Every material is returned to its captured colour first, so a colourway
 * describes the whole device rather than the difference from whichever
 * colourway happened to precede it.
 */
export function applyFinish(
  baseColors: BaseColors,
  device: DeviceDefinition,
  finish: FinishId,
): void {
  const colorway = device.finishes?.[finish];
  const body = new Set(device.bodyMaterials ?? []);
  const repainted = new Set(device.repaintedMaterials ?? []);
  const accents = colorway?.accents ?? {};

  for (const [material, base] of baseColors) {
    // An accent wins over the shell, so a band keeps its own colour.
    const hex =
      accents[material.name] ??
      (colorway && body.has(material.name) ? colorway.body : null);
    if (hex) material.color.set(hex);
    else material.color.copy(base.color);

    // A painted material whose own colour lives in its texture has to lose the
    // texture, or the paint only tints it. Natural restores it, which is why
    // the map was captured rather than discarded.
    if (repainted.has(material.name)) {
      material.map = hex ? null : base.map;
    }
    material.needsUpdate = true;
  }
}

/**
 * Give every mesh its own copy of the material it shares with others.
 *
 * Some files paint a whole product with a single material and separate the
 * parts by mesh instead, which leaves the catalog no name to address a part by:
 * asking for the pen means asking for the same material as the board and the
 * sheets. Cloning per mesh and naming the copy after its mesh restores that
 * name, and does it at load so the supplied file stays as its author sent it.
 *
 * Only materials genuinely shared by more than one mesh are split. A material
 * already used once keeps its own name, so a catalog entry never has to know
 * which of the two it is looking at.
 */
export function splitMaterialsByMesh(root: THREE.Object3D): void {
  const users = new Map<THREE.Material, number>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    for (const material of materialsOf(object)) {
      users.set(material, (users.get(material) ?? 0) + 1);
    }
  });

  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const replace = (material: THREE.Material): THREE.Material => {
      if ((users.get(material) ?? 0) < 2) return material;
      const copy = material.clone();
      copy.name = `${material.name}${SPLIT_MATERIAL_SEPARATOR}${object.name}`;
      return copy;
    };
    object.material = Array.isArray(object.material)
      ? object.material.map(replace)
      : replace(object.material);
  });
}

function materialsOf(mesh: THREE.Mesh): THREE.Material[] {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}

/** One colour per slot, as the controls hold them. */
export type PartColors = Readonly<Partial<Record<ColorPartId, string>>>;

/**
 * Paint the parts a product's colour slots name.
 *
 * This runs after `applyFinish`, which has already returned every material to
 * what it was before any colourway. So a slot only ever writes its own
 * materials, and clearing one is handled by that reset rather than by
 * remembering what the slot painted last.
 *
 * Like a colourway, only base colour is written: a chrome ring stays as
 * metallic and as smooth as its author made it, and takes the new colour as
 * chrome would.
 */
export function applyPartColors(
  baseColors: BaseColors,
  device: DeviceDefinition,
  colors: PartColors,
): void {
  const parts = device.colorParts;
  if (!parts) return;

  const painted = new Map<string, { hex: string; repaint: boolean }>();
  for (const id of COLOR_PART_IDS) {
    const part = parts[id];
    const hex = colors[id];
    if (!part || !hex) continue;
    for (const name of part.materials) {
      painted.set(name, { hex, repaint: part.repaint === true });
    }
  }
  if (painted.size === 0) return;

  for (const [material, base] of baseColors) {
    const paint = painted.get(material.name);
    if (!paint) continue;
    material.color.set(paint.hex);
    // A surface whose own colour lives in its texture only tints, so a printed
    // canvas bag painted blue over its pattern comes out a blue pattern rather
    // than a blue bag. Natural puts the texture back, which is why the base
    // appearance keeps it.
    if (paint.repaint) material.map = null;
    else material.map = base.map;
    material.needsUpdate = true;
  }
}

/**
 * Everything that has to happen to a freshly cloned product's materials, and
 * the handle that keeps repainting it.
 *
 * The order is the whole point and it is easy to get wrong from the outside.
 * A split has to run before anything looks a material up by name, corrections
 * before the authored appearance is captured, and the capture before any paint
 * — and because a colourway resets every material before it paints, the part
 * colours have to be re-applied whenever either of them changes. Keeping the
 * sequence here means the scene builder cannot hold it wrongly.
 */
export function prepareProductMaterials(
  root: THREE.Object3D,
  device: DeviceDefinition,
  initial: { finish: FinishId; partColors?: PartColors },
): {
  setFinish: (finish: FinishId) => void;
  setPartColors: (colors: PartColors) => void;
} {
  if (device.splitMaterialsByMesh) splitMaterialsByMesh(root);
  applyMaterialCorrections(root, device);
  const baseColors = captureBaseColors(root);

  let finish = initial.finish;
  let partColors: PartColors = initial.partColors ?? {};
  const repaint = (): void => {
    applyFinish(baseColors, device, finish);
    applyPartColors(baseColors, device, partColors);
  };
  repaint();

  return {
    setFinish: (next) => {
      finish = next;
      repaint();
    },
    setPartColors: (next) => {
      partColors = next;
      repaint();
    },
  };
}
