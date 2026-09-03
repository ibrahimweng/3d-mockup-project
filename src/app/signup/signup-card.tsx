import * as React from "react";
import { createPortal } from "react-dom";

import { Button, Input } from "@/toolcraft/ui/components/primitives";

import { onExportSettled } from "./signup-signal";
import {
  hasBeenAskedForEmail,
  isAutomatedSession,
  rememberAskedForEmail,
} from "./signup-storage";

type Status = "asking" | "failed" | "saved" | "sending";

/**
 * The one time this studio asks for an email address.
 *
 * After a first export rather than before it, which is a deliberate trade. A
 * wall on arrival collects from the few who push through it and turns away
 * everyone who wanted to see a shirt first; asking someone who has just made
 * the thing they came for costs nothing and catches them at the one moment
 * they are pleased with it.
 *
 * It gates nothing. The export has already happened and downloading is not
 * held back, so "Not now" is a real answer and the studio is untouched either
 * way. That is what makes it honest to store the address at all: nobody is
 * paying for the tool with it.
 *
 * Shaped like the welcome card next door, and for the reasons written there:
 * portalled to the body because the canvas board is transformed and would
 * otherwise be the containing block for `position: fixed`; stopping pointer
 * events because a React portal bubbles through the React tree into the
 * preview's own handlers, which claim the pointer and leave the buttons dead.
 */
export function SignupCard(): React.JSX.Element | null {
  const [isOpen, setIsOpen] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [status, setStatus] = React.useState<Status>("asking");
  const [message, setMessage] = React.useState("");

  React.useEffect(
    () =>
      onExportSettled(() => {
        if (hasBeenAskedForEmail() || isAutomatedSession()) return;
        // Remembered on sight rather than on answer: the promise is that this
        // is asked once, and someone who ignores it has still been asked.
        rememberAskedForEmail();
        setIsOpen(true);
      }),
    [],
  );

  const submit = React.useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      setStatus("sending");
      setMessage("");

      try {
        const response = await fetch("/api/subscribe", {
          body: JSON.stringify({ email, source: "export", website: "" }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        });
        const body = (await response.json()) as { error?: string };

        if (!response.ok) {
          setStatus("failed");
          setMessage(body.error ?? "That did not save. Try again.");
          return;
        }

        setStatus("saved");
        window.setTimeout(() => setIsOpen(false), 1_600);
      } catch {
        // Offline, blocked, or the endpoint is not configured yet. Say so
        // rather than showing a success nobody's address reached.
        setStatus("failed");
        setMessage("Could not reach the server. Try again later.");
      }
    },
    [email],
  );

  if (!isOpen) return null;

  return createPortal(
    <aside
      aria-labelledby="mockup-signup-title"
      className="floating-popup-surface pointer-events-auto fixed right-6 bottom-6 z-40 flex w-[min(22rem,calc(100vw-3rem))] flex-col gap-3 rounded-2xl border p-4 text-[color:var(--popover-foreground)] shadow-lg"
      data-slot="mockup-signup"
      onPointerDown={(event) => event.stopPropagation()}
      onPointerMove={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-medium" id="mockup-signup-title">
          {status === "saved" ? "Thanks — you're on the list." : "Nice export."}
        </h2>
        <p className="text-xs text-[color:color-mix(in_oklab,var(--popover-foreground)_65%,transparent)]">
          {status === "saved"
            ? "We'll only email about this studio, and you can ask to be removed at any time."
            : "Leave your email and we'll tell you when new products and finishes land. Nothing else, and never shared."}
        </p>
      </div>

      {status === "saved" ? null : (
        <form className="flex flex-col gap-2" onSubmit={submit}>
          <Input
            aria-label="Email address"
            autoComplete="email"
            disabled={status === "sending"}
            name="email"
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            type="email"
            value={email}
          />
          {message ? (
            <p className="text-xs text-[color:var(--destructive)]" role="alert">
              {message}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button disabled={status === "sending"} size="sm" type="submit">
              {status === "sending" ? "Saving…" : "Keep me posted"}
            </Button>
            <Button
              onClick={() => setIsOpen(false)}
              size="sm"
              type="button"
              variant="ghost"
            >
              Not now
            </Button>
          </div>
        </form>
      )}
    </aside>,
    document.body,
  );
}
