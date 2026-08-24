/**
 * The loop, as something a portfolio page can hold.
 *
 * An exported video is the right shape for a loop that sits in a box, and the
 * wrong one for a device that has to float on somebody else's background:
 * alpha in video is a standing browser argument — WebM carries it where Safari
 * will not, and Safari wants it as HEVC in an MP4 — so a page that wants the
 * shadow falling on its own colour cannot rely on any single file. A sequence
 * of WebP frames has alpha everywhere, at the cost of carrying every frame
 * whole because there is no interframe compression to lean on.
 *
 * That cost is why the defaults below are what they are, and why the bundle
 * says so in the readme it ships with.
 */
import { evaluateToolcraftTimelineValues } from "@/toolcraft/runtime";
import type { ToolcraftState } from "@/toolcraft/runtime";

/**
 * Fifteen frames a second, which is not a video frame rate.
 *
 * A six second turn is sixty degrees a second, so fifteen frames puts four
 * degrees between them — smooth for something rotating this slowly, and a
 * third of the ninety frames a thirty a second loop would need. Every frame is
 * carried whole, so the frame rate is the file size.
 */
export const embedFramesPerSecond = 15;

/**
 * Rendered at 540 across rather than the artboard's own 1080.
 *
 * A portfolio embed is usually a few hundred pixels wide, and this is the one
 * export where the weight of the thing is the point. Doubling the width would
 * roughly quadruple a bundle that is already megabytes.
 */
export const embedFrameWidthPx = 540;

export type EmbedFrameTiming = {
  readonly index: number;
  readonly timeSeconds: number;
};

export type EmbedManifest = {
  readonly durationSeconds: number;
  readonly fps: number;
  readonly frameCount: number;
  readonly frames: readonly string[];
  readonly height: number;
  readonly width: number;
};

export function getEmbedFrameCount(durationSeconds: number, fps = embedFramesPerSecond): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return 1;

  return Math.max(1, Math.round(durationSeconds * fps));
}

/**
 * Where each frame is taken from, over a loop that closes.
 *
 * The last frame is not the end of the loop, it is one frame short of it. A
 * turn keyed from zero to three hundred and sixty draws the same picture at
 * both ends, so a sequence that included both would hold that picture for two
 * frames every time round — a visible hitch at the seam, in the one place a
 * turntable is meant to be seamless.
 */
export function getEmbedFrameTimings(
  durationSeconds: number,
  fps = embedFramesPerSecond,
): readonly EmbedFrameTiming[] {
  const frameCount = getEmbedFrameCount(durationSeconds, fps);
  const safeDuration = Math.max(0, durationSeconds);

  return Array.from({ length: frameCount }, (_unused, index) => ({
    index,
    timeSeconds: (index / frameCount) * safeDuration,
  }));
}

export function getEmbedFrameFileName(index: number, frameCount: number): string {
  const width = String(Math.max(1, frameCount - 1)).length;

  return `frames/${String(index).padStart(width, "0")}.webp`;
}

export function createEmbedManifest({
  durationSeconds,
  fps = embedFramesPerSecond,
  height,
  width,
}: {
  durationSeconds: number;
  fps?: number;
  height: number;
  width: number;
}): EmbedManifest {
  const frameCount = getEmbedFrameCount(durationSeconds, fps);

  return {
    durationSeconds: Math.max(0, durationSeconds),
    fps,
    frameCount,
    frames: Array.from({ length: frameCount }, (_unused, index) =>
      getEmbedFrameFileName(index, frameCount),
    ),
    height,
    width,
  };
}

/** The values the product would hold at one moment of its own timeline. */
export function getEmbedFrameValues(
  state: ToolcraftState,
  timeSeconds: number,
): Record<string, unknown> {
  return {
    ...evaluateToolcraftTimelineValues(state, timeSeconds),
    // The whole reason this export exists rather than a video: the device has
    // to land on whatever colour the page behind it happens to be.
    "export.includeBackground": false,
  };
}
