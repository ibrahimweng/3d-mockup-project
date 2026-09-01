/**
 * A design that moves: a GIF or a video, played on the timeline's clock.
 *
 * Two formats with almost nothing in common underneath, behind one small
 * interface, because everything above here only ever wants the same thing --
 * the frame for this moment, now, synchronously, so it can be drawn into the
 * canvas the still path already owns.
 *
 * Synchronously is the whole difficulty. Decoding is asynchronous in both
 * backends and a render loop cannot wait, so neither backend is asked to
 * produce a frame on demand: each keeps the most recent one it has, hands that
 * back immediately, and asks for the one actually wanted in the background.
 * A design is therefore never blank while it catches up and never blocks the
 * frame it is late for -- it is briefly one frame behind, which at twenty-five
 * frames a second is forty milliseconds nobody can see.
 *
 * The clock is the timeline's, not the clip's. Scrubbing scrubs the design,
 * pausing holds it on a frame, and an exported video is the same animation
 * every time it is rendered rather than whatever the decoder happened to have
 * reached. That is why the GIF path matters more than it looks: seeking a
 * video is expensive and seeking a GIF is not, and it is the format most of
 * these designs arrive in.
 */

/**
 * WebCodecs, declared here because the DOM lib this project builds against
 * does not carry it yet.
 *
 * Only the members actually used, so this cannot drift into claiming support
 * for something untested.
 */
type DecodedFrame = {
  close: () => void;
  displayHeight: number;
  displayWidth: number;
  /** Microseconds this frame stays on screen. */
  duration: number | null;
  /** Microseconds from the start of the clip. */
  timestamp: number;
};
type ImageDecoderTrack = { animated: boolean; frameCount: number };
type ImageDecoderLike = {
  close: () => void;
  completed: Promise<void>;
  decode: (options: { frameIndex: number }) => Promise<{ image: DecodedFrame }>;
  tracks: { ready: Promise<void>; selectedTrack: ImageDecoderTrack | null };
};
type ImageDecoderConstructor = new (options: {
  data: ArrayBuffer;
  type: string;
}) => ImageDecoderLike;

/** A frame the 2D context will accept, which is all any caller needs of one. */
export type ArtworkFrame = CanvasImageSource & {
  displayHeight?: number;
  displayWidth?: number;
};

export type AnimatedArtwork = {
  /** One turn of the loop, in seconds. */
  durationSeconds: number;
  /** Release the decoder and every frame it is holding. */
  dispose: () => void;
  /**
   * The frame for this point in the loop, or null until the first arrives.
   *
   * `playing` is not decoration: a GIF ignores it because seeking one is as
   * cheap as reading it in order, and a video needs it because seeking one is
   * not. Told it is playing, the video plays and is nudged only when it drifts;
   * told it is not, it is seeked to the exact time and held there.
   */
  frameAt: (seconds: number, playing: boolean) => ArtworkFrame | null;
  height: number;
  /**
   * Resolve once the frame last asked for is the frame actually held.
   *
   * The preview never waits for a frame and must not. An export is the other
   * way round: it is writing a file, one frame of it at a time, and a frame
   * that arrives late arrives in the wrong place. So export asks, settles, and
   * asks again, which is the only way the same project exports the same
   * animation twice running.
   */
  settle: () => Promise<void>;
  width: number;
};

/** Which uploads move, decided by what the uploader recorded about them. */
export function isAnimatedMimeType(mimeType: string | undefined): boolean {
  if (!mimeType) return false;
  return mimeType === "image/gif" || mimeType.startsWith("video/");
}

/** Whether this browser can take an animated GIF apart at all. */
export function canDecodeGif(): boolean {
  return typeof (globalThis as { ImageDecoder?: unknown }).ImageDecoder === "function";
}

/** A GIF frame with no stated delay, which browsers treat as the usual tenth. */
const DEFAULT_FRAME_US = 100_000;

/**
 * Open a GIF, and learn when each of its frames belongs.
 *
 * The timing table is built once, on open, by decoding every frame and keeping
 * only its timestamp. That costs about four milliseconds a frame -- half a
 * second for a hundred and twenty of them, which is a wait at upload and not
 * during playback -- and it is what makes an arbitrary time answerable without
 * walking the file. The alternative, assuming a constant delay, is wrong for
 * any GIF that pauses on a frame, and plenty do.
 *
 * The frames themselves are not kept. Decoded to RGBA a twenty megabyte GIF is
 * closer to three hundred, so exactly one frame is held at a time: the one
 * being shown.
 */
async function openGif(
  url: string,
  onFrame: () => void,
): Promise<AnimatedArtwork | null> {
  const Decoder = (globalThis as { ImageDecoder?: ImageDecoderConstructor })
    .ImageDecoder;
  if (!Decoder) return null;

  const response = await fetch(url);
  const decoder = new Decoder({ data: await response.arrayBuffer(), type: "image/gif" });
  await decoder.tracks.ready;
  // `frameCount` is only final once the whole file has been parsed.
  await decoder.completed;
  const track = decoder.tracks.selectedTrack;
  if (!track || track.frameCount < 1) {
    decoder.close();
    return null;
  }

  const starts: number[] = [];
  let width = 1;
  let height = 1;
  let endUs = 0;
  for (let index = 0; index < track.frameCount; index += 1) {
    const { image } = await decoder.decode({ frameIndex: index });
    starts.push(image.timestamp);
    endUs = image.timestamp + (image.duration ?? DEFAULT_FRAME_US);
    if (index === 0) {
      width = image.displayWidth;
      height = image.displayHeight;
    }
    image.close();
  }
  // A single-frame GIF is a still, and running it through the animated path
  // would decode the same frame forever for nothing.
  if (starts.length < 2 || endUs <= 0) {
    decoder.close();
    return null;
  }

  let held: DecodedFrame | null = null;
  let heldIndex = -1;
  let wantedIndex = -1;
  let decoding = false;
  let closed = false;
  let waiters: (() => void)[] = [];

  const settled = (): void => {
    const waiting = waiters;
    waiters = [];
    for (const resolve of waiting) resolve();
  };

  /** The last frame whose start is at or before this moment. */
  const indexAt = (microseconds: number): number => {
    let low = 0;
    let high = starts.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (starts[mid] <= microseconds) low = mid;
      else high = mid - 1;
    }
    return low;
  };

  /**
   * Fetch whatever is wanted, one decode at a time.
   *
   * Serialised on purpose. Scrubbing asks for a different frame on every
   * pointer move, and letting those race would queue dozens of decodes to
   * throw away all but the last; this keeps at most one in flight and, when it
   * lands on a frame nobody wants any more, immediately goes after the one
   * they do.
   */
  const pump = (): void => {
    if (closed || decoding || wantedIndex === heldIndex) return;
    decoding = true;
    const index = wantedIndex;
    decoder
      .decode({ frameIndex: index })
      .then(({ image }) => {
        if (closed) {
          image.close();
          return;
        }
        held?.close();
        held = image;
        heldIndex = index;
        onFrame();
      })
      // A frame that will not decode leaves the previous one showing, which is
      // a great deal better than a hole in the design.
      .catch(() => undefined)
      .finally(() => {
        decoding = false;
        if (closed || wantedIndex === heldIndex) settled();
        else pump();
      });
  };

  const durationSeconds = endUs / 1e6;
  return {
    durationSeconds,
    dispose: () => {
      closed = true;
      settled();
      held?.close();
      held = null;
      decoder.close();
    },
    frameAt: (seconds) => {
      wantedIndex = indexAt(wrap(seconds, durationSeconds) * 1e6);
      pump();
      return held as ArtworkFrame | null;
    },
    height,
    settle: () =>
      closed || wantedIndex === heldIndex
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            waiters.push(resolve);
          }),
    width,
  };
}

/** How far a playing video may drift before it is worth interrupting it. */
const DRIFT_SECONDS = 0.25;
/** How close a seek has to land for a held frame to count as the right one. */
const SEEK_SECONDS = 0.02;

/**
 * Open a video, which is its own frame source and needs no decoding here.
 *
 * A `<video>` element is something the 2D context will draw directly, so the
 * work is not getting frames out of it but keeping it on the timeline's clock.
 * Playing, it is left to play and only nudged when it drifts, because seeking
 * per frame would make a fifteen second clip unwatchable. Paused or scrubbed,
 * it is seeked, because then the exact frame is the whole point.
 */
async function openVideo(
  url: string,
  onFrame: () => void,
): Promise<AnimatedArtwork | null> {
  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  // Muted and inline are what make autoplay permissible at all; a design on a
  // shirt has no business making noise either way.
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.loop = true;
  video.preload = "auto";
  video.src = url;

  const ready = await new Promise<boolean>((resolve) => {
    const done = (ok: boolean) => () => resolve(ok);
    video.addEventListener("loadeddata", done(true), { once: true });
    video.addEventListener("error", done(false), { once: true });
  });
  if (!ready || !Number.isFinite(video.duration) || video.duration <= 0) {
    video.removeAttribute("src");
    return null;
  }
  video.addEventListener("seeked", onFrame);

  const durationSeconds = video.duration;
  return {
    durationSeconds,
    dispose: () => {
      video.removeEventListener("seeked", onFrame);
      video.pause();
      video.removeAttribute("src");
      video.load();
    },
    frameAt: (seconds, playing) => {
      const at = wrap(seconds, durationSeconds);
      if (playing) {
        if (video.paused) void video.play().catch(() => undefined);
        if (Math.abs(video.currentTime - at) > DRIFT_SECONDS) video.currentTime = at;
      } else {
        if (!video.paused) video.pause();
        if (Math.abs(video.currentTime - at) > SEEK_SECONDS) video.currentTime = at;
      }
      return video;
    },
    height: video.videoHeight || 1,
    settle: () =>
      video.seeking
        ? new Promise<void>((resolve) => {
            video.addEventListener("seeked", () => resolve(), { once: true });
          })
        : Promise.resolve(),
    width: video.videoWidth || 1,
  };
}

/** Where a moment falls inside one turn of the loop. */
export function wrap(seconds: number, durationSeconds: number): number {
  if (!Number.isFinite(seconds) || durationSeconds <= 0) return 0;
  return ((seconds % durationSeconds) + durationSeconds) % durationSeconds;
}

/** The clock a moving design runs on, and whether it is running. */
export type DesignClock = { playing: boolean; seconds: number };

/**
 * Which clock a moving design should follow.
 *
 * The timeline, whenever there is a timeline to follow. That is what makes
 * scrubbing scrub the design, pausing hold it on a frame, and an export come
 * out the same twice running.
 *
 * But the runtime stops its own clock when nothing is keyframed -- there is
 * nothing to play, so it does not play -- and a GIF dropped onto a still scene
 * is not nothing to play. Left on the timeline it would sit on its first frame
 * for ever, with a Play button that does nothing about it, which is not what
 * anybody means by dropping a GIF on a shirt. So with no keyframes the design
 * keeps its own time and simply loops.
 *
 * Export is unaffected either way. It never reads this: it walks the loop
 * itself and asks for the frame at each moment, so a keyframeless scene still
 * exports its animation, and exports the same one every time.
 */
export function readDesignClock(
  timeline: {
    currentTimeSeconds: number;
    isPlaying: boolean;
    keyframeGroups: readonly unknown[];
  },
  elapsedSeconds: number,
): DesignClock {
  if (timeline.keyframeGroups.length > 0) {
    return { playing: timeline.isPlaying, seconds: timeline.currentTimeSeconds };
  }
  return { playing: true, seconds: Math.max(0, elapsedSeconds) };
}

/**
 * Open whichever kind this is, or nothing if it will not animate.
 *
 * Returning null rather than throwing is deliberate and is the fallback: a
 * caller that gets nothing back falls through to the still path, so a GIF in a
 * browser with no image decoder shows its first frame rather than an error,
 * and a video that will not load leaves the panel on its template.
 */
export async function openAnimatedArtwork(
  url: string,
  mimeType: string,
  onFrame: () => void,
): Promise<AnimatedArtwork | null> {
  try {
    if (mimeType === "image/gif") return await openGif(url, onFrame);
    if (mimeType.startsWith("video/")) return await openVideo(url, onFrame);
  } catch {
    return null;
  }
  return null;
}
