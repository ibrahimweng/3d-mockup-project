import * as React from "react";

import { Button, Input, Label } from "@/toolcraft/ui/components/primitives";
import type { AdminSponsorSlot } from "@/sponsor/handlers";

import { SponsorImageDrop } from "./sponsor-image-drop";

/**
 * Selling the corner of the studio, and knowing when somebody's time is up.
 *
 * One sponsor holds the slot at a time. A booking is a name, a logo, a link, a
 * line, and two dates, and the two dates are the product: the card appears on
 * the first day and stops on the day after the last one, because the server
 * decides from the dates on every request rather than from anybody remembering
 * to take it down.
 *
 * So this page is a calendar more than a form. It says what is on now and for
 * how many more days, what is booked next, and what is over, which are the
 * three things an operator with a slot to sell needs to see at once.
 *
 * The password is not stored anywhere. It is held in the page above this one
 * while the tab is open, sent with every request, and gone when the tab closes.
 */

const numberFormat = new Intl.NumberFormat("en-GB");

function addDays(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const emptyDraft = {
  endsOn: addDays(30),
  headline: "",
  href: "",
  image: "",
  sponsor: "",
  startsOn: addDays(0),
};

type Draft = typeof emptyDraft;

function StatusBadge({ slot }: { slot: AdminSponsorSlot }): React.JSX.Element {
  const text =
    slot.status === "live"
      ? `Live · ${slot.daysLeft} ${slot.daysLeft === 1 ? "day" : "days"} left`
      : slot.status === "scheduled"
        ? "Booked"
        : "Finished";
  return (
    <span
      className={
        slot.status === "live"
          ? "rounded-full border border-[color:var(--ring)] px-2 py-0.5 text-[11px] font-medium"
          : "rounded-full border border-[color:var(--border)] px-2 py-0.5 text-[11px] text-[color:color-mix(in_oklab,var(--foreground)_55%,transparent)]"
      }
    >
      {text}
    </span>
  );
}

/**
 * A labelled field.
 *
 * The child is a function of the id rather than an element, so the label's
 * `htmlFor` and the input's `id` are the same string without either one being
 * written twice or guessed. A label that is only near its input is a label a
 * screen reader does not read out with it.
 */
function Field({
  children,
  hint,
  label,
}: {
  children: (id: string) => React.ReactNode;
  hint?: string;
  label: string;
}): React.JSX.Element {
  const id = React.useId();
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children(id)}
      {hint === undefined ? null : (
        <p className="text-[11px] text-[color:color-mix(in_oklab,var(--foreground)_55%,transparent)]">
          {hint}
        </p>
      )}
    </div>
  );
}

export function SponsorBookings({
  password,
}: {
  password: string;
}): React.JSX.Element {
  const [slots, setSlots] = React.useState<readonly AdminSponsorSlot[] | null>(
    null,
  );
  const [draft, setDraft] = React.useState<Draft>(emptyDraft);
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [confirming, setConfirming] = React.useState("");

  const set = React.useCallback(
    <Key extends keyof Draft>(key: Key, value: Draft[Key]) =>
      setDraft((current) => ({ ...current, [key]: value })),
    [],
  );

  /**
   * Every request this page makes, in one place.
   *
   * All three actions answer with the whole list, so the page never has to
   * work out what changed: it is handed the state of the world after the
   * change and shows that. There is nothing to keep in step and nothing to
   * reload by hand.
   */
  const send = React.useCallback(
    async (body: Record<string, unknown>): Promise<boolean> => {
      setBusy(true);
      setError("");
      try {
        const response = await fetch("/api/sponsors", {
          body: JSON.stringify({ ...body, password }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        });
        const payload = (await response.json()) as {
          error?: string;
          slots?: readonly AdminSponsorSlot[];
        };
        if (!response.ok) {
          setError(payload.error ?? "That did not work.");
          return false;
        }
        setSlots(payload.slots ?? []);
        return true;
      } catch {
        setError("Could not reach the server.");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [password],
  );

  React.useEffect(() => {
    void send({ action: "list" });
  }, [send]);

  const save = React.useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (await send({ ...draft, action: "save" })) setDraft(emptyDraft);
    },
    [draft, send],
  );

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h2 className="text-lg font-medium">The sponsor slot</h2>
        <p className="text-sm text-[color:color-mix(in_oklab,var(--foreground)_60%,transparent)]">
          One card in the corner of the studio, one sponsor at a time. Dates are
          whole days in UTC, and both ends are included.
        </p>
      </header>

      {error === "" ? null : (
        <p className="text-sm text-[color:var(--destructive)]" role="alert">
          {error}
        </p>
      )}

      {slots === null ? (
        <p className="text-sm text-[color:color-mix(in_oklab,var(--foreground)_60%,transparent)]">
          Reading the bookings…
        </p>
      ) : slots.length === 0 ? (
        <p className="text-sm text-[color:color-mix(in_oklab,var(--foreground)_60%,transparent)]">
          Nothing is booked. The studio is showing the for-sale card.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-[color:var(--border)] rounded-lg border">
          {slots.map((slot) => (
            <li className="flex flex-col gap-2 p-3" key={slot.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium">{slot.sponsor}</span>
                <StatusBadge slot={slot} />
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[color:color-mix(in_oklab,var(--foreground)_60%,transparent)]">
                <span>
                  {slot.startsOn} to {slot.endsOn}
                </span>
                <span>{numberFormat.format(slot.clicks)} presses</span>
                <span className="truncate">{slot.href}</span>
              </div>
              <div className="flex items-center gap-2">
                {confirming === slot.id ? (
                  <>
                    <Button
                      disabled={busy}
                      onClick={() => {
                        setConfirming("");
                        void send({ action: "remove", id: slot.id });
                      }}
                      size="sm"
                      type="button"
                      variant="destructive"
                    >
                      Take it down
                    </Button>
                    <Button
                      onClick={() => setConfirming("")}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      Keep it
                    </Button>
                  </>
                ) : (
                  <Button
                    disabled={busy}
                    onClick={() => setConfirming(slot.id)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Remove
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <form className="flex flex-col gap-4 rounded-lg border p-4" onSubmit={save}>
        <h3 className="text-sm font-medium">Book the slot</h3>

        <Field label="Sponsor">
          {(id) => (
            <Input
              id={id}
              onChange={(event) => set("sponsor", event.target.value)}
              placeholder="Acme Tools"
              required
              value={draft.sponsor}
            />
          )}
        </Field>

        <Field
          hint="Where the card goes when somebody presses it. Has to be https."
          label="Link"
        >
          {(id) => (
            <Input
              id={id}
              onChange={(event) => set("href", event.target.value)}
              placeholder="https://example.com"
              required
              type="url"
              value={draft.href}
            />
          )}
        </Field>

        <Field hint="Optional. One short line under the logo." label="Line">
          {(id) => (
            <Input
              id={id}
              onChange={(event) => set("headline", event.target.value)}
              placeholder="Hardware for makers"
              value={draft.headline}
            />
          )}
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="First day">
            {(id) => (
              <Input
                id={id}
                onChange={(event) => set("startsOn", event.target.value)}
                required
                type="date"
                value={draft.startsOn}
              />
            )}
          </Field>
          <Field label="Last day">
            {(id) => (
              <Input
                id={id}
                onChange={(event) => set("endsOn", event.target.value)}
                required
                type="date"
                value={draft.endsOn}
              />
            )}
          </Field>
        </div>

        {/* Not a Field: the drop box is not a form control, so a label
            pointing at it with htmlFor would point at nothing. It names
            itself instead, in the aria-label the box carries. */}
        <div className="flex flex-col gap-1.5">
          <Label>Logo</Label>
          <SponsorImageDrop
            dataUrl={draft.image}
            onChange={(value) => set("image", value)}
            onProblem={setError}
          />
        </div>

        <div className="flex items-center gap-3">
          <Button disabled={busy || draft.image === ""} type="submit">
            {busy ? "Saving…" : "Book it"}
          </Button>
          <p className="text-[11px] text-[color:color-mix(in_oklab,var(--foreground)_55%,transparent)]">
            Booking the same sponsor with the same first day replaces that
            booking, which is how a logo or a link gets corrected.
          </p>
        </div>
      </form>
    </section>
  );
}
