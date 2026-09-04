import type { GuideStep } from "../guide/guide-content";

/**
 * The four things that get someone from an empty studio to a picture they made.
 *
 * Ordered as the job is: choose the thing, put a design on it, look at it from
 * the angle you want. Each one is a control the panel already has rather than a
 * screen of its own, because the point of a tour is to leave someone able to do
 * it again, and a carousel of screenshots leaves nobody able to do anything.
 *
 * The last step is the only one that is not a control. It is the ask, and it
 * comes last on purpose: someone who has just made a product shot knows what
 * this is worth, and someone who has read three cards does not.
 */

export type TourStep = GuideStep & {
  /**
   * The schema target whose value changing means the step is done, or nothing
   * for the closing step, which is a form rather than a task.
   *
   * A change rather than a particular value: the studio has nine products and
   * four print panels, and the step is "pick one", not "pick the one this tour
   * had in mind". It also means nothing here has to know how a file drop or an
   * orientation stores itself, which is the kind of knowledge that goes stale
   * quietly.
   */
  readonly target?: string;
  /** What the spotlight sits over. `canvas` is the preview, not a panel row. */
  readonly spotlight: "canvas" | "control" | "none";
  /**
   * What to watch instead of the target's value, where the target has none.
   *
   * A file drop does not store anything under its schema target: measured, an
   * upload leaves `values` untouched — `artwork.image` is not a key in it at
   * all, before or after — and appears in `state.mediaAssets` some four to nine
   * seconds later, once the image has been decoded. So the step that asks for a
   * design watches the media count instead, and the tour waited forever without
   * this.
   */
  readonly watch?: "media";
  /**
   * Other targets that also count as having done the step.
   *
   * The canvas step is the one that needs this. It teaches that the picture
   * answers the pointer, and this canvas has three gestures on it: dragging the
   * body turns the product, dragging its printed face moves the design, and the
   * middle button moves the board. Measured on a tote, a drag through the
   * middle of the picture lands on the print rather than the body and does not
   * turn anything — and the middle is exactly where someone told to "drag the
   * product" will grab it. Refusing to advance because they discovered the
   * other gesture would strand a person who has learned precisely what the step
   * is for.
   */
  readonly alsoWatch?: readonly string[];
};

export const tourSteps: readonly TourStep[] = [
  {
    action: "Pick your product",
    detail: "Nine to choose from, and the studio reloads the scene around it.",
    spotlight: "control",
    target: "device.model",
  },
  {
    action: "Drop your design on it",
    detail: "Drag an image into the box, or click it to browse.",
    spotlight: "control",
    target: "artwork.image",
    watch: "media",
  },
  {
    action: "Drag the product to turn it",
    detail: "Drag the printed face instead to move the design across it.",
    alsoWatch: ["artwork.offset"],
    spotlight: "canvas",
    target: "camera.orbit",
  },
  {
    action: "Tell us where to send what's next",
    detail: "New products, finishes and templates. Nothing else.",
    spotlight: "none",
  },
];

/** As much of the studio as a step needs to know it has been done. */
export type TourObservation = {
  readonly mediaCount: number;
  readonly values: Record<string, unknown>;
};

/**
 * Whether the step in hand has been done.
 *
 * A value is compared as JSON because a target holds a number for a slider, a
 * string for a picker and a pair for a pad, and this has no business knowing
 * which. What it asks is only "is this different from how they found it", which
 * is the same question for all of them.
 *
 * The media count is the exception, and it counts up rather than comparing:
 * arriving with one design and replacing it would leave the count where it was.
 * That is the right reading for a first run, which starts with an empty studio,
 * and the wrong one for a tour re-run against a studio someone has already
 * filled — which cannot happen, because the tour runs once.
 */
export function isTourStepDone({
  current,
  started,
  step,
}: {
  current: TourObservation;
  started: TourObservation;
  step: TourStep;
}): boolean {
  if (step.watch === "media") return current.mediaCount > started.mediaCount;
  if (step.target === undefined) return false;

  return [step.target, ...(step.alsoWatch ?? [])].some(
    (target) =>
      JSON.stringify(current.values[target] ?? null) !==
      JSON.stringify(started.values[target] ?? null),
  );
}
