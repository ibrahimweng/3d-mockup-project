import * as React from "react";

/**
 * Whether the first-run tour is on screen, for the surfaces that must get out
 * of its way.
 *
 * The sponsor card is the one that does. Somebody being walked through the
 * studio for the first time is being taught how to use it, and that is the
 * worst moment in the whole session to put an advertisement in front of them.
 * The two cards are in opposite corners, so this is about the moment rather
 * than about the space.
 *
 * A published fact rather than a prop, because the two live in different
 * subtrees with no provider between them. It is the same shape as the export
 * gate's next door in `signup/gate-visibility.ts`, kept for the same reason.
 */

let showing = false;
const listeners = new Set<() => void>();

export function setTourShowing(next: boolean): void {
  if (showing === next) return;
  showing = next;
  // Copied before iterating: a listener may unsubscribe as it runs.
  for (const listener of [...listeners]) listener();
}

export function subscribeToTour(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isTourShowing(): boolean {
  return showing;
}

export function useTourShowing(): boolean {
  return React.useSyncExternalStore(
    subscribeToTour,
    isTourShowing,
    // A server render has no tour, and saying otherwise would leave the sponsor
    // card out of the markup that is served first.
    () => false,
  );
}

/** For tests, which must not leak one case's tour into the next. */
export function resetTourVisibilityForTests(): void {
  showing = false;
  listeners.clear();
}
