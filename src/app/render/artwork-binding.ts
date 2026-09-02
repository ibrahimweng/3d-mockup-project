import * as THREE from "three";

import type { ArtworkFit, ArtworkZoneId, DeviceDefinition } from "../product-domain";
import { readArtworkZones } from "../product-applicability";
import {
  applyScreenTransform,
  findScreenMaterials,
  hasClothCoordinates,
  measureScreenAspect,
  measureZoneScale,
  type ScreenSlack,
  type ScreenTransform,
} from "./screen-mapping";

/**
 * Binding a supplied design to the surface that carries it.
 *
 * Two surfaces, and the difference is physical rather than cosmetic. A display
 * emits, so a screenshot is bound to the emissive channel and stays legible
 * whatever the studio is doing to the rest of the device. Print does not emit:
 * ink on cotton, card or plastic is lit like the surface under it, and bound
 * the display way a shirt would glow in an unlit corner.
 */

/**
 * What a print surface's maps were before a design was laid over them.
 *
 * Only captured for a product that declares its relief describes the print the
 * file shipped with rather than the material underneath. Clearing an upload
 * has to put those maps back, or removing a design would leave the product
 * permanently flatter than its author made it.
 */
export type PrintRelief = ReadonlyMap<
  THREE.MeshStandardMaterial,
  {
    aoMap: THREE.Texture | null;
    map: THREE.Texture | null;
    metalnessMap: THREE.Texture | null;
    normalMap: THREE.Texture | null;
    roughnessMap: THREE.Texture | null;
  }
>;

export function capturePrintRelief(
  materials: readonly THREE.MeshStandardMaterial[],
  clearRelief: boolean,
): PrintRelief {
  const relief = new Map<
    THREE.MeshStandardMaterial,
    {
      aoMap: THREE.Texture | null;
      map: THREE.Texture | null;
      metalnessMap: THREE.Texture | null;
      normalMap: THREE.Texture | null;
      roughnessMap: THREE.Texture | null;
    }
  >();

  // The base colour map is captured whatever the product asked for, because
  // clearing an upload has to put back the template the file ships with rather
  // than leaving the surface blank.
  for (const material of materials) {
    relief.set(material, {
      aoMap: clearRelief ? material.aoMap : null,
      map: material.map,
      metalnessMap: clearRelief ? material.metalnessMap : null,
      normalMap: clearRelief ? material.normalMap : null,
      roughnessMap: clearRelief ? material.roughnessMap : null,
    });
  }
  return relief;
}

export function bindArtwork(request: {
  /**
   * The cloth this product is printed on, where it has one.
   *
   * A zone with nothing uploaded shows the template the file ships with, which
   * is a print guide drawn on white. On a product whose unprinted parts follow
   * the print background -- see `blankStockMaterials` -- white is the one
   * colour that cannot be right: the hem band and the sleeve heads are the
   * garment's colour and the panel between them is not, which is the contrast
   * yoke this whole arrangement exists to avoid. So the template is shown over
   * the cloth instead, and it goes back to white the moment a design lands on
   * it and must not be tinted.
   */
  blankStock?: string;
  clearRelief: boolean;
  materials: readonly THREE.MeshStandardMaterial[];
  printed: boolean;
  relief: PrintRelief;
  texture: THREE.Texture | null;
}): void {
  const { blankStock, clearRelief, materials, printed, relief, texture } = request;

  for (const material of materials) {
    // No upload means the surface goes back to the template printed into the
    // file, which is what makes a product arrive showing where a design lands
    // instead of arriving blank.
    material.map = texture ?? relief.get(material)?.map ?? null;

    if (printed) {
      // A coloured surface under the design would tint it, so the base colour
      // goes white for as long as there is something printed on it.
      if (texture) material.color.set("#ffffff");
      else if (blankStock) material.color.set(blankStock);
      if (clearRelief) {
        const authored = relief.get(material);
        if (authored) {
          material.aoMap = texture ? null : authored.aoMap;
          material.metalnessMap = texture ? null : authored.metalnessMap;
          material.normalMap = texture ? null : authored.normalMap;
          material.roughnessMap = texture ? null : authored.roughnessMap;
        }
      }
      material.needsUpdate = true;
      continue;
    }

    // A display emits rather than reflects, and the stock wallpaper on these
    // models is an emissiveMap, so that is the channel that has to be
    // replaced; setting only `map` leaves the original glowing underneath.
    material.emissiveMap = texture;
    material.emissive = new THREE.Color(0xffffff);
    material.emissiveIntensity = texture ? 1 : 0;
    material.toneMapped = false;
    material.needsUpdate = true;
  }
}

/**
 * Size a design onto a surface whose coordinates were written for exactly one
 * image, and report whether it did.
 *
 * Returns false for anything else, which leaves the caller to fit the design
 * to a panel the usual way. A wrap cannot be fitted: scaling it moves the two
 * ends apart and opens the seam. Repeat wrapping is what lets the seam
 * triangles, whose u runs past 1, reach the far edge instead of smearing the
 * last column across the join.
 */
export function wrapArtwork(
  texture: THREE.Texture,
  fit: ArtworkFit | undefined,
  slack: { x: number; y: number },
): boolean {
  if (fit !== "wrap") return false;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 1);
  texture.offset.set(0, 0);
  texture.needsUpdate = true;
  slack.x = 0;
  slack.y = 0;
  return true;
}

/**
 * Lay a design across a panel as printed cloth rather than as a placed image.
 *
 * The whole difference between this and fitting one is what the size is
 * measured against. A fitted design is sized to the panel, so the same file is
 * one size on a back and another on a sleeve. An all-over print is sized to the
 * *cloth*: the design repeats every `tile` world units wherever it lands, so a
 * motif is the same width on the sleeve as on the back, which is the only thing
 * that makes the two look like one garment.
 *
 * `scale` is how much world one turn of this zone's coordinates covers, on
 * each axis separately -- these unwraps are not square, and a bag's narrow side
 * measured with one number for both comes out two thirds too large. So
 * `scale.u / tile` is how many repeats fit across it, and the design's own
 * proportions decide the other way: a tile is `tile` wide and as tall as the
 * image is tall against its width, which is what tiles it without distorting.
 *
 * Nothing is cropped -- the pattern is endless -- so the zone reports no slack
 * and the pan control has nothing to pan. Offset still moves the pattern
 * across the cloth, which is what registering a repeat means.
 */
export function tileArtwork(
  texture: THREE.Texture,
  request: {
    /** Whether the zone carries the cloth coordinate. See `hasClothCoordinates`. */
    cloth?: boolean;
    offset: { x: number; y: number };
    scale: { u: number; v: number };
    tile: number;
  },
  slack: ScreenSlack,
): boolean {
  const { cloth, offset, scale, tile } = request;
  if (!(scale.u > 0) || !(scale.v > 0) || !(tile > 0)) return false;
  const image = texture.image as { height?: number; width?: number } | undefined;
  const aspect = image?.width && image?.height ? image.width / image.height : 1;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.center.set(0, 0);
  /**
   * Which coordinates the pattern is measured in.
   *
   * A zone's own are normalised to its own extent, which is what a design
   * wants -- the front panel's artwork fills the front panel -- and moves every
   * zone to an origin of its own. Two zones cut from one piece of cloth then
   * disagree by a constant, and a pattern crossing the line between them jumps:
   * on the shirt that line is the hem, which runs level all the way round, and
   * the jump measured 237mm.
   *
   * The cloth coordinate is metres across the whole piece, shared by every zone
   * cut from it, so one repeat length is all it takes and the phase looks after
   * itself. It stops only where the cloth does -- a sleeve is set into the
   * armhole with a seam, and a pattern is not expected to carry across one.
   */
  texture.channel = cloth ? 2 : 0;
  if (cloth) texture.repeat.set(1 / tile, aspect / tile);
  else texture.repeat.set(scale.u / tile, (scale.v / tile) * aspect);
  texture.offset.set(offset.x - 0.5, offset.y - 0.5);
  slack.x = 0;
  slack.y = 0;
  texture.needsUpdate = true;
  return true;
}

/**
 * Every surface of a product a design can land on, resolved against its model.
 *
 * Two kinds, and the difference is whether anyone can upload to it. A `zone` is
 * a panel with a slot: the front of a shirt, the back, each sleeve. `cloth` is
 * the rest of the same cotton -- the hem band, the cuffs, the facings turned
 * under -- which has no slot and never will, because there are four slots and a
 * garment has more parts than that. It follows the print background instead,
 * and under an all-over print it follows the print.
 *
 * One binding per cloth material rather than one for the set, because each is
 * measured separately and they do not agree: a ring round a sleeve is a third
 * of a ring round the body, so a cuff and a hem given one scale between them
 * would both be printed at a size that is neither.
 */
export function resolveArtworkSurfaces(
  subject: THREE.Object3D,
  device: DeviceDefinition,
  clearRelief: boolean,
): {
  cloth: ReadonlyMap<string, ArtworkZoneBinding>;
  zones: ReadonlyMap<ArtworkZoneId, ArtworkZoneBinding>;
} {
  const of = (materials: readonly THREE.MeshStandardMaterial[], aspect: number) => ({
    aspect,
    cloth: hasClothCoordinates(subject, materials),
    materials,
    relief: capturePrintRelief(materials, clearRelief),
    scale: measureZoneScale(subject, materials),
    slack: { x: 0, y: 0 },
  });

  /**
   * A zone whose material the file does not carry is dropped rather than bound
   * to whatever the fallback finds, because the fallback is "the strongest
   * emissive material" -- right for a display named something else after a
   * re-export, and quite wrong for a sleeve.
   */
  const zones = new Map<ArtworkZoneId, ArtworkZoneBinding>();
  for (const [id, zone] of readArtworkZones(device)) {
    const materials = findScreenMaterials(subject, zone.material);
    if (materials.length === 0) continue;
    zones.set(id, {
      ...of(
        materials,
        zone.aspect ??
          (id === "front" ? device.screenAspect : undefined) ??
          measureScreenAspect(subject, materials, 9 / 19.5),
      ),
      fit: zone.fit,
    });
  }

  const cloth = new Map<string, ArtworkZoneBinding>();
  for (const name of device.blankStockMaterials ?? []) {
    const materials = findScreenMaterials(subject, name);
    if (materials.length === 0) continue;
    cloth.set(name, { ...of(materials, 1), fit: undefined });
  }

  return { cloth, zones };
}

/**
 * One design worn by every surface at once.
 *
 * An all-over print is one upload on every panel and every band of plain cloth
 * between them, and each needs its own repeat -- a sleeve holds fewer tiles
 * than a back, a cuff fewer again -- while a repeat lives on the texture rather
 * than on the material. So every surface gets a copy.
 *
 * Copies rather than decodes: a clone shares the original's picture, which
 * three.js uploads once and counts references to, so four panels of the same
 * design cost one image in memory and disposing a copy frees nothing while the
 * original still holds it. They are rebuilt only when the design itself
 * changes, which is what keeps dragging the repeat slider from re-cloning four
 * textures a frame.
 */
export function createAllOverPrint(): {
  dispose: () => void;
  /**
   * The texture each zone should wear, or null when this is not an all-over
   * print and every zone keeps its own upload.
   */
  spread: (
    surfaces: Iterable<string>,
    source: THREE.Texture | null,
    allOver: boolean,
  ) => ReadonlyMap<string, THREE.Texture> | null;
} {
  let held: { copies: Map<string, THREE.Texture>; of: THREE.Texture } | null = null;
  const release = (): void => {
    for (const copy of held?.copies.values() ?? []) copy.dispose();
    held = null;
  };
  return {
    dispose: release,
    spread: (surfaces, source, allOver) => {
      const wanted = allOver ? source : null;
      if (held?.of === wanted) return held?.copies ?? null;
      release();
      if (!wanted) return null;
      const copies = new Map<string, THREE.Texture>();
      for (const id of surfaces) {
        if (id === "front") {
          copies.set(id, wanted);
          continue;
        }
        const copy = wanted.clone();
        copy.needsUpdate = true;
        copies.set(id, copy);
      }
      held = { copies, of: wanted };
      return copies;
    },
  };
}

/**
 * One printable zone, resolved against a loaded model.
 *
 * Built once when the scene is, because everything in it is a property of the
 * model rather than of the design: which materials carry the zone, what shape
 * they are, and what their maps were before anything was printed on them.
 * Only the texture changes per upload.
 */
export type ArtworkZoneBinding = {
  /** The panel's measured height / width, for fitting a design into it. */
  aspect: number;
  /** Whether this zone carries the cloth coordinate a pattern is tiled in. */
  cloth: boolean;
  fit: ArtworkFit | undefined;
  materials: readonly THREE.MeshStandardMaterial[];
  relief: PrintRelief;
  /** World units per turn of this zone's unwrap, per axis, for tiling across it. */
  scale: { u: number; v: number };
  /** How much of the design is cropped on each axis, for dragging it. */
  slack: ScreenSlack;
};

/**
 * Put one design on one zone.
 *
 * The zone owns its own slack rather than sharing one, which is what lets four
 * panels of different shapes each crop their own design: a tote's side is half
 * the width of its front, so the same image fills one and is cut by the other,
 * and a single shared slack would report whichever zone was bound last.
 */
export function bindZoneArtwork(request: {
  binding: ArtworkZoneBinding;
  blankStock?: string;
  clearRelief: boolean;
  printed: boolean;
  texture: THREE.Texture | null;
  /**
   * How wide one repeat of an all-over design is, in world units.
   *
   * Handed down rather than worked out here because it is a property of the
   * product and not of this zone: every panel has to be told the same number
   * or they are not one print.
   */
  tile?: number;
  transform?: ScreenTransform;
}): void {
  const { binding, blankStock, clearRelief, printed, texture, tile, transform } =
    request;
  const tiled =
    texture !== null &&
    transform?.allOver === true &&
    tileArtwork(
      texture,
      {
        cloth: binding.cloth,
        offset: transform.offset,
        scale: binding.scale,
        tile: tile ?? 0,
      },
      binding.slack,
    );
  if (texture && !tiled && !wrapArtwork(texture, binding.fit, binding.slack)) {
    applyScreenTransform(texture, binding.aspect, transform, binding.slack);
  }
  bindArtwork({
    blankStock,
    clearRelief,
    materials: binding.materials,
    printed,
    relief: binding.relief,
    texture,
  });
}
