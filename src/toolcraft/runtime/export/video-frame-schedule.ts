/**
 * The rate a schedule uses when it is not told one.
 *
 * Kept so a caller that does not care still gets what this runtime always
 * encoded at. Callers that do care pass the rate the export settings resolved,
 * and the schedule and the encoder must be given the same one: a file whose
 * frames were laid out at one rate and declared at another plays at the wrong
 * speed, which reads as a badly built animation rather than as a bad setting.
 */
export const TOOLCRAFT_VIDEO_EXPORT_FRAMES_PER_SECOND = 30;

export type ToolcraftVideoFrameScheduleEntry = Readonly<{
  durationSeconds: number;
  index: number;
  timeSeconds: number;
}>;

const frameCountTolerance = 1e-9;

export function createToolcraftVideoFrameSchedule(
  durationSeconds: number,
  framesPerSecond: number = TOOLCRAFT_VIDEO_EXPORT_FRAMES_PER_SECOND,
): readonly ToolcraftVideoFrameScheduleEntry[] {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new RangeError("Video export requires a positive finite duration.");
  }

  if (!Number.isFinite(framesPerSecond) || framesPerSecond <= 0) {
    throw new RangeError("Video export requires a positive finite frame rate.");
  }

  const rawFrameCount = durationSeconds * framesPerSecond;
  const nearestFrameCount = Math.round(rawFrameCount);
  const frameCount =
    Math.abs(rawFrameCount - nearestFrameCount) <= frameCountTolerance
      ? nearestFrameCount
      : Math.ceil(rawFrameCount);

  return Object.freeze(
    Array.from({ length: frameCount }, (_, index) => {
      const timeSeconds = index / framesPerSecond;
      const endSeconds = Math.min(durationSeconds, (index + 1) / framesPerSecond);

      return Object.freeze({
        durationSeconds: endSeconds - timeSeconds,
        index,
        timeSeconds,
      });
    }),
  );
}
