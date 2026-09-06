import * as React from "react";

/**
 * What the scene is doing, for the one surface that has to say so.
 *
 * A product is between 0.7 and 19 megabytes and its environment map is another
 * 1.6, so choosing a MacBook on an ordinary connection is several seconds in
 * which nothing on screen changes. The previous product stays lit and every
 * control in the panel already reads the new one, which is what someone who
 * has just clicked reads as the click not working.
 *
 * A failure was worse. It went to `console.error` and nowhere else, so the old
 * product stayed on screen for good with no way to know why and nothing to
 * press. The renderer is right that keeping the last scene beats a black
 * canvas. It just cannot be the only thing that happens.
 *
 * Published as a fact rather than passed as a prop, the same shape the export
 * gate next door uses, because the renderer is not a React component and the
 * thing that has to report is mounted somewhere else entirely.
 */

export type SceneStatus =
  | { readonly kind: "ready" }
  | { readonly device: string; readonly kind: "loading" }
  | { readonly device: string; readonly kind: "failed" }
  /**
   * No WebGL, which is the end of the road rather than a step on it.
   *
   * Older machines, a graphics driver on a browser's block list, hardware
   * acceleration switched off, and some virtual machines all land here. The
   * renderer's constructor throws in every one of them, and with nothing
   * catching it React unmounted the whole tree and left a white page with no
   * text on it.
   */
  | { readonly kind: "unavailable" };

const ready: SceneStatus = { kind: "ready" };

let status: SceneStatus = ready;
let retries = 0;
const listeners = new Set<() => void>();

function announce(): void {
  // Copied before iterating: a listener may unsubscribe as it runs.
  for (const listener of [...listeners]) listener();
}

function sameStatus(left: SceneStatus, right: SceneStatus): boolean {
  if (left.kind !== right.kind) return false;
  return "device" in left && "device" in right
    ? left.device === right.device
    : true;
}

export function setSceneStatus(next: SceneStatus): void {
  // A machine with no WebGL is not going to grow some. Nothing the renderer
  // reports afterwards is more true than that, and letting a later "loading"
  // overwrite it would replace the explanation with a spinner that never ends.
  if (status.kind === "unavailable") return;
  if (sameStatus(status, next)) return;
  status = next;
  announce();
}

export function getSceneStatus(): SceneStatus {
  return status;
}

export function subscribeToSceneStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useSceneStatus(): SceneStatus {
  return React.useSyncExternalStore(
    subscribeToSceneStatus,
    getSceneStatus,
    // A server render has no renderer and therefore nothing to report.
    () => ready,
  );
}

/**
 * Ask for the load to be tried again.
 *
 * A counter rather than an event, so the preview can watch it the way it
 * watches everything else. The renderer clears its own scene key on a failure,
 * so the next set of settings it is handed is a real attempt rather than a
 * cache hit.
 */
export function retryScene(): void {
  if (status.kind !== "failed") return;
  retries += 1;
  status = { device: status.device, kind: "loading" };
  announce();
}

export function getSceneRetryCount(): number {
  return retries;
}

export function useSceneRetryCount(): number {
  return React.useSyncExternalStore(
    subscribeToSceneStatus,
    getSceneRetryCount,
    () => 0,
  );
}

/** For tests, which must not leak one case's status into the next. */
export function resetSceneStatusForTests(): void {
  status = ready;
  retries = 0;
  listeners.clear();
}
