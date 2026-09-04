import * as React from "react";

import { rememberEmailGiven } from "./signup-storage";

export type SignupStatus = "asking" | "failed" | "saved" | "sending";

/**
 * Handing an address to the server, wherever it was asked for.
 *
 * Two places ask now — the tour's closing step and the export gate — and they
 * are the same exchange with different framing, so they share the request, the
 * error handling and the one thing that must not be got wrong: only a signup
 * the server accepted sets the flag that stops the studio asking again. A
 * failed save that quietly marked someone as done would lose the address and
 * the second chance at it.
 *
 * `source` is carried through so the list says where each address came from,
 * which is the only way to learn whether the tour or the export does the work.
 */
export function useEmailSignup(source: string): {
  message: string;
  reset: () => void;
  status: SignupStatus;
  submit: (email: string) => Promise<boolean>;
} {
  const [status, setStatus] = React.useState<SignupStatus>("asking");
  const [message, setMessage] = React.useState("");

  const reset = React.useCallback(() => {
    setStatus("asking");
    setMessage("");
  }, []);

  const submit = React.useCallback(
    async (email: string): Promise<boolean> => {
      setStatus("sending");
      setMessage("");

      try {
        const response = await fetch("/api/subscribe", {
          body: JSON.stringify({ email, source, website: "" }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        });
        const body = (await response.json()) as { error?: string };

        if (!response.ok) {
          setStatus("failed");
          setMessage(body.error ?? "That did not save.");
          return false;
        }

        rememberEmailGiven();
        setStatus("saved");
        return true;
      } catch {
        setStatus("failed");
        setMessage("Could not reach the server.");
        return false;
      }
    },
    [source],
  );

  return { message, reset, status, submit };
}
