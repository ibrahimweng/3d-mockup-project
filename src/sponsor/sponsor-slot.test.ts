import { describe, expect, it } from "vitest";

import {
  daysLeft,
  findLiveSlot,
  normalizeSlotDraft,
  slotId,
  slotStatus,
  slotsOverlap,
  toDayNumber,
  type SponsorSlot,
} from "./sponsor-slot";

function slot(overrides: Partial<SponsorSlot> = {}): SponsorSlot {
  return {
    bookedAt: "2026-08-01T00:00:00.000Z",
    endsOn: "2026-09-30",
    headline: "Hardware for makers",
    href: "https://example.com/",
    id: "acme-20260901",
    imageDigest: "abcd1234",
    imageMediaType: "image/png",
    sponsor: "Acme",
    startsOn: "2026-09-01",
    ...overrides,
  };
}

const on = (day: string) => new Date(`${day}T12:00:00.000Z`);

describe("reading a date", () => {
  it("refuses a date the calendar does not have", () => {
    // The one that matters: Date.UTC rolls this forward to 3 March rather than
    // refusing, so without the round trip it would be accepted as a real day.
    expect(toDayNumber("2026-02-31")).toBeNull();
    expect(toDayNumber("2026-13-01")).toBeNull();
    expect(toDayNumber("01/09/2026")).toBeNull();
    expect(toDayNumber("2026-9-1")).toBeNull();
  });

  it("accepts a leap day in a leap year and not in an ordinary one", () => {
    expect(toDayNumber("2028-02-29")).not.toBeNull();
    expect(toDayNumber("2026-02-29")).toBeNull();
  });
});

describe("what a booking is doing today", () => {
  it("is booked before, live between, and finished after", () => {
    const booking = slot();
    expect(slotStatus(booking, on("2026-08-31"))).toBe("scheduled");
    expect(slotStatus(booking, on("2026-09-01"))).toBe("live");
    expect(slotStatus(booking, on("2026-09-30"))).toBe("live");
    expect(slotStatus(booking, on("2026-10-01"))).toBe("ended");
  });

  it("counts today as a day left, so one day left means it goes tonight", () => {
    expect(daysLeft(slot(), on("2026-09-30"))).toBe(1);
    expect(daysLeft(slot(), on("2026-09-29"))).toBe(2);
    expect(daysLeft(slot(), on("2026-10-05"))).toBe(0);
  });

  it("stops serving a booking whose last day has passed, with nobody involved", () => {
    // The whole point of holding the dates on the record: the day after the
    // last one, nothing has to be remembered or pressed for it to come down.
    expect(findLiveSlot([slot()], on("2026-10-01"))).toBeNull();
  });
});

describe("one sponsor at a time", () => {
  it("sees an overlap at either end and when one contains the other", () => {
    const september = slot();
    expect(
      slotsOverlap(september, { endsOn: "2026-09-01", startsOn: "2026-08-01" }),
    ).toBe(true);
    expect(
      slotsOverlap(september, { endsOn: "2026-10-31", startsOn: "2026-09-30" }),
    ).toBe(true);
    expect(
      slotsOverlap(september, { endsOn: "2026-09-20", startsOn: "2026-09-10" }),
    ).toBe(true);
    expect(
      slotsOverlap(september, { endsOn: "2026-08-31", startsOn: "2026-08-01" }),
    ).toBe(false);
    expect(
      slotsOverlap(september, { endsOn: "2026-10-31", startsOn: "2026-10-01" }),
    ).toBe(false);
  });

  it("answers with the same one every time if two are somehow live at once", () => {
    // This should be impossible, because the endpoint refuses an overlapping
    // booking. It still has to be deterministic: an arbitrary answer would put
    // a different sponsor on screen per request and nobody could reproduce it.
    const older = slot({ id: "older", sponsor: "Older", startsOn: "2026-09-01" });
    const newer = slot({ id: "newer", sponsor: "Newer", startsOn: "2026-09-10" });
    expect(findLiveSlot([older, newer], on("2026-09-15"))?.id).toBe("newer");
    expect(findLiveSlot([newer, older], on("2026-09-15"))?.id).toBe("newer");
  });
});

describe("checking what the operator typed", () => {
  const good = {
    endsOn: "2026-09-30",
    headline: "Hardware for makers",
    href: "https://example.com/tools",
    sponsor: "Acme Tools",
    startsOn: "2026-09-01",
  };

  it("accepts a whole booking and keeps its own id", () => {
    const result = normalizeSlotDraft(good, new Date("2026-08-01T00:00:00Z"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.slot.id).toBe("acme-tools-20260901");
    expect(result.slot.bookedAt).toBe("2026-08-01T00:00:00.000Z");
  });

  it("refuses any link that is not plainly https", () => {
    // Both of these are legal URLs and neither is a sponsor's website. This
    // value ends up in an href on a page other people load.
    for (const href of [
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "http://example.com",
      "example.com",
      "",
    ]) {
      const result = normalizeSlotDraft({ ...good, href }, new Date());
      expect(result.ok, href).toBe(false);
    }
  });

  it("refuses dates that run backwards and periods that are typos", () => {
    expect(
      normalizeSlotDraft(
        { ...good, endsOn: "2026-08-01", startsOn: "2026-09-01" },
        new Date(),
      ).ok,
    ).toBe(false);
    expect(
      normalizeSlotDraft({ ...good, endsOn: "2126-09-01" }, new Date()).ok,
    ).toBe(false);
    expect(
      normalizeSlotDraft({ ...good, startsOn: "2026-02-31" }, new Date()).ok,
    ).toBe(false);
  });

  it("refuses an empty name and trims the rest", () => {
    expect(normalizeSlotDraft({ ...good, sponsor: "   " }, new Date()).ok).toBe(
      false,
    );

    const result = normalizeSlotDraft(
      { ...good, headline: "  spaced  ", sponsor: "  Acme Tools  " },
      new Date(),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.slot.sponsor).toBe("Acme Tools");
    expect(result.slot.headline).toBe("spaced");
  });

  it("makes an id out of a name that has nothing to slug", () => {
    expect(slotId("!!!", "2026-09-01")).toBe("sponsor-20260901");
    expect(slotId("Ölbaum & Sons", "2026-09-01")).toBe("lbaum-sons-20260901");
  });
});
