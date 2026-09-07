import * as React from "react";

/**
 * Asking who has bought the corner today.
 *
 * One GET on mount and then nothing. There is no polling and no refresh: a
 * booking changes at most once a day, and a studio somebody leaves open all
 * afternoon is not a place to spend requests re-asking a question whose answer
 * is a date range.
 *
 * Every failure resolves to "nobody". An endpoint that is missing, unreachable,
 * or answering with something unexpected is indistinguishable from a day nobody
 * has bought, and the card already has to render that day correctly. So the
 * failure path is a state the app is in anyway rather than an error anybody has
 * to be shown.
 *
 * Nothing is sent. The request carries no address, no identifier and no cookie,
 * which is what makes it safe to describe in the privacy note as a question
 * about the site rather than about the person asking.
 */

export type StudioSponsor = {
  readonly headline: string;
  readonly href: string;
  readonly id: string;
  readonly imageUrl: string;
  readonly sponsor: string;
};

export type SponsorSlotState = {
  readonly settled: boolean;
  readonly sponsor: StudioSponsor | null;
};

function readSponsor(value: unknown): StudioSponsor | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<StudioSponsor>;
  return typeof record.href === "string" &&
    typeof record.id === "string" &&
    typeof record.imageUrl === "string" &&
    typeof record.sponsor === "string"
    ? {
        headline: typeof record.headline === "string" ? record.headline : "",
        href: record.href,
        id: record.id,
        imageUrl: record.imageUrl,
        sponsor: record.sponsor,
      }
    : null;
}

export function useSponsorSlot(): SponsorSlotState {
  const [state, setState] = React.useState<SponsorSlotState>({
    settled: false,
    sponsor: null,
  });

  React.useEffect(() => {
    let live = true;

    void (async () => {
      let sponsor: StudioSponsor | null = null;
      try {
        const response = await fetch("/api/sponsor");
        if (response.ok) {
          const body = (await response.json()) as { sponsor?: unknown };
          sponsor = readSponsor(body.sponsor);
        }
      } catch {
        // Nobody, which is what the card shows on any day nobody has bought.
      }
      if (live) setState({ settled: true, sponsor });
    })();

    return () => {
      live = false;
    };
  }, []);

  return state;
}

/**
 * One more press, and nothing else.
 *
 * The counter is what the operator has to show a sponsor when the period is up
 * and it is time to ask about the next one. It is a total per booking with no
 * visitor in it at all: no address, no identifier, no time of day, nothing that
 * could be joined to anything. That is the most a sponsor can be told here, and
 * it is enough to answer the only question they ask.
 *
 * `keepalive` because the browser is on its way to another page as this runs,
 * and a request abandoned at navigation is a press that never counted.
 *
 * It is fired and forgotten. A press that fails to count is a smaller thing
 * than a press that waits.
 */
export function reportSponsorClick(id: string): void {
  try {
    void fetch("/api/sponsor", {
      body: JSON.stringify({ click: id }),
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      method: "POST",
    }).catch(() => undefined);
  } catch {
    // A browser that will not send it is a press that does not count.
  }
}
