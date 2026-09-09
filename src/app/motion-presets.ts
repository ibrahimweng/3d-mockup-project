import type { DeviceId } from "./product-domain";
import {
  buildMotionTechnique,
  type MotionSubject,
  type MotionTechniqueId,
  type MotionTrack,
  type MotionTuning,
} from "./motion-techniques";

/**
 * What each of the ten products should do, and how far.
 *
 * The techniques next door are general — a float is a float. What is not
 * general is how much of one a thing wants. An iMac is furniture and should
 * barely move; a card on a lanyard is a gram of plastic on a cord and swings
 * a long way. Handing every product the same amplitude would make half of them
 * look wrong in the specific way that reads as "computer generated": correct
 * motion applied to the wrong mass.
 *
 * And each product has a Hero — the one move somebody filming it would
 * actually choose. That is a different question from "which moves are
 * available", and it is the question a person opening an empty timeline is
 * really asking. Every Hero is written down with the reason it is that and not
 * something else, because the reason is the part worth teaching.
 */

export const MOTION_PRESET_OPTIONS = [
  { label: "None", value: "none" },
  { label: "Hero", value: "hero" },
  { label: "Turntable", value: "turntable" },
  { label: "Float", value: "float" },
  { label: "Sway", value: "sway" },
  { label: "Flip to back", value: "flip" },
  { label: "Camera arc", value: "arc" },
  { label: "Breathe", value: "breathe" },
  { label: "Light sweep", value: "light-sweep" },
] as const;

export type MotionPresetId = (typeof MOTION_PRESET_OPTIONS)[number]["value"];

export const DEFAULT_MOTION_PRESET: MotionPresetId = "none";

type ProductMotion = {
  hero: {
    /** Why these moves and not others, for this object specifically. */
    reason: string;
    techniques: readonly MotionTechniqueId[];
    /** Where the Hero wants different numbers from the plain technique. */
    tuning?: Partial<MotionTuning>;
  };
  tuning: MotionTuning;
};

/**
 * The middle of the road, and what every product is a deviation from.
 *
 * Sized for something hand-held sitting on a surface: a few percent of rise, a
 * turn of a few degrees, a camera that moves enough to see parallax and not
 * enough to lose the framing.
 */
const baseTuning: MotionTuning = {
  arcDegrees: 24,
  breatheZoom: 12,
  flipHold: 0.14,
  floatRise: 4,
  lightSweep: 0.5,
  swayDegrees: 7,
};

const PRODUCT_MOTION: Record<DeviceId, ProductMotion> = {
  "iphone-17-pro-max": {
    hero: {
      reason:
        "A phone has two faces worth showing and a designer only ever chose one of them: the screen carries the design, and the back carries the cameras that say which phone it is. The hero holds each long enough to read and breathes in slightly while it turns, which is the difference between showing someone a phone and rotating an object.",
      techniques: ["flip", "breathe"],
      // A shorter hold than the merchandise flips: a phone's back reads at a
      // glance, where a printed panel takes a moment.
      tuning: { breatheZoom: 14, flipHold: 0.12 },
    },
    tuning: { ...baseTuning, arcDegrees: 26, breatheZoom: 14, floatRise: 5 },
  },
  macbook: {
    hero: {
      reason:
        "A laptop is a thing you sit in front of, and turning one to show its back is a shot nobody has ever wanted. So the machine holds still and the camera moves instead, past the open screen and back, with just enough drift that the frame is not dead. The parallax between the screen and the keyboard is the whole point, and only a camera move produces it.",
      techniques: ["arc", "float"],
      tuning: { arcDegrees: 30 },
    },
    tuning: { ...baseTuning, arcDegrees: 30, floatRise: 3, swayDegrees: 4 },
  },
  imac: {
    hero: {
      reason:
        "An iMac is furniture. It weighs eight kilos and stands on a foot, and anything that lifts it off the floor or spins it on the spot reads as weightless in a way that makes the whole render look fake. So it does not move at all: the shot comes to it and settles, with a rise so small it is closer to a breath than a float.",
      techniques: ["breathe", "float"],
      // A sixth of the usual rise. Enough that the frame is not frozen, small
      // enough that nothing looks lifted.
      tuning: { breatheZoom: 16, floatRise: 1.5 },
    },
    tuning: { ...baseTuning, arcDegrees: 18, breatheZoom: 16, floatRise: 2, swayDegrees: 3 },
  },
  "mac-studio": {
    hero: {
      reason:
        "A milled aluminium box is about two things: the surface, and the row of ports around the back. A turn gets you the ports and the light gets you the surface, so it does both at once — the key rakes across while the box comes round, and the machined edge catches once per revolution. On a matte plastic object this would be wasted; on this one it is the shot.",
      techniques: ["turntable", "light-sweep"],
      tuning: { lightSweep: 0.6 },
    },
    tuning: { ...baseTuning, arcDegrees: 24, floatRise: 3, lightSweep: 0.6, swayDegrees: 4 },
  },
  "apple-watch-ultra": {
    hero: {
      reason:
        "It is small, and everything interesting about it is small too — the crown, the band's texture, the bezel markings. A shot that stays wide shows a watch-shaped blob. So the camera closes in while the watch turns slowly underneath it, and the two together are what make something this size read at all.",
      techniques: ["turntable", "breathe"],
      tuning: { breatheZoom: 24 },
    },
    tuning: { ...baseTuning, arcDegrees: 22, breatheZoom: 20, floatRise: 4, swayDegrees: 6 },
  },
  tshirt: {
    hero: {
      reason:
        "Both panels are printed and both are the product, so a shot that only shows the front is half a shot. It turns between them and keeps swaying while it does, because cloth on a body never stops moving and a shirt that turns like a solid is the thing that gives a garment mockup away.",
      techniques: ["flip", "sway"],
      // A longer hold than a phone's: a print takes longer to read than a
      // camera bump, and the sway keeps the held moments alive.
      tuning: { flipHold: 0.18, swayDegrees: 4 },
    },
    tuning: { ...baseTuning, arcDegrees: 24, flipHold: 0.18, floatRise: 4, swayDegrees: 5 },
  },
  "tote-bag": {
    hero: {
      reason:
        "A tote hangs from its handles, which means it swings — it is the one product here whose resting state is motion. And it is printed on both faces, so it turns too. The swing runs underneath the turn rather than after it, which is what a bag being carried actually does.",
      techniques: ["sway", "flip"],
      tuning: { flipHold: 0.16, swayDegrees: 9 },
    },
    tuning: { ...baseTuning, arcDegrees: 22, flipHold: 0.16, floatRise: 5, swayDegrees: 9 },
  },
  "water-bottle": {
    hero: {
      reason:
        "A wrap has no front. The design runs the whole way round, so the only honest way to show it is to turn the whole way round — a flip would hold on two arbitrary points of a continuous print. The highlight travels the other way while it turns, which is what keeps a steel cylinder from reading as a flat grey shape.",
      techniques: ["turntable", "light-sweep"],
      tuning: { lightSweep: 0.55 },
    },
    tuning: { ...baseTuning, arcDegrees: 20, floatRise: 4, lightSweep: 0.55, swayDegrees: 5 },
  },
  "id-card": {
    hero: {
      reason:
        "A card on a lanyard is a few grams on a cord and swings further than anything else here — that is why its sway is twice a bag's. It is printed both sides, so it turns as well; and the turn is what a badge does when someone lifts it to be read.",
      techniques: ["sway", "flip"],
      tuning: { flipHold: 0.16, swayDegrees: 14 },
    },
    tuning: { ...baseTuning, arcDegrees: 24, breatheZoom: 14, flipHold: 0.16, swayDegrees: 14 },
  },
  "tablet-folder": {
    hero: {
      reason:
        "A clipboard is read straight on, like the page it holds. Turning it edge-on hides the only thing on it, so the camera moves instead and the board lifts a little as it goes — enough that it reads as held rather than laid on the floor.",
      techniques: ["arc", "float"],
      tuning: { arcDegrees: 28 },
    },
    tuning: { ...baseTuning, arcDegrees: 28, floatRise: 4, swayDegrees: 6 },
  },
};

export function readMotionPresetId(value: unknown): MotionPresetId {
  return MOTION_PRESET_OPTIONS.some((option) => option.value === value)
    ? (value as MotionPresetId)
    : DEFAULT_MOTION_PRESET;
}

/** Why this product's Hero is the move it is. Shown where the preset is chosen. */
export function getMotionHeroReason(device: DeviceId): string {
  return PRODUCT_MOTION[device].hero.reason;
}

/** Which moves a Hero is made of, so the panel can name them. */
export function getMotionHeroTechniques(device: DeviceId): readonly MotionTechniqueId[] {
  return PRODUCT_MOTION[device].hero.techniques;
}

/**
 * The keyframes a preset lays down for this product, in this state.
 *
 * `none` returns nothing, which is what tells the caller there is nothing to
 * write — clearing whatever the last preset put down is the caller's job,
 * because only it knows what that was.
 */
export function buildMotionPreset(
  preset: MotionPresetId,
  device: DeviceId,
  subject: MotionSubject,
): MotionTrack[] {
  if (preset === "none") {
    return [];
  }

  const product = PRODUCT_MOTION[device];

  if (preset === "hero") {
    const tuning = { ...product.tuning, ...product.hero.tuning };

    return product.hero.techniques.flatMap((technique) =>
      buildMotionTechnique(technique, subject, tuning),
    );
  }

  return buildMotionTechnique(preset, subject, product.tuning);
}

export { PRODUCT_MOTION };
