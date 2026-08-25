import type { ToolcraftVideoExportFormat } from "./artifact-export-settings";
import { ToolcraftArtifactExportError } from "./export-error";

export const TOOLCRAFT_MAX_VIDEO_ARTIFACT_BYTES = 96 * 1024 * 1024;

export type ToolcraftVideoCodec = "av1" | "avc" | "vp8" | "vp9";

export type ToolcraftVideoEncodingSupport = Readonly<{
  av1: boolean;
  avc: boolean;
  vp8: boolean;
  vp9: boolean;
}>;

export type ToolcraftVideoEncodingPolicy = Readonly<{
  bitrate: number;
  codec: ToolcraftVideoCodec;
  extension: ".mp4" | ".webm";
  mediaType: "video/mp4" | "video/webm";
}>;

type ToolcraftVideoEncodingCandidate = Readonly<{
  codec: ToolcraftVideoCodec;
  extension: ".mp4" | ".webm";
  mediaType: "video/mp4" | "video/webm";
}>;

/**
 * MP4, in order of how widely the result will play.
 *
 * H.264 first, because it plays everywhere. AV1 second, because a browser
 * without H.264 is common rather than exotic — Chromium builds without the
 * proprietary decoders, which is most Linux ones, encode AV1 happily and put
 * it in an MP4 quite legally. Before this the list held only H.264, so asking
 * for MP4 on such a machine quietly produced a WebM instead: the person chose
 * a container and got a different one.
 */
const mp4Candidates: readonly ToolcraftVideoEncodingCandidate[] = Object.freeze([
  Object.freeze({ codec: "avc", extension: ".mp4", mediaType: "video/mp4" }),
  Object.freeze({ codec: "av1", extension: ".mp4", mediaType: "video/mp4" }),
] as const);
const webmCandidates: readonly ToolcraftVideoEncodingCandidate[] = Object.freeze([
  Object.freeze({ codec: "vp9", extension: ".webm", mediaType: "video/webm" }),
  Object.freeze({ codec: "vp8", extension: ".webm", mediaType: "video/webm" }),
]);

export function getToolcraftVideoExportBitrate(
  width: number,
  height: number,
): number {
  return Math.max(
    2_000_000,
    Math.min(12_000_000, Math.round(width * height * 30 * 0.05)),
  );
}

function assertArtifactBudget(bitrate: number, durationSeconds: number): void {
  const projectedBytes = (bitrate * durationSeconds * 1.1) / 8;
  if (projectedBytes > TOOLCRAFT_MAX_VIDEO_ARTIFACT_BYTES) {
    throw new ToolcraftArtifactExportError({
      code: "video-artifact-too-large",
      message: "The selected video export exceeds Toolcraft's artifact limit.",
    });
  }
}

export function resolveToolcraftVideoEncodingPolicy({
  durationSeconds,
  height,
  requestedFormat,
  support,
  width,
}: Readonly<{
  durationSeconds: number;
  height: number;
  requestedFormat: ToolcraftVideoExportFormat;
  support: ToolcraftVideoEncodingSupport;
  width: number;
}>): ToolcraftVideoEncodingPolicy {
  const bitrate = getToolcraftVideoExportBitrate(width, height);
  assertArtifactBudget(bitrate, durationSeconds);
  // The requested container is tried in full before falling back to the other
  // one, so a missing H.264 encoder costs the codec rather than the format.
  const candidates =
    requestedFormat === "mp4"
      ? [...mp4Candidates, ...webmCandidates]
      : [...webmCandidates, ...mp4Candidates];
  const candidate = candidates.find((item) => support[item.codec]);

  if (!candidate) {
    throw new ToolcraftArtifactExportError({
      code: "video-encoder-unavailable",
      message: "This browser has no supported timestamped video encoder.",
    });
  }

  return Object.freeze({ ...candidate, bitrate });
}
