import * as React from "react";

import type { ToolcraftCustomControlRendererProps } from "@/toolcraft/runtime/react";

import {
  MOTION_PRESET_OPTIONS,
  getMotionHeroReason,
  readMotionPresetId,
  type MotionPresetId,
} from "./motion-presets";
import {
  getMotionPreviewTracks,
  getMotionPreviewTransform,
  isSceneChannel,
  motionPreviewSeconds,
  type MotionPreviewTrack,
} from "./motion-preview";
import { readDeviceId } from "./product-domain";

/**
 * Nine little animations instead of nine words.
 *
 * A dropdown of names is a list of guesses. "Sway" and "Float" both mean "it
 * moves a bit"; "Hero" means nothing at all until you know which product you
 * are looking at. The only way to find out what one did was to press the
 * button, and pressing the button lays keyframes over whatever was there — so
 * the cost of curiosity was somebody's animation.
 *
 * So the picker draws each move. Every tile is a slab standing on a floor with
 * a highlight across it, animated by the same definition the timeline gets:
 * the fractions and the easing come from `buildMotionPreset`, so a tile cannot
 * advertise a move the product does not make.
 *
 * The one thing a tile shows that a render would not is what is moving. A
 * turntable turns the slab and leaves the floor; an arc turns the floor with
 * it, because the camera is what moved. That difference is the single most
 * useful thing to know about those two, and at this size it is far clearer as
 * a diagram than it would be as a tiny picture of a phone.
 */

const tileSeconds = motionPreviewSeconds;

/** Everything the animation needs, per element, as one keyframe list. */
function useMotionTileAnimation(
  ref: React.RefObject<HTMLElement | null>,
  tracks: readonly MotionPreviewTrack[],
  enabled: boolean,
): void {
  React.useEffect(() => {
    const element = ref.current;

    if (!element || tracks.length === 0 || !enabled) {
      return;
    }

    // Every offset any track keys at, so the composed transform is written
    // whole at each of them. Transforms do not compose across separate
    // animations on one element — the last one wins — so a slab that both
    // rises and leans has to be one animation over one property.
    const offsets = [...new Set(tracks.flatMap((track) => track.steps.map((step) => step.at)))]
      .sort((first, second) => first - second);
    const valueAt = (track: MotionPreviewTrack, at: number): number => {
      const steps = track.steps;
      const exact = steps.find((step) => step.at === at);

      if (exact) {
        return exact.value;
      }

      // A track that does not key here is held between the two it does, which
      // is what the evaluator would do; the easing on the segment is the one
      // the tile already carries from the keyframe it left.
      const before = [...steps].reverse().find((step) => step.at < at) ?? steps[0]!;
      const after = steps.find((step) => step.at > at) ?? steps[steps.length - 1]!;
      const span = after.at - before.at;

      return span <= 0
        ? before.value
        : before.value + (after.value - before.value) * ((at - before.at) / span);
    };
    const keyframes = offsets.map((at) => ({
      // The segment's curve belongs to the keyframe it leaves, which is this
      // app's own rule and happens to be the Web Animations API's too.
      easing:
        tracks
          .map((track) => track.steps.find((step) => step.at === at)?.easing)
          .find(Boolean) ?? "linear",
      offset: at,
      transform:
        tracks
          .map((track) => getMotionPreviewTransform(track.channel, valueAt(track, at)))
          .filter(Boolean)
          .join(" ") || "none",
    }));

    const animation = element.animate(keyframes, {
      duration: tileSeconds * 1000,
      iterations: Number.POSITIVE_INFINITY,
    });

    return () => animation.cancel();
  }, [enabled, ref, tracks]);
}

/** The travelling highlight, which is its own element and its own animation. */
function useMotionTileHighlight(
  ref: React.RefObject<HTMLElement | null>,
  tracks: readonly MotionPreviewTrack[],
  enabled: boolean,
): void {
  const light = tracks.find((track) => track.channel === "light");

  React.useEffect(() => {
    const element = ref.current;

    if (!element || !light || !enabled) {
      return;
    }

    const animation = element.animate(
      light.steps.map((step) => ({
        easing: step.easing,
        offset: step.at,
        transform: `translateX(${step.value}%)`,
      })),
      { duration: tileSeconds * 1000, iterations: Number.POSITIVE_INFINITY },
    );

    return () => animation.cancel();
  }, [enabled, light, ref]);
}

function MotionTile({
  animate,
  label,
  onChoose,
  preset,
  selected,
  tracks,
}: {
  animate: boolean;
  label: string;
  onChoose: (preset: MotionPresetId) => void;
  preset: MotionPresetId;
  selected: boolean;
  tracks: readonly MotionPreviewTrack[];
}): React.JSX.Element {
  const sceneRef = React.useRef<HTMLDivElement | null>(null);
  const slabRef = React.useRef<HTMLDivElement | null>(null);
  const lightRef = React.useRef<HTMLSpanElement | null>(null);
  const sceneTracks = React.useMemo(
    () => tracks.filter((track) => isSceneChannel(track.channel)),
    [tracks],
  );
  const slabTracks = React.useMemo(
    () => tracks.filter((track) => !isSceneChannel(track.channel) && track.channel !== "light"),
    [tracks],
  );

  useMotionTileAnimation(sceneRef, sceneTracks, animate);
  useMotionTileAnimation(slabRef, slabTracks, animate);
  useMotionTileHighlight(lightRef, tracks, animate);

  return (
    <button
      aria-pressed={selected}
      className={`group/motion-tile flex flex-col items-stretch gap-1 rounded-md border p-1.5 text-left transition-colors duration-150 ease-out ${
        selected
          ? "border-[color:var(--link)] bg-[color:color-mix(in_oklab,var(--link)_10%,transparent)]"
          : "border-[color:color-mix(in_oklab,var(--border)_60%,transparent)] hover:bg-[color:color-mix(in_oklab,var(--foreground)_4%,transparent)]"
      }`}
      data-motion-preset={preset}
      data-selected={selected ? "true" : undefined}
      data-slot="motion-preset-tile"
      onClick={() => onChoose(preset)}
      type="button"
    >
      <span
        className="relative block h-11 w-full overflow-hidden rounded-sm bg-[color:color-mix(in_oklab,var(--foreground)_5%,transparent)]"
        style={{ perspective: "120px" }}
      >
        <div
          className="absolute inset-0 flex items-end justify-center pb-2"
          data-slot="motion-preset-scene"
          ref={sceneRef}
          style={{ transformStyle: "preserve-3d" }}
        >
          {/* The floor, which belongs to the scene: an arc takes it with it. */}
          <span className="absolute right-2 bottom-1.5 left-2 h-px bg-[color:color-mix(in_oklab,var(--foreground)_22%,transparent)]" />
          <div
            className="relative h-6 w-4 overflow-hidden rounded-[2px] bg-[color:color-mix(in_oklab,var(--foreground)_55%,transparent)]"
            data-slot="motion-preset-slab"
            ref={slabRef}
            style={{ transformOrigin: "center top" }}
          >
            <span
              className="absolute inset-y-0 -left-full w-full bg-[color:color-mix(in_oklab,var(--background)_70%,transparent)]"
              data-slot="motion-preset-light"
              ref={lightRef}
            />
          </div>
        </div>
      </span>
      <span className="truncate text-[10px] leading-3 text-[color:color-mix(in_oklab,var(--foreground)_75%,transparent)]">
        {label}
      </span>
    </button>
  );
}

/**
 * The picker, as a grid of moving tiles.
 *
 * Rendered by the product rather than by the runtime because the runtime has
 * no reason to know what a turntable looks like. `motion.preset` declares a
 * type the runtime does not render, which is what routes it here.
 */
export function MotionPicker({
  setValue,
  state,
  value,
}: ToolcraftCustomControlRendererProps): React.JSX.Element {
  const device = readDeviceId((state.values as Record<string, unknown>)["device.model"]);
  const chosen = readMotionPresetId(value);
  // Paused while the browser says nobody wants motion. Nine looping tiles is
  // exactly the kind of thing that setting is for.
  const [animate, setAnimate] = React.useState(true);

  React.useEffect(() => {
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");

    if (!query) {
      return;
    }

    const update = () => setAnimate(!query.matches);
    update();
    query.addEventListener("change", update);

    return () => query.removeEventListener("change", update);
  }, []);

  const tiles = React.useMemo(
    () =>
      MOTION_PRESET_OPTIONS.map((option) => ({
        ...option,
        tracks: getMotionPreviewTracks(option.value, device),
      })),
    [device],
  );

  return (
    <div className="flex flex-col gap-2" data-slot="motion-preset-picker">
      <div className="grid grid-cols-3 gap-1.5">
        {tiles.map((tile) => (
          <MotionTile
            animate={animate}
            key={tile.value}
            label={tile.label}
            onChoose={setValue}
            preset={tile.value}
            selected={tile.value === chosen}
            tracks={tile.tracks}
          />
        ))}
      </div>
      <p
        className="text-[11px] leading-4 text-[color:color-mix(in_oklab,var(--foreground)_62%,transparent)]"
        data-slot="motion-preset-reason"
      >
        {chosen === "hero"
          ? getMotionHeroReason(device)
          : chosen === "none"
            ? "Takes the preset's tracks off the timeline and leaves every other track alone."
            : "Press Add to timeline to lay this down as ordinary keyframes, around wherever the product is standing now."}
      </p>
    </div>
  );
}
