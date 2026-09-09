import type { ToolcraftState } from "../state/types";
import { ToolcraftArtifactExportError } from "./export-error";

export const toolcraftImageExportFormatTarget = "export.image.format";
export const toolcraftImageExportResolutionTarget = "export.image.resolution";
export const toolcraftVideoExportFormatTarget = "export.video.format";
export const toolcraftVideoExportFrameRateTarget = "export.video.frameRate";
export const toolcraftVideoExportResolutionTarget = "export.video.resolution";

export type ToolcraftImageExportFormat = "jpg" | "png";
export type ToolcraftImageExportPresetResolution = "2k" | "4k" | "8k";
export type ToolcraftVideoExportFormat = "mp4" | "webm";
export type ToolcraftVideoExportPresetResolution = "4k" | "current";

/**
 * How many frames a second of video is cut into.
 *
 * Two, because these are the two that mean something. Thirty is the rate this
 * runtime encoded at before the number was a choice, and sixty is what a slow
 * camera move needs: at thirty a pan across a product steps rather than
 * travels, and the stepping is the thing people call "cheap" without being
 * able to say why. It costs twice the frames to render and roughly twice the
 * bytes.
 */
export type ToolcraftVideoExportFrameRate = 30 | 60;

export type ToolcraftResolvedImageExportSettings = Readonly<{
  format: ToolcraftImageExportFormat;
  resolution: ToolcraftImageExportPresetResolution;
}>;

export type ToolcraftResolvedVideoExportSettings = Readonly<{
  format: ToolcraftVideoExportFormat;
  frameRate: ToolcraftVideoExportFrameRate;
  resolution: ToolcraftVideoExportPresetResolution;
}>;

function getSettingValue(
  state: ToolcraftState,
  target: string,
  fallback: string,
): unknown {
  return state.values[target] ?? state.defaults[target] ?? fallback;
}

function invalidSetting(target: string): never {
  throw new ToolcraftArtifactExportError({
    code: "invalid-export-setting",
    message: `Toolcraft export setting ${target} is invalid.`,
    target,
  });
}

function resolveImageFormat(state: ToolcraftState): ToolcraftImageExportFormat {
  const value = getSettingValue(state, toolcraftImageExportFormatTarget, "png");
  return value === "jpg" || value === "png"
    ? value
    : invalidSetting(toolcraftImageExportFormatTarget);
}

function resolveImageResolution(
  state: ToolcraftState,
): ToolcraftImageExportPresetResolution {
  const value = getSettingValue(
    state,
    toolcraftImageExportResolutionTarget,
    "4k",
  );
  return value === "2k" || value === "4k" || value === "8k"
    ? value
    : invalidSetting(toolcraftImageExportResolutionTarget);
}

function resolveVideoFormat(state: ToolcraftState): ToolcraftVideoExportFormat {
  const value = getSettingValue(state, toolcraftVideoExportFormatTarget, "mp4");
  return value === "mp4" || value === "webm"
    ? value
    : invalidSetting(toolcraftVideoExportFormatTarget);
}

function resolveVideoResolution(
  state: ToolcraftState,
): ToolcraftVideoExportPresetResolution {
  const value = getSettingValue(
    state,
    toolcraftVideoExportResolutionTarget,
    "current",
  );
  return value === "4k" || value === "current"
    ? value
    : invalidSetting(toolcraftVideoExportResolutionTarget);
}

/**
 * The rate, from a control that may hold a string or a number.
 *
 * A select hands back its option's string; a workspace written before this
 * existed has no value at all and falls to the default. Anything else is
 * refused rather than rounded, because a frame rate the schedule and the
 * encoder disagreed about would produce a file whose motion runs at the wrong
 * speed — which looks like a bad animation rather than like a bad setting.
 */
function resolveVideoFrameRate(state: ToolcraftState): ToolcraftVideoExportFrameRate {
  const value = getSettingValue(state, toolcraftVideoExportFrameRateTarget, "60");
  const rate = typeof value === "string" ? Number(value) : value;

  return rate === 30 || rate === 60
    ? rate
    : invalidSetting(toolcraftVideoExportFrameRateTarget);
}

export function resolveToolcraftImageExportSettings(
  state: ToolcraftState,
): ToolcraftResolvedImageExportSettings {
  return Object.freeze({
    format: resolveImageFormat(state),
    resolution: resolveImageResolution(state),
  });
}

export function resolveToolcraftVideoExportSettings(
  state: ToolcraftState,
): ToolcraftResolvedVideoExportSettings {
  return Object.freeze({
    format: resolveVideoFormat(state),
    frameRate: resolveVideoFrameRate(state),
    resolution: resolveVideoResolution(state),
  });
}
