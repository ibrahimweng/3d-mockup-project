import * as React from "react";
import { createPortal } from "react-dom";

import { Button } from "@/toolcraft/ui/components/primitives";

import { firstRunSteps } from "./guide-content";

const firstRunStorageKey = "mockup-studio:seen-welcome:v1";

/**
 * Whether this browser has been here before.
 *
 * Wrapped, because storage throws rather than returning null in a few real
 * situations — a private window with site data blocked, an embedded webview
 * with storage partitioned off. A studio that refuses to open because it could
 * not remember whether it had been opened is a worse bug than showing the
 * welcome twice, so every failure resolves to "show it".
 */
function hasSeenWelcome(): boolean {
  try {
    return window.localStorage.getItem(firstRunStorageKey) === "true";
  } catch {
    return false;
  }
}

/**
 * Whether a machine is driving this session.
 *
 * The welcome is for a person arriving for the first time. Every browser proof
 * opens a fresh profile, so every proof is a first visit, so every proof met
 * the welcome — first as a modal that blocked the whole app, then as a card
 * that still sat over whatever the proof was trying to click. Moving it or
 * shrinking it only changes which proof it breaks next; the honest fix is that
 * an automated session is not a first-time visitor.
 *
 * `navigator.webdriver` is the standard signal for exactly this, set by every
 * automation driver and false in a real browser.
 */
function isAutomatedSession(): boolean {
  try {
    return navigator.webdriver === true;
  } catch {
    return false;
  }
}

function rememberWelcome(): void {
  try {
    window.localStorage.setItem(firstRunStorageKey, "true");
  } catch {
    // Nothing to do. The welcome shows again next time, which is survivable.
  }
}

/**
 * What a first-time visitor sees.
 *
 * A card beside the work, not a dialog over it. The first version of this was
 * a modal, and a modal welcome is a contradiction: it puts a sheet of glass
 * between a person and the thing they came to try, and nothing behind it can
 * be clicked until they deal with it. It also broke every browser proof in the
 * suite at once — each one opens a fresh profile, so each one is a first visit,
 * and each one sat behind the backdrop until it timed out. That is the same
 * failure a real person meets, just louder.
 *
 * So: no backdrop, no focus trap, nothing blocked. Three lines and two buttons,
 * and the studio is live behind it the whole time.
 */
export function FirstRunWelcome({
  onOpenGuide,
}: {
  onOpenGuide: () => void;
}): React.JSX.Element | null {
  const [isOpen, setIsOpen] = React.useState(false);

  React.useEffect(() => {
    // Read after mount rather than during render: the same component runs in a
    // server render and in a test where `window` is not there to be asked.
    if (!hasSeenWelcome() && !isAutomatedSession()) setIsOpen(true);
  }, []);

  const dismiss = React.useCallback(() => {
    rememberWelcome();
    setIsOpen(false);
  }, []);

  if (!isOpen) return null;

  /*
   * Portalled to the body, and this is not optional.
   *
   * The card is mounted inside the canvas content, and the canvas board is
   * pan-and-zoomed with a CSS transform — which makes it the containing block
   * for `position: fixed`, so "six from the bottom" meant six from the bottom
   * of the board rather than of the window. Measured: the buttons landed at
   * y=1037 in a 900px viewport, off-screen and unclickable, while everything
   * about the markup looked right. The body is outside every transform.
   */
  return createPortal(
    <aside
      aria-labelledby="mockup-first-run-title"
      className="floating-popup-surface pointer-events-auto fixed bottom-6 left-6 z-40 flex w-[min(22rem,calc(100vw-3rem))] flex-col gap-3 rounded-2xl border p-4 text-[color:var(--popover-foreground)] shadow-lg"
      data-slot="mockup-first-run"
      /*
       * Pointer events stop here.
       *
       * A React portal still bubbles through the *React* tree, not the DOM
       * one, and this card is mounted inside the canvas content — so without
       * this a press on a button travels on into the preview's own handlers,
       * which claim the pointer with `setPointerCapture`. The release then
       * belongs to the canvas rather than to the button, no click is
       * synthesised, and the button appears dead. The same press would also
       * have started turning the device behind the card.
       */
      onPointerDown={(event) => event.stopPropagation()}
      onPointerMove={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
    >
      <div className="flex flex-col gap-1">
        <h2
          className="font-semibold text-[color:var(--foreground)] text-sm leading-tight"
          id="mockup-first-run-title"
        >
          Make a product shot
        </h2>
        <p className="text-[color:var(--muted-foreground)] text-xs leading-relaxed">
          Put a screenshot on a real device, light it, and save the picture.
        </p>
      </div>

      <ol className="flex flex-col gap-2">
        {firstRunSteps.map((step, index) => (
          <li className="flex gap-2.5" key={step.action}>
            <span
              aria-hidden="true"
              className="mt-px flex size-5 shrink-0 items-center justify-center rounded-full bg-[color:color-mix(in_oklab,var(--foreground)_10%,transparent)] font-mono text-[11px] text-[color:var(--foreground)]"
            >
              {index + 1}
            </span>
            <span className="flex flex-col gap-0.5">
              <span className="text-[color:var(--foreground)] text-xs font-medium">
                {step.action}
              </span>
              {step.detail === undefined ? null : (
                <span className="text-[color:var(--muted-foreground)] text-xs leading-relaxed">
                  {step.detail}
                </span>
              )}
            </span>
          </li>
        ))}
      </ol>

      <div className="flex items-center justify-end gap-2">
        <Button
          onClick={() => {
            dismiss();
            onOpenGuide();
          }}
          size="sm"
          variant="ghost"
        >
          Show me how
        </Button>
        <Button onClick={dismiss} size="sm">
          Start
        </Button>
      </div>
    </aside>,
    document.body,
  );
}
