import { DEVICE_CATALOG, type DeviceDefinition, type DeviceId } from "./product-domain";
import {
  ARTWORK_ZONE_IDS,
  COLOR_PART_IDS,
  type ArtworkZone,
  type ArtworkZoneId,
  type ColorPartId,
} from "./product-parts";

/**
 * Which products offer which controls, derived from the catalog.
 *
 * Every list here is computed rather than written down, and that is the whole
 * point of the file: declaring a slot in the catalog is the single act that
 * offers its control, so a second list kept by hand is exactly how a control
 * ends up showing for a product it does nothing to. Split out of
 * `product-domain.ts`, which holds the catalog itself and is at its line
 * budget.
 */

/**
 * The devices a table is offered for, read off the catalog rather than listed.
 *
 * Kept derived so the two can never disagree: giving a device a size is the
 * single act that offers it a table, and forgetting to also add it to a list
 * somewhere else is exactly the kind of quiet mismatch that leaves a control
 * showing for a device it does nothing to.
 */
export const SURFACE_DEVICES: readonly DeviceId[] = (
  Object.keys(DEVICE_CATALOG) as DeviceId[]
).filter((id) => DEVICE_CATALOG[id].surface !== undefined);

/**
 * Which products offer each colour slot, derived rather than listed.
 *
 * Same reason the surface list is derived: declaring a slot in the catalog is
 * the single act that offers it, and a second list kept by hand is how a
 * control ends up showing for a product it does nothing to.
 */
function productsOfferingColorPart(part: ColorPartId): readonly DeviceId[] {
  return (Object.keys(DEVICE_CATALOG) as DeviceId[]).filter(
    (id) => DEVICE_CATALOG[id].colorParts?.[part] !== undefined,
  );
}

export const COLOR_PART_DEVICES: Readonly<
  Record<ColorPartId, readonly DeviceId[]>
> = {
  accent: productsOfferingColorPart("accent"),
  main: productsOfferingColorPart("main"),
  trim: productsOfferingColorPart("trim"),
};

/**
 * Every printable zone of a product, with its front filled in.
 *
 * The catalog declares only the zones past the first, because `front` is
 * `screenMaterial` and every product already names that — including the
 * devices, whose front is a display rather than a panel. Reading them through
 * here is what lets the renderer, the preview and the export all walk the same
 * list without each deciding separately what a product with no `artworkZones`
 * means.
 */
export function readArtworkZones(
  device: DeviceDefinition,
): ReadonlyMap<ArtworkZoneId, ArtworkZone> {
  const zones = new Map<ArtworkZoneId, ArtworkZone>();
  zones.set("front", {
    fit: device.artworkFit,
    ...device.artworkZones?.front,
    material: device.screenMaterial,
  });
  for (const id of ARTWORK_ZONE_IDS) {
    if (id === "front") continue;
    const zone = device.artworkZones?.[id];
    if (zone) zones.set(id, { fit: device.artworkFit, ...zone });
  }
  return zones;
}

/**
 * The templates a product ships, in the order its slots appear.
 *
 * Empty for every device, which is what keeps the download out of their panel:
 * a screen has proportions but no printed sheet to draw against.
 */
export function readArtworkTemplates(
  device: DeviceDefinition,
): readonly { file: string; zone: ArtworkZoneId }[] {
  return [...readArtworkZones(device)]
    .filter(([, zone]) => zone.template)
    .map(([id, zone]) => ({ file: zone.template as string, zone: id }));
}

/** Which products have a template to hand back. */
export const ARTWORK_TEMPLATE_DEVICES: readonly DeviceId[] = (
  Object.keys(DEVICE_CATALOG) as DeviceId[]
).filter((id) => readArtworkTemplates(DEVICE_CATALOG[id]).length > 0);

/**
 * Which products offer each upload slot.
 *
 * `front` is every product, because every product has a surface the design
 * lands on. The other three are the ones that declared them, which is what
 * keeps three uploaders off a bottle that takes one image around its body.
 */
function productsOfferingZone(zone: ArtworkZoneId): readonly DeviceId[] {
  const ids = Object.keys(DEVICE_CATALOG) as DeviceId[];
  if (zone === "front") return ids;
  return ids.filter((id) => DEVICE_CATALOG[id].artworkZones?.[zone] !== undefined);
}

export const ARTWORK_ZONE_DEVICES: Readonly<
  Record<ArtworkZoneId, readonly DeviceId[]>
> = {
  back: productsOfferingZone("back"),
  front: productsOfferingZone("front"),
  left: productsOfferingZone("left"),
  right: productsOfferingZone("right"),
};

/**
 * Which products print rather than display.
 *
 * The background under a design is a print question. A screen showing black
 * where a screenshot is transparent is a screen behaving correctly, so a
 * device is not offered the control.
 */
export const PRINT_DEVICES: readonly DeviceId[] = (
  Object.keys(DEVICE_CATALOG) as DeviceId[]
).filter((id) => DEVICE_CATALOG[id].artworkSurface === "print");

/**
 * Which products can take one design across everything they print.
 *
 * A product with one printable surface already puts the whole design on it, so
 * offering it an all-over print would be offering it the state it is in. Two
 * or more is where the question starts: does this image go on the front, or
 * does it run across the front, the back and both sleeves at one size.
 */
export const ALL_OVER_DEVICES: readonly DeviceId[] = (
  Object.keys(DEVICE_CATALOG) as DeviceId[]
).filter(
  (id) =>
    DEVICE_CATALOG[id].artworkSurface === "print" &&
    readArtworkZones(DEVICE_CATALOG[id]).size > 1,
);
