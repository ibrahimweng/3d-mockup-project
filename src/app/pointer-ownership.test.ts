import { describe, expect, test } from "vitest";

import {
  claimsDesignDrag,
  claimsViewOrbit,
  claimsViewPan,
  isPlainPrimaryPointer,
  type PointerClaim,
} from "./pointer-ownership";

function press(patch: Partial<PointerClaim> = {}): PointerClaim {
  return {
    altKey: false,
    button: 0,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...patch,
  };
}

/** Who takes this press, given where it landed. */
function owner(event: PointerClaim, { hasDesign = true, hitScreen = false } = {}): string {
  if (claimsDesignDrag({ event, hasDesign, hitScreen })) return "design";
  if (claimsViewPan(event)) return "pan";
  if (claimsViewOrbit(event)) return "orbit";
  return "nobody";
}

test("screen drags claim the pointer and body drags leave it to orbit", () => {
  // The whole interaction in one line: the screen edits the design, everything
  // else edits the view.
  expect(owner(press(), { hitScreen: true })).toBe("design");
  expect(owner(press(), { hitScreen: false })).toBe("orbit");

  // With no design loaded there is nothing to drag, so the screen behaves like
  // any other part of the device and the press turns it.
  expect(owner(press(), { hasDesign: false, hitScreen: true })).toBe("orbit");

  // The middle button moves the board wherever it lands, screen included —
  // panning the view is never something the device should intercept.
  expect(owner(press({ button: 1 }), { hitScreen: true })).toBe("pan");
  expect(owner(press({ button: 1 }), { hitScreen: false })).toBe("pan");

  // Modified presses are left alone so the browser's and the runtime's own
  // shortcuts keep working.
  for (const modifier of ["altKey", "ctrlKey", "metaKey", "shiftKey"] as const) {
    expect(owner(press({ [modifier]: true }), { hitScreen: true })).toBe("nobody");
    expect(owner(press({ [modifier]: true }), { hitScreen: false })).toBe("nobody");
  }

  // The secondary button belongs to the context menu, not to the canvas.
  expect(owner(press({ button: 2 }), { hitScreen: true })).toBe("nobody");
});

describe("the three claims cannot overlap", () => {
  test("no press is ever taken by two gestures", () => {
    // Two claimants would mean the design slides while the device turns.
    for (const button of [0, 1, 2]) {
      for (const hitScreen of [false, true]) {
        for (const hasDesign of [false, true]) {
          for (const modifier of [null, "altKey", "ctrlKey", "metaKey", "shiftKey"] as const) {
            const event = press({
              button,
              ...(modifier ? { [modifier]: true } : {}),
            });
            const claims = [
              claimsDesignDrag({ event, hasDesign, hitScreen }),
              claimsViewPan(event),
              // Orbit is the fallback for a plain primary, so it only counts
              // as a competing claim when the design did not take the press.
              claimsViewOrbit(event) && !claimsDesignDrag({ event, hasDesign, hitScreen }),
            ].filter(Boolean);
            expect(claims.length, JSON.stringify({ button, hasDesign, hitScreen, modifier }))
              .toBeLessThanOrEqual(1);
          }
        }
      }
    }
  });

  test("a plain primary is always taken by someone", () => {
    // A press that nobody takes is a dead canvas.
    expect(isPlainPrimaryPointer(press())).toBe(true);
    expect(owner(press(), { hitScreen: true })).not.toBe("nobody");
    expect(owner(press(), { hitScreen: false })).not.toBe("nobody");
  });
});
