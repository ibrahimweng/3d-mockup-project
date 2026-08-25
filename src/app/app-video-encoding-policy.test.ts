import { describe, expect, test } from "vitest";

import {
  resolveToolcraftVideoEncodingPolicy,
  type ToolcraftVideoEncodingSupport,
} from "@/toolcraft/runtime/export/video-encoding-policy";

const everything: ToolcraftVideoEncodingSupport = {
  av1: true,
  avc: true,
  vp8: true,
  vp9: true,
};

function resolve(support: Partial<ToolcraftVideoEncodingSupport>, requestedFormat: "mp4" | "webm") {
  return resolveToolcraftVideoEncodingPolicy({
    durationSeconds: 6,
    height: 1350,
    requestedFormat,
    support: { av1: false, avc: false, vp8: false, vp9: false, ...support },
    width: 1080,
  });
}

describe("choosing an encoder for MP4", () => {
  test("H.264 when it is there, because it plays everywhere", () => {
    expect(resolve(everything, "mp4")).toMatchObject({
      codec: "avc",
      extension: ".mp4",
      mediaType: "video/mp4",
    });
  });

  test("AV1 keeps the container when H.264 is missing", () => {
    // The case this exists for. A Chromium built without the proprietary
    // decoders — most Linux ones — encodes AV1 and can hold it in an MP4.
    // Before this the list held only H.264, so asking for MP4 quietly
    // produced a WebM: the person chose a container and got another.
    expect(resolve({ av1: true, vp8: true, vp9: true }, "mp4")).toMatchObject({
      codec: "av1",
      extension: ".mp4",
      mediaType: "video/mp4",
    });
  });

  test("WebM only once neither MP4 codec is available", () => {
    expect(resolve({ vp8: true, vp9: true }, "mp4")).toMatchObject({
      extension: ".webm",
      mediaType: "video/webm",
    });
  });

  test("the whole requested container is tried before the other one", () => {
    // A missing H.264 encoder should cost the codec, not the format.
    const withoutAvc = resolve({ av1: true, vp8: true, vp9: true }, "mp4");
    expect(withoutAvc.mediaType).toBe("video/mp4");
  });
});

describe("choosing an encoder for WebM", () => {
  test("VP9 first, then VP8", () => {
    expect(resolve(everything, "webm")).toMatchObject({ codec: "vp9", extension: ".webm" });
    expect(resolve({ av1: true, avc: true, vp8: true }, "webm")).toMatchObject({
      codec: "vp8",
      extension: ".webm",
    });
  });

  test("falls back to MP4 only when no WebM codec exists", () => {
    expect(resolve({ avc: true }, "webm")).toMatchObject({ mediaType: "video/mp4" });
    // And AV1 serves that fallback too, so a browser with only AV1 can still
    // export something rather than nothing.
    expect(resolve({ av1: true }, "webm")).toMatchObject({
      codec: "av1",
      mediaType: "video/mp4",
    });
  });
});

describe("when nothing can encode", () => {
  test("it says so rather than producing an unplayable file", () => {
    expect(() => resolve({}, "mp4")).toThrow(/encoder/i);
  });
});

describe("the bitrate", () => {
  test("does not depend on which codec was chosen", () => {
    // Otherwise a fallback would silently change the size of the artifact as
    // well as its codec.
    expect(resolve(everything, "mp4").bitrate).toBe(
      resolve({ av1: true, vp8: true, vp9: true }, "mp4").bitrate,
    );
  });
});
