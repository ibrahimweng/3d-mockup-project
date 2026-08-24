import { zipSync, strToU8 } from "fflate";

import type { ToolcraftState } from "@/toolcraft/runtime";
import {
  createEmbedManifest,
  embedFrameWidthPx,
  embedFramesPerSecond,
  getEmbedFrameFileName,
  getEmbedFrameTimings,
  getEmbedFrameValues,
} from "./embed-export";
import { createEmbedPlayerHtml, createEmbedReadme } from "./embed-player";
import { mockupExportRenderer } from "./export-renderer";

/** WebP holds alpha at every quality; this is where the device stops looking soft. */
const embedFrameQuality = 0.85;

export type EmbedBundleProgress = (completed: number, total: number) => void;

export type EmbedBundle = {
  readonly bytes: Uint8Array;
  readonly fileName: string;
  readonly frameCount: number;
};

function getEmbedFrameSize(state: ToolcraftState): { height: number; width: number } {
  const canvasWidth = Math.max(1, state.canvas.size.width);
  const canvasHeight = Math.max(1, state.canvas.size.height);
  const width = Math.min(canvasWidth, embedFrameWidthPx);

  return {
    // Rounded to even numbers because an odd dimension leaves a half pixel
    // that some decoders round the other way, which shows as the device
    // shifting by one pixel between frames.
    height: Math.max(2, Math.round((width * canvasHeight) / canvasWidth / 2) * 2),
    width: Math.max(2, Math.round(width / 2) * 2),
  };
}

function encodeWebp(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("The browser would not encode an embed frame as WebP."));
          return;
        }
        blob
          .arrayBuffer()
          .then((buffer) => resolve(new Uint8Array(buffer)))
          .catch(reject);
      },
      "image/webp",
      embedFrameQuality,
    );
  });
}

/**
 * Draw the whole loop, then wrap it up as something droppable.
 *
 * Each frame is rendered through the same path an image export takes, at the
 * values the timeline evaluates to at that moment, with the background turned
 * off. Reusing that path rather than reaching for the preview's canvas is what
 * makes the frames match what an Export PNG of the same moment would give.
 */
export async function createMockupEmbedBundle({
  onProgress,
  state,
}: {
  onProgress?: EmbedBundleProgress;
  state: ToolcraftState;
}): Promise<EmbedBundle> {
  const durationSeconds = state.timeline.durationSeconds;
  const timings = getEmbedFrameTimings(durationSeconds, embedFramesPerSecond);
  const { height, width } = getEmbedFrameSize(state);
  const canvas = document.createElement("canvas");

  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("The browser would not give the embed export a canvas to draw on.");
  }

  const files: Record<string, Uint8Array> = {};

  for (const timing of timings) {
    // Cleared rather than painted over, or a transparent frame keeps whatever
    // the frame before it left behind wherever the device no longer covers.
    context.clearRect(0, 0, width, height);
    await mockupExportRenderer.renderFrame({
      context,
      frame: { height, width, x: 0, y: 0 },
      pixelRatio: 1,
      // The product's own renderFrame draws from the state it is handed and
      // never consults the pipeline, so there is nothing to pass one for.
      rendererPipeline: null,
      state: {
        ...state,
        values: getEmbedFrameValues(state, timing.timeSeconds),
      },
      timeSeconds: timing.timeSeconds,
      timelineProgress: durationSeconds > 0 ? timing.timeSeconds / durationSeconds : 0,
    });
    files[getEmbedFrameFileName(timing.index, timings.length)] = await encodeWebp(canvas);
    onProgress?.(timing.index + 1, timings.length);
  }

  const manifest = createEmbedManifest({
    durationSeconds,
    fps: embedFramesPerSecond,
    height,
    width,
  });
  const frameBytes = Object.values(files).reduce((total, bytes) => total + bytes.length, 0);

  files["index.html"] = strToU8(createEmbedPlayerHtml(manifest, "Mockup"));
  files["manifest.json"] = strToU8(`${JSON.stringify(manifest, null, 2)}\n`);
  files["README.md"] = strToU8(createEmbedReadme(manifest, frameBytes));

  return {
    // Stored rather than deflated: WebP is already compressed, so deflating it
    // again spends time to save almost nothing.
    bytes: zipSync(files, { level: 0 }),
    fileName: "mockup-embed.zip",
    frameCount: timings.length,
  };
}

/** Hand the bundle to the browser the way any other download arrives. */
export function downloadEmbedBundle(bundle: EmbedBundle): void {
  const blob = new Blob([bundle.bytes as BlobPart], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = bundle.fileName;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // Released on the next turn of the loop, because revoking it in the same one
  // can beat the click to the download.
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
