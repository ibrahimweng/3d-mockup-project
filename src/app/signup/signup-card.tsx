import * as React from "react";
import { createPortal } from "react-dom";

import { Button, Input } from "@/toolcraft/ui/components/primitives";

import {
  installExportGate,
  releaseExport,
  type ExportLabel,
} from "./export-gate";
import { useModalFocus } from "../modal-focus";
import { setExportGateOpen } from "./gate-visibility";
import { rememberEmailAskSkipped } from "./signup-storage";
import { useEmailSignup } from "./use-email-signup";

/**
 * The one thing standing between a press of Export and the file.
 *
 * A modal, deliberately. The earlier version was a card that appeared after the
 * export had already downloaded, which made "not now" a question about nothing.
 * The person had what they came for and the card was an afterthought they
 * clicked away. This is the moment of the exchange, so it is the thing on
 * screen, with the export held behind it.
 *
 * Skip is offered straight away. It used to be held back for eight seconds, on
 * the reasoning that the time turns a reflex into a choice. What a forced wait
 * actually does is take the file someone came for and give it back slowly, and
 * the people it lands on hardest are the ones who would have signed up anyway.
 * The tour makes the same ask with an immediate skip and says in its own
 * comments why that is right. It is right here too.
 *
 * The ask is also made once a sitting rather than once an export. Someone
 * saving ten variations of one shot is one person doing one job, and asking
 * them ten times is not asking, it is standing in the way.
 *
 * It never blocks the export in the end. Skip releases it, and so does a
 * failure. If the server is unconfigured or down, the error is shown and the
 * file comes anyway. Nobody is ever unable to use this because a database is.
 */
export function SignupCard(): React.JSX.Element | null {
  const [held, setHeld] = React.useState<ExportLabel | null>(null);
  const [email, setEmail] = React.useState("");
  // Set when the export could not be started again after the gate let go of
  // it. Rare, and silent until now, which is the worst way for it to be rare.
  const [couldNotStart, setCouldNotStart] = React.useState(false);
  const cardRef = React.useRef<HTMLElement | null>(null);
  // Shared with the tour's closing step, which asks the same thing in a
  // different frame. One request, one place that decides a save was accepted.
  const { message, reset, status, submit } = useEmailSignup("export-gate");

  React.useEffect(
    () =>
      installExportGate((label) => {
        reset();
        setCouldNotStart(false);
        setHeld(label);
      }),
    [reset],
  );

  // Published so the welcome card can step aside: the backdrop only dims it,
  // and a greyed-out card in the corner reads as broken rather than behind.
  React.useEffect(() => {
    setExportGateOpen(held !== null);
    return () => setExportGateOpen(false);
  }, [held]);

  /**
   * Let the export through, and say so when it cannot go.
   *
   * `releaseExport` finds the panel's own button and presses it, and it answers
   * false when there is no button to press — one disabled mid-export, or a
   * label that has been renamed since this was written. That answer used to be
   * thrown away, so the modal closed on someone who had just given their
   * address and no file ever arrived, with nothing on screen to say why. This
   * whole feature is built to fail towards letting people through, and that was
   * the one path where it failed the other way.
   */
  const release = React.useCallback(() => {
    const label = held;
    if (label === null) return;
    // Whichever way this goes, they have answered the question for this sitting
    // and should not meet it again on the next export.
    rememberEmailAskSkipped();

    if (releaseExport(label)) {
      setHeld(null);
      return;
    }
    setCouldNotStart(true);
  }, [held]);

  const dismiss = React.useCallback(() => {
    setCouldNotStart(false);
    setHeld(null);
  }, []);

  /*
   * Escape lets the export through rather than cancelling it.
   *
   * This card is between someone and a file they asked for, so the way out has
   * to hand it over. Closing on Escape and keeping the export back would make
   * the key that means "leave me alone" the one that quietly loses their work.
   * It is the same thing the Skip button does, which is the point: there is one
   * way out and two ways to reach it.
   */
  const escape = React.useCallback(() => {
    if (couldNotStart) {
      dismiss();
      return;
    }
    if (status === "sending") return;
    release();
  }, [couldNotStart, dismiss, release, status]);

  useModalFocus({ onEscape: escape, open: held !== null, ref: cardRef });

  const send = React.useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      const saved = await submit(email);
      // Either way the export goes. A signup that could not be stored is not a
      // reason to withhold someone's picture, and the error is shown first.
      window.setTimeout(release, saved ? 1_400 : 2_200);
    },
    [email, release, submit],
  );

  /*
   * Only the held export decides whether this is on screen.
   *
   * It used to also return null once an address had been given, which sounds
   * safe and was not: saving one sets that flag before the status becomes
   * "saved", so the card vanished on the press and the export followed 1.4
   * seconds later with nothing on screen in between. The thank-you underneath
   * was unreachable. Whether to ask at all is the gate's decision and it makes
   * it before this ever opens.
   */
  if (held === null) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
      data-slot="mockup-signup-backdrop"
      /*
       * Pointer events stop here, all of them.
       *
       * A React portal bubbles through the React tree rather than the DOM one,
       * and this is mounted inside the canvas content — so without this a press
       * travels on into the preview's own handlers, which claim the pointer
       * with `setPointerCapture`. The release then belongs to the canvas, no
       * click is synthesised on the button, and every control in here is dead
       * while the device silently turns behind the backdrop.
       */
      onPointerDown={(event) => event.stopPropagation()}
      onPointerMove={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
    >
      <aside
        aria-labelledby="mockup-signup-title"
        aria-modal="true"
        ref={cardRef}
        tabIndex={-1}
        className="floating-popup-surface flex w-[min(26rem,100%)] flex-col gap-4 rounded-2xl border p-6 text-[color:var(--popover-foreground)] shadow-2xl"
        data-slot="mockup-signup"
        role="dialog"
      >
        <div className="flex flex-col gap-2">
          <h2 className="text-base font-medium" id="mockup-signup-title">
            {couldNotStart
              ? "Your export did not start."
              : status === "saved"
                ? "Thanks — starting your export."
                : `Where should we send what's next?`}
          </h2>
          <p className="text-sm leading-relaxed text-[color:color-mix(in_oklab,var(--popover-foreground)_70%,transparent)]">
            {couldNotStart
              ? `Something went wrong on our side, not yours. Close this and press ${held} again. Nothing is being held back now.`
              : status === "saved"
                ? "You're on the list, and we won't ask again."
                : "Leave your email and we'll tell you when new products, finishes and templates land. Nothing else, never shared, and one click to leave."}
          </p>
          {status === "saved" || couldNotStart ? null : (
            /*
             * Linked where the promise is made rather than only in a footer,
             * because "never shared" is a claim and someone deciding whether
             * to believe it should be one click from the page that spells it
             * out. Opens in a tab of its own so a half-typed address and a
             * held export both survive the reading.
             */
            <a
              className="text-xs underline underline-offset-2 text-[color:color-mix(in_oklab,var(--popover-foreground)_55%,transparent)] hover:text-[color:var(--popover-foreground)]"
              href="/privacy"
              rel="noreferrer"
              target="_blank"
            >
              What we do with it
            </a>
          )}
        </div>

        {couldNotStart ? (
          <Button data-slot="mockup-signup-dismiss" onClick={dismiss} type="button">
            Close
          </Button>
        ) : null}

        {status === "saved" || couldNotStart ? null : (
          <form className="flex flex-col gap-3" onSubmit={send}>
            <Input
              aria-label="Email address"
              autoComplete="email"
              autoFocus
              disabled={status === "sending"}
              name="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              required
              type="email"
              value={email}
            />
            {message ? (
              <p className="text-sm text-[color:var(--destructive)]" role="alert">
                {message} Starting your export anyway.
              </p>
            ) : null}
            <Button disabled={status === "sending"} type="submit">
              {status === "sending" ? "Saving…" : "Continue to export"}
            </Button>
            <Button
              data-slot="mockup-signup-skip"
              disabled={status === "sending"}
              onClick={release}
              size="sm"
              type="button"
              variant="ghost"
            >
              Skip and export
            </Button>
          </form>
        )}
      </aside>
    </div>,
    document.body,
  );
}
