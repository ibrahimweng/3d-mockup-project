import { describe, expect, it, vi } from "vitest";

import { createSponsorStore } from "./sponsor-store";
import type { RedisConfig } from "../store/redis-rest";
import type { SponsorSlot } from "./sponsor-slot";

function stored(overrides: Partial<SponsorSlot> = {}) {
  return JSON.stringify({
    bookedAt: "2026-08-01T00:00:00.000Z",
    endsOn: "2026-09-30",
    headline: "Hardware for makers",
    href: "https://example.com/",
    imageDigest: "abcd1234",
    imageMediaType: "image/png",
    sponsor: "Acme",
    startsOn: "2026-09-01",
    ...overrides,
  });
}

/** A fake Redis that answers each command by name and remembers every call. */
function fakeStore(replies: Partial<Record<string, unknown>> = {}) {
  const calls: unknown[][] = [];
  const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const args = JSON.parse(String(init?.body)) as unknown[];
    calls.push(args);
    return {
      json: async () => ({ result: replies[String(args[0])] ?? null }),
      ok: true,
      status: 200,
    } as unknown as Response;
  });
  const config: RedisConfig = {
    fetch: fetchImpl as unknown as typeof globalThis.fetch,
    token: "secret-token",
    url: "https://example.upstash.io",
  };
  return { calls, store: createSponsorStore(config) };
}

describe("the sponsor store", () => {
  it("reads the bookings back in the order they run", async () => {
    const { store } = fakeStore({
      HGETALL: [
        "later",
        stored({ endsOn: "2026-11-30", startsOn: "2026-11-01" }),
        "earlier",
        stored(),
      ],
    });

    const slots = await store.listSlots();
    expect(slots.map((slot) => slot.id)).toEqual(["earlier", "later"]);
  });

  it("survives a booking it cannot read rather than losing the whole list", async () => {
    const { store } = fakeStore({
      HGETALL: ["broken", "{not json", "good", stored()],
    });
    expect((await store.listSlots()).map((slot) => slot.id)).toEqual(["good"]);
  });

  it("reports nothing booked when the hash does not exist yet", async () => {
    const { store } = fakeStore({ HGETALL: null });
    await expect(store.listSlots()).resolves.toEqual([]);
  });

  it("writes the image before the record that names it", async () => {
    // The order that fails safely. A record naming an image that is not there
    // is a card with a hole in it; an image nothing names is dead bytes.
    const { calls, store } = fakeStore();
    await store.saveSlot(
      {
        bookedAt: "2026-08-01T00:00:00.000Z",
        endsOn: "2026-09-30",
        headline: "",
        href: "https://example.com/",
        id: "acme-20260901",
        imageDigest: "abcd1234",
        imageMediaType: "image/png",
        sponsor: "Acme",
        startsOn: "2026-09-01",
      },
      "AAAA",
    );

    expect(calls.map((call) => call[0])).toEqual(["SET", "HSET"]);
    expect(calls[0]?.[1]).toBe("mockup-studio:sponsor-image:acme-20260901");
  });

  it("takes the record, the image and the count down together", async () => {
    const { calls, store } = fakeStore();
    await store.removeSlot("acme-20260901");
    expect(calls.map((call) => call[0])).toEqual(["HDEL", "DEL", "HDEL"]);
  });

  it("counts a press without recording anything about who made it", async () => {
    const { calls, store } = fakeStore();
    await store.countClick("acme-20260901");

    // The whole write, and there is no visitor anywhere in it.
    expect(calls).toEqual([
      ["HINCRBY", "mockup-studio:sponsor-clicks", "acme-20260901", 1],
    ]);
  });

  it("reads the counts back as numbers and drops anything else", async () => {
    const { store } = fakeStore({ HGETALL: ["acme", "12", "broken", "many"] });
    await expect(store.listClicks()).resolves.toEqual({ acme: 12 });
  });

  it("sends the credential as a bearer token and never in the URL", async () => {
    const calls: [unknown, RequestInit | undefined][] = [];
    const fetchImpl = vi.fn(async (url: unknown, init?: RequestInit) => {
      calls.push([url, init]);
      return {
        json: async () => ({ result: null }),
        ok: true,
        status: 200,
      } as unknown as Response;
    });
    const store = createSponsorStore({
      fetch: fetchImpl as unknown as typeof globalThis.fetch,
      token: "secret-token",
      url: "https://example.upstash.io",
    });

    await store.listSlots();
    const [url, init] = calls[0] ?? [];
    expect(url).toBe("https://example.upstash.io");
    expect(String(url)).not.toContain("secret-token");
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      "Bearer secret-token",
    );
  });
});
