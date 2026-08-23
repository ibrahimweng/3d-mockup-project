import {
  DEFAULT_DEVICE,
  DEFAULT_FINISH,
  readLightPatternId,
} from "../product-domain";
import { DEFAULT_SURFACE } from "../surfaces";
import type { ScreenTransform } from "./device-scene";
import type { RasterSettings } from "./raster-renderer";

/**
 * Read an X/Y pad.
 *
 * A pad reports -1..1 with zero at its centre, and its y axis runs down the
 * screen. Everything here was reading it as 0..1 with 0.5 in the middle, which
 * put every pad's neutral a quarter of the way to a corner, drew every handle
 * off centre, and left the whole left half of two pads clamped flat. Read the
 * pad in the pad's own units and convert at the point of use.
 */
function pad(
  values: Record<string, unknown>,
  key: string,
): { x: number; y: number } {
  const value = values[key];
  const raw =
    typeof value === "object" && value !== null
      ? (value as { x?: number; y?: number })
      : {};
  const axis = (component: unknown): number =>
    Number.isFinite(component) ? Math.min(1, Math.max(-1, Number(component))) : 0;
  return { x: axis(raw.x), y: axis(raw.y) };
}

/** A pad reported as 0..1 about a neutral half, for the texture maths. */
function unitPad(
  values: Record<string, unknown>,
  key: string,
): { x: number; y: number } {
  const raw = pad(values, key);
  return { x: 0.5 + raw.x / 2, y: 0.5 + raw.y / 2 };
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
    offset: unitPad(values, "artwork.offset"),
    scale: num(values, "artwork.scale", 100),
    stretch: pad(values, "artwork.stretch"),
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
 *
 * The canvas mode arrives as an argument rather than out of `values` because
 * it is runtime state rather than a control the product owns, and it is here
 * rather than at the two call sites for the reason everything else is: this is
 * the one place the preview and the export both read, so it is the one place
 * they cannot disagree about how the shot is framed.
 */
export function readRasterSettings(
  values: Record<string, unknown>,
  canvasMode: "finite" | "infinite" = "finite",
): RasterSettings {
  return {
    backgroundColor: str(values, "scene.background", "#0d0d10"),
    device: str(values, "device.model", DEFAULT_DEVICE),
    environment: str(values, "studio.environment", "studio-soft"),
    exposure: 100,
    finish: str(values, "device.finish", DEFAULT_FINISH),
    fit: canvasMode === "infinite" ? "scene" : "artboard",
    floor: {
      environment: num(values, "floor.environment", 100) / 100,
      reflection: num(values, "floor.reflection", 0) / 100,
      roughness: num(values, "floor.roughness", 92) / 100,
    },
    focalLength: num(values, "camera.focalLength", 85),
    framing: pad(values, "camera.framing"),
    spin: num(values, "device.spin", 0),
    surface: { kind: str(values, "surface.kind", DEFAULT_SURFACE) },
    zoom: num(values, "camera.zoom", 100) / 100,
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
      keyDirection: pad(values, "light.keyDirection"),
      keyIntensity: num(values, "light.keyIntensity", 110) / 100,
      rimIntensity: num(values, "light.rim", 0) / 100,
      shadowSoftness: num(values, "light.shadowSoftness", 34) / 100,
      pattern: readLightPatternId(values["light.pattern"]),
    },
    showBackground: values["export.includeBackground"] !== false,
  };
}
