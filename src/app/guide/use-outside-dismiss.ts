import * as React from "react";

/**
 * Close a dialog when someone presses outside it.
 *
 * The dialog primitive should do this and does not: its backdrop is rendered
 * inside its own portal, so it reads a press on the backdrop as a press inside
 * itself and never dismisses. That affects every dialog in this app, so the
 * workaround lives here once rather than in each of them.
 *
 * Capture phase, so the press is seen before anything below can swallow it.
 */
export function useOutsideDismiss(
  isOpen: boolean,
  contentSelector: string,
  close: () => void,
): void {
  React.useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: PointerEvent): void => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      const content = document.querySelector(contentSelector);
      if (content !== null && content.contains(target)) return;
      close();
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [close, contentSelector, isOpen]);
}
