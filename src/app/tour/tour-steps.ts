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
  },
  {
    action: "Drag the product to turn it",
    detail: "Drag its screen instead to move the design across it.",
    spotlight: "canvas",
    target: "camera.orbit",
  },
  {
    action: "Tell us where to send what's next",
    detail: "New products, finishes and templates. Nothing else.",
    spotlight: "none",
  },
];

/**
 * Whether the step in hand has been done.
 *
 * Compared as JSON because a target's value is a number for a slider, a string
 * for a picker, an object for a pad and a file drop, and this has no business
 * knowing which. What it is asking is only "is this different from how they
 * found it", which is the same question for all of them.
 */
export function isTourStepDone({
  current,
  started,
  step,
}: {
  current: Record<string, unknown>;
  started: Record<string, unknown>;
  step: TourStep;
}): boolean {
  if (step.target === undefined) return false;
  return (
    JSON.stringify(current[step.target] ?? null) !==
    JSON.stringify(started[step.target] ?? null)
  );
}
