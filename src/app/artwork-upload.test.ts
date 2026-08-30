import { describe, expect, test } from "vitest";

import { appSchema } from "./app-schema";
import { readArtworkZones } from "./product-applicability";
import { ARTWORK_ZONE_IDS, ARTWORK_ZONE_TARGETS } from "./product-parts";
import { DEVICE_CATALOG, type DeviceId } from "./product-domain";

/**
 * Who owns an uploaded image.
 *
 * The acceptance requirement `artwork.image.upload` names this test, and it had
 * no test: `npm run test` stopped at the integrity check before the reporter
 * that asks for it ever ran, so a required piece of coverage was missing in
 * plain sight for as long as that check has been red.
 *
 * "Single owner" was written when there was one upload. There are four now, one
 * per print zone, and the thing worth holding is the same: exactly one control
 * writes each slot, and a slot exists for exactly the zones the catalog
 * declares. Two controls on one target means uploading through one silently
 * replaces what the other is showing; a zone with no uploader is a print area a
 * user cannot reach, and an uploader with no zone is a control that does
 * nothing.
 */

/** Every control in the schema, flattened out of its panels and sections. */
function controlsOf(schema: unknown): { target: string; type: string }[] {
  const found: { target: string; type: string }[] = [];
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const child of node) walk(child);
      return;
    }
    if (!node || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    if (typeof record.target === "string" && typeof record.type === "string") {
      found.push({ target: record.target, type: record.type });
    }
    for (const value of Object.values(record)) walk(value);
  };
  walk(schema);
  return found;
}

/** Control types that take source material from the user. */
const SOURCE_MATERIAL_TYPES = new Set(["fileDrop", "imagePicker", "sourceCollection"]);

const controls = controlsOf(appSchema);
const uploaders = controls.filter((control) => SOURCE_MATERIAL_TYPES.has(control.type));

describe("who owns an uploaded image", () => {
  test("screenshot fileDrop is the single source-material owner", () => {
    expect(uploaders.length).toBeGreaterThan(0);

    // One owner per target. Two controls writing the same slot is the defect
    // this is named for, and it is invisible until someone uploads twice.
    const targets = uploaders.map((control) => control.target);
    expect(new Set(targets).size, `two controls own one upload target: ${targets.join(", ")}`)
      .toBe(targets.length);

    // A fileDrop and nothing else. An imagePicker or a source collection on the
    // same material would give the runtime two answers about what was uploaded.
    expect(
      uploaders.filter((control) => control.type !== "fileDrop").map((control) => control.target),
      "source material is owned by something other than a fileDrop",
    ).toEqual([]);

    // Exactly the zones the products declare, no more and no fewer.
    expect(new Set(targets)).toEqual(new Set(Object.values(ARTWORK_ZONE_TARGETS)));
  });

  test("every zone a product declares has an upload that writes it", () => {
    const owned = new Set(uploaders.map((control) => control.target));
    for (const id of Object.keys(DEVICE_CATALOG) as DeviceId[]) {
      for (const [zone] of readArtworkZones(DEVICE_CATALOG[id])) {
        expect(ARTWORK_ZONE_IDS, `${id} declares a zone the app does not name`).toContain(zone);
        expect(
          owned.has(ARTWORK_ZONE_TARGETS[zone]),
          `${id} declares a ${zone} zone with no upload control writing ${ARTWORK_ZONE_TARGETS[zone]}`,
        ).toBe(true);
      }
    }
  });
});
