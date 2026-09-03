/**
 * "An export just finished" — the only signal this product can get.
 *
 * The runtime owns Export PNG and Export Video outright: they are typed export
 * roles it runs itself, and `onPanelAction` is only ever handed the actions the
 * product owns, which these are not. So there is no press to intercept and no
 * completion callback to subscribe to. What the product does own is the export
 * renderer, which the runtime calls to draw each frame.
 *
 * That gives a start but no end, so the end is inferred: an export is over when
 * no frame has been asked for in a while. A still image is one frame and settles
 * immediately; a video is hundreds and settles when the last one is drawn. The
 * alternative — asking on the first frame — would put a card over the picture
 * while the picture was still being made.
 */

const settleDelayMs = 1_200;

type Listener = () => void;

const listeners = new Set<Listener>();
let settleTimer: ReturnType<typeof setTimeout> | undefined;

export function onExportSettled(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Called by the product export renderer for every frame it draws. */
export function noteExportedFrame(): void {
  if (settleTimer !== undefined) clearTimeout(settleTimer);
  settleTimer = setTimeout(() => {
    settleTimer = undefined;
    // Copied before iterating: a listener may unsubscribe as it runs.
    for (const listener of [...listeners]) listener();
  }, settleDelayMs);
}

/** For tests, which must not leak a pending timer into the next one. */
export function resetExportSettleSignal(): void {
  if (settleTimer !== undefined) clearTimeout(settleTimer);
  settleTimer = undefined;
  listeners.clear();
}
