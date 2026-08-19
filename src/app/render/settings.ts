import { DEFAULT_DEVICE, DEFAULT_FINISH } from "../product-domain";
import type { ScreenTransform } from "./device-scene";
import type { RasterSettings } from "./raster-renderer";

function vec(
  values: Record<string, unknown>,
  key: string,
): { x: number; y: number } {
  const value = values[key];
  const raw =
    typeof value === "object" && value !== null
      ? (value as { x?: number; y?: number })
      : {};
  return {
    x: Number.isFinite(raw.x) ? Number(raw.x) : 0.5,
    y: Number.isFinite(raw.y) ? Number(raw.y) : 0.5,
  };
}

function signedVec(
  values: Record<string, unknown>,
  key: string,
): { x: number; y: number } {
  const raw = vec(values, key);
  return { x: (raw.x - 0.5) * 2, y: (raw.y - 0.5) * 2 };
}

function num(values: Record<string, unknown>, key: string, fallback: number) {
  const value = Number(values[key]);
  return Number.isFinite(value) ? value : fallback;
}

function str(values: Record<string, unknown>, key: string, fallback: string) {
  const value = values[key];
  return typeof value === "string" && value ? value : fallback;
}

/**
 * Read the screen-fit controls.
 *
 * Separate from `readRasterSettings` on purpose: these change only the display
 * texture's mapping, so they must not appear in the key that decides whether
 * the model and environment are rebuilt.
 */
export function readScreenTransform(
  values: Record<string, unknown>,
): ScreenTransform {
  const fit = values["artwork.fit"];
  return {
    fit: fit === "fit" || fit === "stretch" ? fit : "fill",
    offset: vec(values, "artwork.offset"),
    scale: num(values, "artwork.scale", 100),
    stretch: vec(values, "artwork.stretch"),
  };
}

/**
 * Read runtime state into renderer settings.
 *
 * One place, so preview and export cannot drift: both call this, which is what
 * makes the exported frame provably the same image the preview showed.
 *
 * Exposure is fixed rather than exposed as a control. The environment is the
 * lighting model now, and a separate brightness slider invites correcting a
 * badly-chosen HDRI instead of choosing a better one.
 */
export function readRasterSettings(
  values: Record<string, unknown>,
): RasterSettings {
  return {
    backgroundColor: str(values, "scene.background", "#0d0d10"),
    device: str(values, "device.model", DEFAULT_DEVICE),
    environment: str(values, "studio.environment", "studio-soft"),
    exposure: 100,
    finish: str(values, "device.finish", DEFAULT_FINISH),
    floor: {
      environment: num(values, "floor.environment", 100) / 100,
      reflection: num(values, "floor.reflection", 0) / 100,
      roughness: num(values, "floor.roughness", 92) / 100,
    },
    focalLength: num(values, "camera.focalLength", 85),
    sweep: {
      curve: num(values, "backdrop.curve", 45) / 100,
      height: num(values, "backdrop.height", 0) / 100,
      light: num(values, "backdrop.light", 0) / 100,
    },
    lighting: {
      environmentIntensity: num(values, "studio.intensity", 100) / 100,
      fillIntensity: num(values, "light.fill", 30) / 100,
      keyColor: str(values, "light.keyColor", "#FFFFFF"),
      // The pad is 0..1 with 0.5 centred; the rig wants -1..1 with 0 straight on.
      keyDirection: signedVec(values, "light.keyDirection"),
      keyIntensity: num(values, "light.keyIntensity", 110) / 100,
      rimIntensity: num(values, "light.rim", 0) / 100,
      shadowSoftness: num(values, "light.shadowSoftness", 34) / 100,
    },
    showBackground: values["export.includeBackground"] !== false,
  };
}
