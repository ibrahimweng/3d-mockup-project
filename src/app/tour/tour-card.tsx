import * as React from "react";

import { Button, Input } from "@/toolcraft/ui/components/primitives";

import { useEmailSignup } from "../signup/use-email-signup";
import type { TourStep } from "./tour-steps";

/**
 * How long someone is left to work a step out before a way past it appears.
 *
 * A tour that waits for the real action teaches more than one that does not,
 * and a tour that waits forever is a trap. Ten seconds is long enough that
 * anyone who is getting on with it never sees the button, and short enough
 * that anyone who is stuck is not stuck for long.
 */
export const tourNextAfterSeconds = 10;

function StepBody({
  index,
  onNext,
  onSkip,
  showNext,
  step,
  total,
}: {
  index: number;
  onNext: () => void;
  onSkip: () => void;
  showNext: boolean;
  step: TourStep;
  total: number;
}): React.JSX.Element {
  return (
    <>
      <p className="font-mono text-[11px] uppercase tracking-wide text-[color:color-mix(in_oklab,var(--popover-foreground)_55%,transparent)]">
        Step {index + 1} of {total}
      </p>
      <div className="flex flex-col gap-1">
        <h2
          className="font-medium text-[color:var(--foreground)] text-sm"
          id="mockup-tour-title"
        >
          {step.action}
        </h2>
        {step.detail === undefined ? null : (
          <p className="text-[color:color-mix(in_oklab,var(--popover-foreground)_70%,transparent)] text-xs leading-relaxed">
            {step.detail}
          </p>
        )}
      </div>
      <div className="flex items-center justify-between gap-2">
        <Button data-slot="mockup-tour-skip" onClick={onSkip} size="sm" variant="ghost">
          Skip tour
        </Button>
        {showNext ? (
          <Button
            data-slot="mockup-tour-next"
            onClick={onNext}
            size="sm"
            variant="secondary"
          >
            Next
          </Button>
        ) : (
          <span
            className="text-[11px] text-[color:color-mix(in_oklab,var(--popover-foreground)_45%,transparent)]"
            role="status"
          >
            Waiting for you…
          </span>
        )}
      </div>
    </>
  );
}

/**
 * The last step, which is the ask.
 *
 * Skippable, and skippable immediately rather than after a countdown. The
 * export gate makes someone read for eight seconds before it offers a way out,
 * and that is right there — they are mid-export and about to receive something.
 * Here they have just been given a tour and nothing is being withheld, so a
 * timed lock would be the studio charging for a favour it already did. Anyone
 * who skips meets the export gate the moment they save a picture, which is the
 * moment the exchange is actually worth something.
 */
function EmailBody({
  onDone,
}: {
  onDone: () => void;
}): React.JSX.Element {
  const [email, setEmail] = React.useState("");
  const { message, status, submit } = useEmailSignup("first-run-tour");

  React.useEffect(() => {
    if (status !== "saved") return;
    const timer = window.setTimeout(onDone, 1_400);
    return () => window.clearTimeout(timer);
  }, [onDone, status]);

  if (status === "saved") {
    return (
      <div className="flex flex-col gap-1">
        <h2 className="font-medium text-[color:var(--foreground)] text-sm" id="mockup-tour-title">
          Thanks — you're on the list.
        </h2>
        <p className="text-[color:color-mix(in_oklab,var(--popover-foreground)_70%,transparent)] text-xs leading-relaxed">
          We won't ask again. Go and make something.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-1">
        <h2 className="font-medium text-[color:var(--foreground)] text-sm" id="mockup-tour-title">
          Where should we send what's next?
        </h2>
        <p className="text-[color:color-mix(in_oklab,var(--popover-foreground)_70%,transparent)] text-xs leading-relaxed">
          New products, finishes and templates. Nothing else, never shared, and
          one click to leave.
        </p>
        <a
          className="text-[11px] underline underline-offset-2 text-[color:color-mix(in_oklab,var(--popover-foreground)_55%,transparent)] hover:text-[color:var(--popover-foreground)]"
          href="/privacy"
          rel="noreferrer"
          target="_blank"
        >
          What we do with it
        </a>
      </div>
      <form
        className="flex flex-col gap-2"
        data-slot="mockup-tour-email"
        onSubmit={(event) => {
          event.preventDefault();
          void submit(email);
        }}
      >
        <Input
          aria-label="Email address"
          autoComplete="email"
          disabled={status === "sending"}
          name="email"
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          required
          type="email"
          value={email}
        />
        {message ? (
          <p className="text-[color:var(--destructive)] text-xs" role="alert">
            {message}
          </p>
        ) : null}
        <Button disabled={status === "sending"} size="sm" type="submit">
          {status === "sending" ? "Sending…" : "Keep me posted"}
        </Button>
      </form>
      <div className="flex justify-end">
        <Button data-slot="mockup-tour-email-skip" onClick={onDone} size="sm" variant="ghost">
          Skip
        </Button>
      </div>
    </>
  );
}

export function TourCard({
  index,
  onDone,
  onNext,
  onSkip,
  showNext,
  step,
  total,
}: {
  index: number;
  onDone: () => void;
  onNext: () => void;
  onSkip: () => void;
  showNext: boolean;
  step: TourStep;
  total: number;
}): React.JSX.Element {
  return (
    <aside
      aria-labelledby="mockup-tour-title"
      className="floating-popup-surface pointer-events-auto fixed bottom-6 left-6 z-50 flex w-[min(22rem,calc(100vw-3rem))] flex-col gap-3 rounded-2xl border p-4 text-[color:var(--popover-foreground)] shadow-2xl"
      data-slot="mockup-tour"
      data-tour-step={index + 1}
      data-tour-total={total}
      /*
       * Pointer events stop here.
       *
       * A React portal bubbles through the React tree rather than the DOM one,
       * and this is mounted inside the canvas content — so without this a press
       * on a button travels on into the preview's handlers, which claim the
       * pointer with `setPointerCapture`. The release then belongs to the
       * canvas, no click is synthesised, and every button in here is dead while
       * the product turns behind the card.
       */
      onPointerDown={(event) => event.stopPropagation()}
      onPointerMove={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
    >
      {step.target === undefined ? (
        <EmailBody onDone={onDone} />
      ) : (
        <StepBody
          index={index}
          onNext={onNext}
          onSkip={onSkip}
          showNext={showNext}
          step={step}
          total={total}
        />
      )}
    </aside>
  );
}
