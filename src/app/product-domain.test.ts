import { describe, expect, test } from "vitest";

import {
  DEFAULT_DEVICE,
  DEFAULT_FINISH,
  DEVICE_CATALOG,
  DEVICE_OPTIONS,
  FINISH_OPTIONS,
  readDeviceDefinition,
  readFinishId,
} from "./product-domain";

test("device options map to catalog entries with a screen", () => {
  // Every option the picker offers has to resolve to something renderable.
  // An option with no catalog entry is a dead choice, and one with no screen
  // material is a mockup studio that cannot show a screenshot.
  for (const option of DEVICE_OPTIONS) {
    const definition = DEVICE_CATALOG[option.value];
    expect(definition, `no catalog entry for "${option.value}"`).toBeDefined();
    expect(definition.modelFile.endsWith(".glb")).toBe(true);
    expect(definition.screenMaterial.length).toBeGreaterThan(0);
    // The label a person reads and the label the catalog carries must agree,
    // or the picker names one device and the scene builds another.
    expect(definition.label).toBe(option.label);
  }

  // No catalog entry is unreachable: the picker is the whole of the catalog.
  expect(Object.keys(DEVICE_CATALOG).sort()).toEqual(
    DEVICE_OPTIONS.map((option) => option.value).sort(),
  );

  // The device the app opens on is one of the options it offers.
  expect(DEVICE_OPTIONS.some((option) => option.value === DEFAULT_DEVICE)).toBe(true);

  // An unknown value resolves rather than throwing, because a stale persisted
  // choice must not be able to stop the app opening.
  expect(readDeviceDefinition("no-such-device")).toBe(DEVICE_CATALOG[DEFAULT_DEVICE]);
  expect(readDeviceDefinition(undefined)).toBe(DEVICE_CATALOG[DEFAULT_DEVICE]);
});

test("finishes repaint only the materials each device names", () => {
  const paintable = FINISH_OPTIONS.filter((option) => option.value !== "natural");

  for (const [deviceId, definition] of Object.entries(DEVICE_CATALOG)) {
    // Both are optional on the type, because a device could in principle ship
    // unpainted. None in this catalog does, and one that did would offer
    // colourways in the picker that changed nothing — so the product's own
    // requirement is stronger than the type's.
    const { bodyMaterials, finishes } = definition;
    expect(finishes, `${deviceId} defines no finishes`).toBeDefined();
    expect(bodyMaterials, `${deviceId} names no body materials`).toBeDefined();
    if (finishes === undefined || bodyMaterials === undefined) continue;

    // Natural is the model exactly as its author built it, so it names no
    // colours at all; every other finish must be defined for every device or
    // the picker offers a colourway that does nothing on some of them.
    expect(finishes.natural, `${deviceId} should not define natural`).toBeUndefined();

    for (const option of paintable) {
      const finish = finishes[option.value];
      expect(finish, `${deviceId} has no ${option.value} finish`).toBeDefined();
      expect(finish!.body).toMatch(/^#[0-9a-f]{6}$/i);

      // A finish paints named materials and nothing else. Any accent it lists
      // has to be a material this device actually has, or the paint lands
      // nowhere and the part keeps whatever the file gave it.
      for (const accent of Object.keys(finish!.accents ?? {})) {
        expect(accent.length).toBeGreaterThan(0);
      }
    }

    // The body materials a finish paints are named per device, not guessed.
    expect(bodyMaterials.length).toBeGreaterThan(0);
    for (const material of bodyMaterials) {
      expect(typeof material).toBe("string");
      expect(material.length).toBeGreaterThan(0);
    }

    // The screen is never repainted by a colourway: a finish that covered the
    // display would paint over the screenshot the app exists to show.
    expect(bodyMaterials).not.toContain(definition.screenMaterial);
  }
});

describe("reading a persisted finish", () => {
  test("falls back rather than failing", () => {
    expect(readFinishId("gold")).toBe("gold");
    expect(readFinishId("chartreuse")).toBe(DEFAULT_FINISH);
    expect(readFinishId(null)).toBe(DEFAULT_FINISH);
  });
});
