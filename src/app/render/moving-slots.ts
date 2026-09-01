import type { ArtworkZoneId } from "../product-domain";
import { readDesignClock, type AnimatedArtwork, type ArtworkFrame } from "./animated-artwork";
import type { ScreenPainter } from "./screen-texture";

/**
 * Every zone whose design moves, advanced once a frame.
 *
 * Kept out of the preview's frame loop because it is the one part of that loop
 * with a rule of its own worth reading: which clock a design follows, and when
 * a frame is worth redrawing. The loop around it only wants to know whether
 * anything changed.
 */
export type MovingSlot = {
  painter: ScreenPainter;
  /**
   * What is currently painted onto the texture.
   *
   * Held so an unchanged frame is not redrawn: a GIF at twenty-five frames a
   * second on a display running at sixty means better than half of all frames
   * are the same picture, and blitting those again is work with nothing to
   * show for it.
   */
  shown: ArtworkFrame | null;
  source: AnimatedArtwork;
  zone: ArtworkZoneId;
};

export type MovingTimeline = {
  currentTimeSeconds: number;
  isPlaying: boolean;
  keyframeGroups: readonly unknown[];
};

/**
 * Put the right frame on every moving design.
 *
 * `painted` says whether anything actually changed, so the caller knows
 * whether the scene needs drawing again. `playing` says whether these designs
 * are running, which is not the same as the timeline running: a design with no
 * keyframes to follow keeps its own time, and a frame rate still has to be
 * held for it.
 *
 * Never waits. `frameAt` hands back the newest frame its source has and goes
 * after the one asked for in the background, so a slow decode costs this frame
 * nothing and lands on a later one.
 */
export function paintMovingSlots(
  slots: readonly MovingSlot[],
  timeline: MovingTimeline,
  elapsedSeconds: number,
): { painted: boolean; playing: boolean } {
  const clock = readDesignClock(timeline, elapsedSeconds);
  let painted = false;
  for (const slot of slots) {
    const frame = slot.source.frameAt(clock.seconds, clock.playing);
    if (!frame) continue;
    // A video hands back the same element every time and changes what is
    // inside it, so identity alone cannot decide this while it is running.
    if (!clock.playing && frame === slot.shown) continue;
    slot.painter.paint(frame);
    slot.shown = frame;
    painted = true;
  }
  return { painted, playing: clock.playing };
}
