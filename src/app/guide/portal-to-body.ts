import * as React from "react";

/**
 * Portal a dialog to the document body rather than to the app's shared portal
 * layer.
 *
 * Measured: a dialog left on the inherited layer ends up with an ancestor
 * carrying `aria-hidden="true"`, so its own content is removed from the
 * accessibility tree — the buttons are visible and clickable but a screen
 * reader cannot see them, and `getByRole` finds nothing inside the dialog.
 * The cause is that the modal marks everything outside its popup hidden, and
 * the shared layer sits outside it while containing it.
 *
 * Body is outside every app container, so nothing can hide it.
 */
export function useBodyPortalContainer(): React.RefObject<HTMLElement | null> {
  const container = React.useRef<HTMLElement | null>(null);
  if (container.current === null && typeof document !== "undefined") {
    container.current = document.body;
  }
  return container;
}
