import { DEFAULT_MOTION_PRESET, MOTION_PRESET_OPTIONS } from "./motion-presets";
import { onTab } from "./panel-tabs";

/**
 * The moves, offered where the product is chosen.
 *
 * On the Product tab and not the Scene tab, though two of these animate the
 * camera and one animates the key light. The reason is that the move is chosen
 * *for the product*: which one suits a thing is a fact about the thing, the
 * Hero is different for all ten of them, and somebody who has just picked a
 * tote bag is exactly who wants to know what a tote bag should do. The camera
 * and the light are what a shot is made with; the product is what it is of.
 *
 * Two controls rather than one, because applying is a press rather than a
 * choice. Every other preset in this app takes effect the moment it is picked,
 * which is safe when picking writes values that the next pick overwrites. This
 * one writes keyframes and clears the tracks it owns, so browsing the list to
 * see what "Sway" does would quietly destroy an animation somebody had built.
 * The press costs one click and removes that whole class of accident. It also
 * keeps the picker honest: it says what would be laid down rather than what is
 * on the timeline, so it stays true after a keyframe is dragged.
 */
export const MOTION_SECTION = {
  controls: {
    preset: {
      applicability: { mode: "always" },
      defaultValue: DEFAULT_MOTION_PRESET,
      description:
        "A move to start from, laid down as ordinary keyframes you can then edit. Hero is the one chosen for this particular product; the rest are the techniques product animation is made of. Every one loops seamlessly, fits whatever length the timeline is set to, and is built around where the product is standing right now rather than snapping it somewhere new.",
      label: "Preset",
      options: MOTION_PRESET_OPTIONS,
      performanceReason:
        "Choosing a move writes one value and changes nothing about the picture; the keyframes are laid down by the button beside it.",
      performanceRole: "responsiveness",
      semanticGroup: "choice",
      target: "motion.preset",
      type: "select",
    },
    apply: {
      actions: [
        { icon: "wand-sparkles", label: "Add to timeline", value: "apply-motion" },
      ],
      applicability: { mode: "always" },
      description:
        "Lays the chosen move down as keyframes, replacing whatever was on the tracks it uses and leaving every other track alone — so a light sweep can be added on top of a turntable. One press is one thing to undo. Choosing None takes the preset's tracks off again.",
      label: false,
      performanceReason:
        "Writes keyframes in a single command and starts playback; nothing is rebuilt and no frame is rendered that would not have been.",
      performanceRole: "responsiveness",
      semanticGroup: "choice",
      target: "motion.apply",
      type: "actions",
    },
  },
  id: "motion",
  title: "Motion",
  visibleWhen: onTab("product"),
} as const;
