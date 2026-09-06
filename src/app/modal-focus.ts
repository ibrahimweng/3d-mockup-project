import * as React from "react";

/**
 * Make a hand-rolled dialog behave like the dialog it says it is.
 *
 * The export gate's card carries `role="dialog"` and `aria-modal="true"`, and
 * did neither of the two things that claim promises. `aria-modal` tells a
 * screen reader to hide everything outside the dialog, so a keyboard that can
 * still tab out of it lands the person somewhere their screen reader says does
 * not exist. And a dialog that Escape does not close is one a keyboard user has
 * no way out of at all, because the only way out was a button they could not
 * reach in the first place.
 *
 * The runtime's own `Dialog` composite does all of this. The card does not use
 * it, deliberately: it has to hold a press in the capture phase and step out of
 * the way of the canvas underneath, which that component does not allow for. So
 * the behaviour is written once here rather than a second dialog being grown by
 * accident.
 */

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function focusableWithin(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(focusableSelector)].filter(
    // A control scrolled out of view is still reachable; one with no box at all
    // is not there. `offsetParent` is null for both `display: none` and a fixed
    // element, so the size is checked instead.
    (element) => element.getBoundingClientRect().width > 0,
  );
}

/**
 * Hold Tab inside the dialog, answer Escape, and give focus back afterwards.
 *
 * `onEscape` is optional. The export gate passes one because a person must
 * always be able to leave; a dialog with nothing to go back to would pass none
 * and keep only the trap.
 */
export function useModalFocus({
  onEscape,
  open,
  ref,
}: {
  onEscape?: () => void;
  open: boolean;
  ref: React.RefObject<HTMLElement | null>;
}): void {
  // Held in a ref so the effect below does not re-run, and re-focus the dialog,
  // every time the caller passes a fresh closure.
  const escapeRef = React.useRef(onEscape);
  escapeRef.current = onEscape;

  React.useEffect(() => {
    const container = ref.current;
    if (!open || !container) return undefined;

    // Where focus was before this opened, so it can be put back. Losing it
    // sends a keyboard user to the top of the document, which after an export
    // means tabbing through the whole panel again to get back to where they
    // were.
    const returnTo =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    if (!container.contains(document.activeElement)) {
      (focusableWithin(container)[0] ?? container).focus();
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        const escape = escapeRef.current;
        if (!escape) return;
        event.preventDefault();
        event.stopPropagation();
        escape();
        return;
      }

      if (event.key !== "Tab") return;
      const focusable = focusableWithin(container);
      // Nothing to move between, so there is nowhere for Tab to go but out.
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      // Wrap at both ends, and catch focus that has already escaped, which
      // happens when something outside was focused while this was open.
      if (event.shiftKey && (active === first || !container.contains(active))) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && (active === last || !container.contains(active))) {
        event.preventDefault();
        first?.focus();
      }
    };

    // Capture, so this is decided before anything below can act on the key.
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      // Only if focus is still inside, so this does not steal it from wherever
      // it has legitimately moved on to.
      if (container.contains(document.activeElement)) returnTo?.focus();
    };
  }, [open, ref]);
}
