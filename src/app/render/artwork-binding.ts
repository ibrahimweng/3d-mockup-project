import * as THREE from "three";

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
      metalnessMap: THREE.Texture | null;
      normalMap: THREE.Texture | null;
      roughnessMap: THREE.Texture | null;
    }
  >();
  if (!clearRelief) return relief;

  for (const material of materials) {
    relief.set(material, {
      aoMap: material.aoMap,
      metalnessMap: material.metalnessMap,
      normalMap: material.normalMap,
      roughnessMap: material.roughnessMap,
    });
  }
  return relief;
}

export function bindArtwork(request: {
  clearRelief: boolean;
  materials: readonly THREE.MeshStandardMaterial[];
  printed: boolean;
  relief: PrintRelief;
  texture: THREE.Texture | null;
}): void {
  const { clearRelief, materials, printed, relief, texture } = request;

  for (const material of materials) {
    material.map = texture;

    if (printed) {
      // A coloured surface under the design would tint it, so the base colour
      // goes white for as long as there is something printed on it.
      if (texture) material.color.set("#ffffff");
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
