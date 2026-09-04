import * as React from "react";

/**
 * Whether the export gate is on screen, for the surfaces that must get out of
 * its way.
 *
 * The welcome card is the one that does. Both are portalled to the body from
 * inside the canvas content, so the backdrop covers the card and dims it rather
 * than hiding it — a greyed-out card in the corner, unreadable and unclickable,
 * which reads as something broken rather than something behind. A first-time
 * visitor who presses Export straight away met exactly that.
 *
 * A published fact rather than a prop, because the two live in different
 * subtrees with no provider between them. The gate says whether it is open and
 * anything that needs to know subscribes, which is the same shape as the open
 * signal next door in the guide, kept for state instead of for an event.
 */

let open = false;
const listeners = new Set<() => void>();

export function setExportGateOpen(next: boolean): void {
  if (open === next) return;
  open = next;
  // Copied before iterating: a listener may unsubscribe as it runs.
  for (const listener of [...listeners]) listener();
}

export function subscribeToExportGate(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isExportGateOpen(): boolean {
  return open;
}

export function useExportGateOpen(): boolean {
  return React.useSyncExternalStore(
    subscribeToExportGate,
    isExportGateOpen,
    // A server render has no gate, and saying otherwise would blank the
    // welcome card in the markup a first-time visitor is first served.
    () => false,
  );
}

/** For tests, which must not leak one case's gate into the next. */
export function resetExportGateForTests(): void {
  open = false;
  listeners.clear();
}
