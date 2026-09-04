import * as React from "react";
import { createPortal } from "react-dom";

import { Button, Input } from "@/toolcraft/ui/components/primitives";

import {
  installExportGate,
  releaseExport,
  type ExportLabel,
} from "./export-gate";
import { setExportGateOpen } from "./gate-visibility";
import { hasGivenEmail } from "./signup-storage";
import { useEmailSignup } from "./use-email-signup";

/** How long someone reads before refusing is offered as a choice. */
const skipDelaySeconds = 8;

/**
 * The one thing standing between a press of Export and the file.
 *
 * A modal, deliberately: the earlier version was a card that appeared after the
 * export had already downloaded, which made "not now" a question about nothing
 * — the person had what they came for and the card was an afterthought they
 * clicked away. This is the moment of the exchange, so it is the thing on
 * screen, with the export held behind it.
 *
 * Skip is offered, and only after eight seconds. That is the point of it: the
 * time is what turns a reflex into a choice, so someone who genuinely does not
 * want to leave an address gets their file, and someone who was going to click
 * the nearest button reads why first.
 *
 * It never blocks the export in the end. Skip releases it, and so does a
 * failure — if the server is unconfigured or down, the error is shown and the
 * file comes anyway. Nobody is ever unable to use this because a database is.
 */
export function SignupCard(): React.JSX.Element | null {
  const [held, setHeld] = React.useState<ExportLabel | null>(null);
  const [email, setEmail] = React.useState("");
  const [secondsLeft, setSecondsLeft] = React.useState(skipDelaySeconds);
  // Shared with the tour's closing step, which asks the same thing in a
  // different frame. One request, one place that decides a save was accepted.
  const { message, reset, status, submit } = useEmailSignup("export-gate");

  React.useEffect(
    () =>
      installExportGate((label) => {
        reset();
        setSecondsLeft(skipDelaySeconds);
        setHeld(label);
      }),
    [reset],
  );

  // The countdown only runs while the question is open. It is paused by a
  // failure and by a success, because neither is a moment to be offering a way
  // out of something already finished.
  React.useEffect(() => {
    if (held === null || status !== "asking" || secondsLeft <= 0) return;
    const timer = window.setTimeout(() => setSecondsLeft((left) => left - 1), 1_000);
    return () => window.clearTimeout(timer);
  }, [held, secondsLeft, status]);

  // Published so the welcome card can step aside: the backdrop only dims it,
  // and a greyed-out card in the corner reads as broken rather than behind.
  React.useEffect(() => {
    setExportGateOpen(held !== null);
    return () => setExportGateOpen(false);
  }, [held]);

  const release = React.useCallback(() => {
    const label = held;
    setHeld(null);
    if (label) releaseExport(label);
  }, [held]);

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

  if (held === null || hasGivenEmail()) return null;

  const canSkip = secondsLeft <= 0;

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
        className="floating-popup-surface flex w-[min(26rem,100%)] flex-col gap-4 rounded-2xl border p-6 text-[color:var(--popover-foreground)] shadow-2xl"
        data-slot="mockup-signup"
        role="dialog"
      >
        <div className="flex flex-col gap-2">
          <h2 className="text-base font-medium" id="mockup-signup-title">
            {status === "saved"
              ? "Thanks — starting your export."
              : `Where should we send what's next?`}
          </h2>
          <p className="text-sm leading-relaxed text-[color:color-mix(in_oklab,var(--popover-foreground)_70%,transparent)]">
            {status === "saved"
              ? "You're on the list, and we won't ask again."
              : "Leave your email and we'll tell you when new products, finishes and templates land. Nothing else, never shared, and one click to leave."}
          </p>
          {status === "saved" ? null : (
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

        {status === "saved" ? null : (
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
              disabled={!canSkip || status === "sending"}
              onClick={release}
              size="sm"
              type="button"
              variant="ghost"
            >
              {canSkip ? "Skip and export" : `Skip in ${secondsLeft}s`}
            </Button>
          </form>
        )}
      </aside>
    </div>,
    document.body,
  );
}
