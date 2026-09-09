/**
 * Motion blur, as a camera makes it.
 *
 * Every exported frame is a single instant, drawn perfectly sharp. A real
 * camera's shutter is open for a slice of each frame and records everything
 * that happens while it is, which is why a filmed object that moves quickly is
 * smeared rather than crisp. A turntable exported sharp reads as a stack of
 * still renders played quickly — the stutter people call "CGI-looking" — and
 * the fix is not more frames but each frame covering the time it stands for.
 *
 * So a frame is drawn several times across the shutter's opening and the
 * results are averaged. This module is the arithmetic of that: which instants
 * to draw, and whether it is worth drawing more than one.
 */

/**
 * What a frame is worth, in seconds, at the rate being encoded.
 *
 * This used to be the constant `1 / 30`, with a note saying that if the
 * runtime's schedule ever changed this was the line that would have to. The
 * schedule now takes a rate, so it did — and the note was the whole hazard:
 * two numbers that had to agree, in different files, with nothing to make them.
 * A shutter is a fraction of a frame, so at sixty frames a second a 180 degree
 * shutter is a hundred-and-twentieth of a second rather than a sixtieth. Left
 * at thirty it would have smeared every sixty-frame export across twice the
 * time it stands for, which reads as a soft render rather than as a bug.
 */
export function getMotionBlurFrameSeconds(framesPerSecond: number): number {
  return Number.isFinite(framesPerSecond) && framesPerSecond > 0
    ? 1 / framesPerSecond
    : 1 / defaultMotionBlurFramesPerSecond;
}

/** The rate the runtime encoded at before the rate was a choice. */
export const defaultMotionBlurFramesPerSecond = 30;

/**
 * How many times a blurred frame is drawn.
 *
 * Every sample is a full render, so this multiplies the cost of an export
 * directly: eight samples is eight times the work. Eight is where a fast turn
 * stops showing the individual copies as distinct ghosts, and going further
 * buys smoothness nobody watching a six second loop would notice.
 */
export const motionBlurSampleCount = 8;

/** The film convention, and what a shutter angle of 180 degrees means. */
export const defaultMotionBlurShutterAngleDegrees = 180;

/**
 * How long the shutter is open, in seconds.
 *
 * Expressed as an angle because that is how it is expressed on a camera and in
 * every tool that offers it: 360 degrees is a shutter open for the whole frame,
 * 180 for half of it, and the film convention is 180.
 */
export function getMotionBlurShutterSeconds(
  shutterAngleDegrees: number,
  framesPerSecond: number = defaultMotionBlurFramesPerSecond,
): number {
  if (!Number.isFinite(shutterAngleDegrees) || shutterAngleDegrees <= 0) {
    return 0;
  }

  return (
    (Math.min(shutterAngleDegrees, 360) / 360) *
    getMotionBlurFrameSeconds(framesPerSecond)
  );
}

/**
 * The instants a blurred frame is drawn at.
 *
 * Centred on the frame's own time and spread across the shutter, each sample
 * taken at the middle of the slice it stands for rather than at its edge — so
 * the samples are symmetric about the frame's time and a blurred frame's
 * average lands where the sharp one would have.
 *
 * Times run past the ends of the loop and wrap, because the loop is seamless
 * and forward-only: the instant before the first frame is the one before the
 * last, and a frame at the seam that blurred against a clamped edge would show
 * a smear that stops dead where the rest of the loop keeps moving.
 */
export function getMotionBlurSampleTimes({
  durationSeconds,
  framesPerSecond = defaultMotionBlurFramesPerSecond,
  sampleCount = motionBlurSampleCount,
  shutterAngleDegrees,
  timeSeconds,
}: {
  durationSeconds: number;
  framesPerSecond?: number;
  sampleCount?: number;
  shutterAngleDegrees: number;
  timeSeconds: number;
}): readonly number[] {
  const shutterSeconds = getMotionBlurShutterSeconds(shutterAngleDegrees, framesPerSecond);

  if (shutterSeconds <= 0 || sampleCount < 2 || !(durationSeconds > 0)) {
    return [timeSeconds];
  }

  return Array.from({ length: sampleCount }, (_unused, index) => {
    const offset = shutterSeconds * ((index + 0.5) / sampleCount - 0.5);

    return wrapMotionBlurTime(timeSeconds + offset, durationSeconds);
  });
}

/** A time carried round the loop rather than stopped at its ends. */
export function wrapMotionBlurTime(timeSeconds: number, durationSeconds: number): number {
  if (!(durationSeconds > 0)) {
    return timeSeconds;
  }

  return ((timeSeconds % durationSeconds) + durationSeconds) % durationSeconds;
}

/**
 * Whether anything actually moves across the shutter.
 *
 * Nothing does on a still export, on a track that is holding, or between two
 * keyframes of the same value — and drawing eight identical copies of a frame
 * to average them back into itself is eight times the work for the same pixels.
 * Comparing the values the timeline evaluated at the two ends of the shutter is
 * the cheapest honest test: they are the only things that can differ between
 * one sample and the next, because everything else about the scene is the same
 * within one frame.
 */
export function hasMotionAcrossShutter(
  sampleValues: readonly Record<string, unknown>[],
  keyedTargets: readonly string[],
): boolean {
  const first = sampleValues[0];
  const last = sampleValues[sampleValues.length - 1];

  if (!first || !last || sampleValues.length < 2 || keyedTargets.length === 0) {
    return false;
  }

  return keyedTargets.some((target) => !Object.is(first[target], last[target]));
}

/**
 * The opacity the nth sample is drawn at, so that all of them end up equal.
 *
 * Not one over the count. Canvas compositing is source-over, so drawing every
 * sample at a constant one-eighth leaves the last one weighing an eighth of the
 * frame and the first about a hundred-and-ninety-second of it — a blur that
 * trails towards the end of its own shutter instead of covering it evenly.
 * Weighting the nth sample one nth keeps a running average: after each draw the
 * canvas holds the mean of every sample so far, and after the last it holds the
 * mean of all of them.
 */
export function getMotionBlurSampleAlpha(sampleIndex: number): number {
  return 1 / (sampleIndex + 1);
}

/**
 * What the two export controls are asking for, validated rather than trusted.
 *
 * A workspace can arrive from a saved file or a settings import, so a shutter
 * angle can be a string, a negative, or absent entirely. Anything that is not
 * a usable angle falls back to the film convention rather than to zero: zero
 * would silently turn the feature off while its switch still read on.
 */
export function readMotionBlurSettings(values: Record<string, unknown>): {
  enabled: boolean;
  framesPerSecond: number;
  shutterAngleDegrees: number;
} {
  const storedRate = values["export.video.frameRate"];
  const rate = typeof storedRate === "string" ? Number(storedRate) : storedRate;
  const stored = values["export.video.shutterAngle"];
  // The control is a select, so this arrives as the option's string. Numbers
  // are taken too, because a workspace written before it was one would carry
  // one and there is nothing to gain by refusing a value that is already right.
  const angle = typeof stored === "string" ? Number(stored) : stored;

  return {
    enabled: values["export.video.motionBlur"] === true,
    // Read from the same control the runtime resolves the rate from, so the
    // shutter cannot disagree with the schedule about how long a frame is.
    framesPerSecond:
      rate === 30 || rate === 60 ? rate : defaultMotionBlurFramesPerSecond,
    shutterAngleDegrees:
      typeof angle === "number" && Number.isFinite(angle) && angle >= 0
        ? Math.min(angle, 360)
        : defaultMotionBlurShutterAngleDegrees,
  };
}
