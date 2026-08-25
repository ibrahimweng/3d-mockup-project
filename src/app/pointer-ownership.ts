/**
 * Who gets the pointer.
 *
 * Three gestures share one canvas: dragging the design across the device's
 * screen, turning the device, and moving the board. They are told apart on
 * pointer-down and never afterwards, so the rules have to be exhaustive and
 * mutually exclusive — two claimants means the design slides while the device
 * turns, and none means a dead canvas.
 *
 * They lived as three private predicates in three files, which is how they
 * could have drifted apart without anything noticing.
 */

/** Only the fields the decision reads, so it can be checked without a DOM. */
export type PointerClaim = {
  readonly altKey: boolean;
  readonly button: number;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
};

/**
 * A plain primary press, unmodified.
 *
 * Modifier combinations are left alone so the browser's and the runtime's own
 * shortcuts keep working, and the middle button is left to the pan.
 */
export function isPlainPrimaryPointer(event: PointerClaim): boolean {
  return (
    event.button === 0 &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey
  );
}

/** The middle button moves the board, and only the middle button. */
export function claimsViewPan(event: PointerClaim): boolean {
  return event.button === 1;
}

/**
 * The screen edits the design; everything else edits the view.
 *
 * A plain primary press is only a design drag when it actually lands on a
 * display and there is a design to move. That is what leaves a press on the
 * body, or on empty canvas, to the orbit.
 */
export function claimsDesignDrag({
  event,
  hasDesign,
  hitScreen,
}: {
  event: PointerClaim;
  hasDesign: boolean;
  hitScreen: boolean;
}): boolean {
  return hasDesign && isPlainPrimaryPointer(event) && hitScreen;
}

/** A plain primary press that the design did not take turns the device. */
export function claimsViewOrbit(event: PointerClaim): boolean {
  return isPlainPrimaryPointer(event);
}
