import { expect, test } from "vitest";

import {
  DEFAULT_SURFACE,
  SURFACE_DEFINITIONS,
  SURFACE_OPTIONS,
  readSurfaceDefinition,
  readSurfaceId,
} from "./surfaces";

test("surface stands the device on a named material", () => {
  expect(SURFACE_OPTIONS.length).toBe(SURFACE_DEFINITIONS.length);

  for (const definition of SURFACE_DEFINITIONS) {
    // Each surface is a full material description, not a colour with a name.
    expect(definition.label.length).toBeGreaterThan(0);
    expect(definition.color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(definition.metalness).toBeGreaterThanOrEqual(0);
    expect(definition.metalness).toBeLessThanOrEqual(1);
    expect(definition.roughness).toBeGreaterThanOrEqual(0);
    expect(definition.roughness).toBeLessThanOrEqual(1);
    expect(definition.environmentShare).toBeGreaterThanOrEqual(0);
    expect(definition.environmentShare).toBeLessThanOrEqual(1);
    expect(definition.tiles).toBeGreaterThan(0);

    // A textured surface names every map it needs. A material with an albedo
    // and no roughness map is lit as if it were uniformly polished, which is
    // what makes stone read as plastic.
    if (definition.maps !== null) {
      expect(definition.maps.albedo.length).toBeGreaterThan(0);
      expect(definition.maps.normal.length).toBeGreaterThan(0);
      expect(definition.maps.roughness.length).toBeGreaterThan(0);
    }

    // Bounce is a share of a colour, so both halves have to be sane or the
    // floor tints the device by an amount nobody chose.
    expect(definition.bounce.share).toBeGreaterThanOrEqual(0);
    expect(definition.bounce.share).toBeLessThanOrEqual(1);
    expect(definition.bounce.color).toMatch(/^#[0-9a-f]{6}$/i);
  }

  // "None" is the device standing on nothing, so it carries no maps and adds
  // no bounce: it has to be genuinely absent rather than a pale material.
  const none = readSurfaceDefinition("none");
  expect(none.maps).toBeNull();
  expect(none.bounce.share).toBe(0);

  // Every option resolves, and a stale one falls back rather than throwing.
  for (const option of SURFACE_OPTIONS) {
    expect(readSurfaceDefinition(option.value).label).toBe(option.label);
  }
  expect(readSurfaceId("granite")).toBe(DEFAULT_SURFACE);
});
