/**
 * A booking: who is in the corner of the studio, and for which days.
 *
 * The whole product is here in one shape. Somebody buys the slot for a period,
 * their card shows while the period is running, and it stops showing when the
 * period ends. That last part is the reason the dates live on the record rather
 * than in a calendar reminder: a booking that has run out stops being served
 * because the store says so, not because anyone remembered to take it down.
 *
 * Days rather than instants. A slot is sold as "September", not as "from
 * 14:07:33 on the first", and a date with no time in it cannot be an hour wrong
 * because of whose clock it was read on. They are UTC days, which is stated in
 * the admin page rather than left to be discovered.
 *
 * The dates are `YYYY-MM-DD` and are compared as strings. That works because
 * the format is fixed-width and ordered the same way the calendar is, so the
 * comparison is the calendar comparison with no arithmetic to get wrong.
 */

/** One booking, as it is stored and as the admin page reads it back. */
export type SponsorSlot = {
  readonly id: string;
  /** Whose slot this is. Shown to nobody but the operator. */
  readonly sponsor: string;
  /** The one line under the logo. May be empty. */
  readonly headline: string;
  /** Where the card goes when it is pressed. Always `https:`. */
  readonly href: string;
  readonly imageMediaType: string;
  /** Content hash of the image, so its URL changes when the image does. */
  readonly imageDigest: string;
  /** First day the card shows, inclusive, UTC. */
  readonly startsOn: string;
  /** Last day the card shows, inclusive, UTC. */
  readonly endsOn: string;
  /** When the operator entered it. */
  readonly bookedAt: string;
  /**
   * What the operator wrote down about the money, or nothing yet.
   *
   * Free text, and private to the admin page. A transaction hash, "Bybit 7
   * Sept", whatever is enough to find the payment again. It is empty until the
   * money arrives, which is the whole reason it exists: the slot is sold by
   * putting the card up first and asking for payment after the sponsor has
   * seen it live, so the operator needs to see at a glance which live booking
   * has not been paid for yet.
   */
  readonly payment: string;
};

export type SponsorStatus = "scheduled" | "live" | "ended";

const maxPaymentLength = 120;

export type SponsorSlotRejection =
  | "dates-backwards"
  | "payment-too-long"
  | "headline-too-long"
  | "link-not-https"
  | "link-too-long"
  | "period-too-long"
  | "sponsor-empty"
  | "sponsor-too-long"
  | "start-not-a-date"
  | "end-not-a-date";

const maxSponsorLength = 40;
const maxHeadlineLength = 60;
const maxHrefLength = 300;

/**
 * A year and a day.
 *
 * Not a rule about what may be sold, a guard against a typo. `2026` typed into
 * a field expecting `2026-09-01` is caught by the format, but `2126-09-01` is a
 * date, and a hundred-year booking nobody notices is worse than a rejection.
 */
const maxPeriodDays = 366;

const datePattern = /^\d{4}-\d{2}-\d{2}$/u;

/**
 * A date as a whole number of days, or null if it is not a real one.
 *
 * The round trip is what rejects `2026-02-31`: `Date.UTC` rolls it forward to
 * the third of March rather than refusing, so the only way to know the input
 * was a real date is to format the result back and see if it says the same.
 */
export function toDayNumber(value: string): number | null {
  if (!datePattern.test(value)) return null;

  const time = Date.UTC(
    Number(value.slice(0, 4)),
    Number(value.slice(5, 7)) - 1,
    Number(value.slice(8, 10)),
  );
  if (!Number.isFinite(time)) return null;

  return new Date(time).toISOString().slice(0, 10) === value
    ? time / 86_400_000
    : null;
}

/** Today as the same kind of string the slots carry. */
export function toUtcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export function slotStatus(slot: SponsorSlot, now: Date): SponsorStatus {
  const today = toUtcDay(now);
  if (today < slot.startsOn) return "scheduled";
  return today > slot.endsOn ? "ended" : "live";
}

/**
 * How many days a booking still has, counting today.
 *
 * Counting today is what makes "1 day left" mean "it comes down tonight" rather
 * than "it came down last night". The operator reads this number to know when
 * to ask for a renewal, so it has to mean the obvious thing.
 */
export function daysLeft(slot: SponsorSlot, now: Date): number {
  const end = toDayNumber(slot.endsOn);
  const today = toDayNumber(toUtcDay(now));
  if (end === null || today === null) return 0;
  return Math.max(0, end - today + 1);
}

export type SponsorPeriod = Pick<SponsorSlot, "endsOn" | "startsOn">;

/** Whether two bookings want any of the same days. */
export function slotsOverlap(left: SponsorPeriod, right: SponsorPeriod): boolean {
  return left.startsOn <= right.endsOn && right.startsOn <= left.endsOn;
}

/**
 * The one booking that is live, out of everything on file.
 *
 * There should never be a choice to make here, because the admin endpoint
 * refuses a booking that overlaps one already on file. This still has to answer
 * with one slot if two ever are live — a clock that disagrees, a record written
 * before that rule existed — so it takes the one that started most recently.
 * An arbitrary answer would put a different sponsor on screen per request,
 * which is the version of this failure that nobody can reproduce.
 */
export function findLiveSlot(
  slots: readonly SponsorSlot[],
  now: Date,
): SponsorSlot | null {
  const live = slots.filter((slot) => slotStatus(slot, now) === "live");
  return (
    live.sort((left, right) => right.startsOn.localeCompare(left.startsOn))[0] ??
    null
  );
}

/**
 * A stable id from the two things that identify a booking.
 *
 * Not random, because a readable key is worth having in a store somebody may
 * one day read by hand. Two bookings can only collide here if they are the same
 * sponsor starting on the same day, and those two always want overlapping days,
 * so the overlap rule has already refused the second one.
 */
export function slotId(sponsor: string, startsOn: string): string {
  const slug =
    sponsor
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, "-")
      .replace(/^-+|-+$/gu, "")
      .slice(0, 24) || "sponsor";
  return `${slug}-${startsOn.replaceAll("-", "")}`;
}

export function describeSlotRejection(reason: SponsorSlotRejection): string {
  switch (reason) {
    case "dates-backwards":
      return "The last day is before the first day.";
    case "headline-too-long":
      return `Keep the line under ${maxHeadlineLength} characters.`;
    case "link-not-https":
      return "The link has to be an https:// address.";
    case "link-too-long":
      return "That link is too long.";
    case "payment-too-long":
      return "Keep the payment note short. A reference, not a story.";
    case "period-too-long":
      return "That books more than a year. Check the dates.";
    case "sponsor-empty":
      return "Give the sponsor a name.";
    case "sponsor-too-long":
      return `Keep the name under ${maxSponsorLength} characters.`;
    case "start-not-a-date":
      return "The first day is not a real date. Use YYYY-MM-DD.";
    case "end-not-a-date":
      return "The last day is not a real date. Use YYYY-MM-DD.";
  }
}

export type SponsorSlotDraft = {
  readonly endsOn: unknown;
  readonly headline: unknown;
  readonly href: unknown;
  readonly payment: unknown;
  readonly sponsor: unknown;
  readonly startsOn: unknown;
};

export type SponsorSlotNormalization =
  | {
      readonly ok: true;
      readonly slot: Omit<SponsorSlot, "imageDigest" | "imageMediaType">;
    }
  | { readonly ok: false; readonly reason: SponsorSlotRejection };

function readText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Everything the operator typed, checked before any of it is stored.
 *
 * The link check is the one that matters. This value ends up in an `href` on a
 * page other people load, so anything that is not plainly `https:` is refused
 * rather than cleaned up: `javascript:` and `data:` are both legal URLs and
 * neither is a sponsor's website.
 */
export function normalizeSlotDraft(
  draft: SponsorSlotDraft,
  bookedAt: Date,
): SponsorSlotNormalization {
  const sponsor = readText(draft.sponsor);
  if (sponsor === "") return { ok: false, reason: "sponsor-empty" };
  if (sponsor.length > maxSponsorLength) {
    return { ok: false, reason: "sponsor-too-long" };
  }

  const headline = readText(draft.headline);
  if (headline.length > maxHeadlineLength) {
    return { ok: false, reason: "headline-too-long" };
  }

  const payment = readText(draft.payment);
  if (payment.length > maxPaymentLength) {
    return { ok: false, reason: "payment-too-long" };
  }

  const href = readText(draft.href);
  if (href.length > maxHrefLength) return { ok: false, reason: "link-too-long" };
  let parsed: URL;
  try {
    parsed = new URL(href);
  } catch {
    return { ok: false, reason: "link-not-https" };
  }
  if (parsed.protocol !== "https:") {
    return { ok: false, reason: "link-not-https" };
  }

  const startsOn = readText(draft.startsOn);
  const endsOn = readText(draft.endsOn);
  const start = toDayNumber(startsOn);
  if (start === null) return { ok: false, reason: "start-not-a-date" };
  const end = toDayNumber(endsOn);
  if (end === null) return { ok: false, reason: "end-not-a-date" };
  if (end < start) return { ok: false, reason: "dates-backwards" };
  if (end - start + 1 > maxPeriodDays) {
    return { ok: false, reason: "period-too-long" };
  }

  return {
    ok: true,
    slot: {
      bookedAt: bookedAt.toISOString(),
      endsOn,
      headline,
      href: parsed.toString(),
      id: slotId(sponsor, startsOn),
      payment,
      sponsor,
      startsOn,
    },
  };
}
