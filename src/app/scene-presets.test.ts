import { expect, test } from "vitest";

import { DEFAULT_SCENE_PRESET, SCENE_PRESET_OPTIONS, SCENE_PRESETS, readScenePresetId } from "./scene-presets";
import { SURFACE_OPTIONS } from "./surfaces";
import { LIGHT_PATTERN_OPTIONS } from "./product-domain";

/** Every field a preset has to fill in for the rig to be fully described. */
const rigFields = [
  "background", "environment", "environmentIntensity", "fill", "floorEnvironment",
  "floorReflection", "floorRoughness", "focalLength", "keyColor", "keyDirection",
  "keyIntensity", "pattern", "pose", "rim", "shadowSoftness", "surface",
  "sweepCurve", "sweepHeight", "sweepLight",
] as const;

test("each studio preset writes its whole rig in one entry", () => {
  const surfaceIds = new Set(SURFACE_OPTIONS.map((option) => option.value));
  const patternIds = new Set(LIGHT_PATTERN_OPTIONS.map((option) => option.value));

  for (const option of SCENE_PRESET_OPTIONS) {
    const preset = SCENE_PRESETS[option.value];
    expect(preset, `no preset for "${option.value}"`).toBeDefined();
    expect(preset.label).toBe(option.label);

    // A preset that leaves a field out is a preset that inherits whatever the
    // last one set, so picking it twice from different starting points would
    // give two different scenes. Every field, every time.
    for (const field of rigFields) {
      expect(preset[field], `${option.value} is missing ${field}`).toBeDefined();
    }

    // The values have to be ones the rest of the app can act on.
    expect(preset.background).toMatch(/^#[0-9a-f]{6}$/i);
    expect(preset.keyColor).toMatch(/^#[0-9a-f]{6}$/i);
    expect(preset.environment.length).toBeGreaterThan(0);
    expect(surfaceIds.has(preset.surface)).toBe(true);
    expect(patternIds.has(preset.pattern)).toBe(true);

    // Ranges, as the field comments promise them.
    for (const [field, max] of [
      ["environmentIntensity", 400], ["fill", 400], ["floorEnvironment", 100],
      ["floorReflection", 100], ["floorRoughness", 100], ["rim", 400],
      ["shadowSoftness", 100], ["sweepCurve", 100], ["sweepHeight", 100],
      ["sweepLight", 100],
    ] as const) {
      expect(preset[field], `${option.value}.${field}`).toBeGreaterThanOrEqual(0);
      expect(preset[field], `${option.value}.${field}`).toBeLessThanOrEqual(max);
    }
    // The pad reads -1..1 with 0 straight on, which is also what the schema's
    // own default for this control says; the rig consumes it unconverted.
    expect(preset.keyDirection.x).toBeGreaterThanOrEqual(-1);
    expect(preset.keyDirection.x).toBeLessThanOrEqual(1);
    expect(preset.keyDirection.y).toBeGreaterThanOrEqual(-1);
    expect(preset.keyDirection.y).toBeLessThanOrEqual(1);
    expect(preset.focalLength).toBeGreaterThan(0);
    expect(preset.pose.position.length).toBe(3);
    expect(preset.pose.up.length).toBe(3);
  }

  // Presets have to be distinguishable: two that light the scene identically
  // are one preset with two names.
  const signatures = SCENE_PRESET_OPTIONS.map((option) => {
    const preset = SCENE_PRESETS[option.value];
    return JSON.stringify(rigFields.map((field) => preset[field]));
  });
  expect(new Set(signatures).size).toBe(signatures.length);

  expect(readScenePresetId("nonsense")).toBe(DEFAULT_SCENE_PRESET);
});
