import { describe, expect, it, vi } from "vitest";

import { handleSponsorAdmin, handleSponsorSlot } from "./handlers";

const password = "correct-horse-battery-staple";
const configured = {
  ADMIN_PASSWORD: password,
  UPSTASH_REDIS_REST_TOKEN: "secret-token",
  UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
};

const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02];
const logo = `data:image/png;base64,${btoa(String.fromCharCode(...png))}`;

const booking = {
  endsOn: "2026-09-30",
  headline: "Hardware for makers",
  href: "https://example.com/tools",
  image: logo,
  sponsor: "Acme Tools",
  startsOn: "2026-09-01",
};

function record(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    bookedAt: "2026-08-01T00:00:00.000Z",
    endsOn: "2026-09-30",
    headline: "Hardware for makers",
    href: "https://example.com/tools",
    imageDigest: "abcd1234",
    imageMediaType: "image/png",
    payment: "",
    sponsor: "Acme Tools",
    startsOn: "2026-09-01",
    ...overrides,
  });
}

/** A fake Redis that answers each command by name and remembers every call. */
function fakeRedis(replies: Partial<Record<string, unknown>> = {}) {
  const seen: unknown[][] = [];
  const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const args = JSON.parse(String(init?.body)) as unknown[];
    seen.push(args);
    const name = String(args[0]);
    return {
      json: async () => ({
        result: name in replies ? replies[name] : name === "INCR" ? 1 : null,
      }),
      ok: true,
      status: 200,
    } as unknown as Response;
  });
  return { fetchImpl: fetchImpl as unknown as typeof globalThis.fetch, seen };
}

const get = (url = "https://studio.example/api/sponsor") => new Request(url);

function post(url: string, body: unknown): Request {
  return new Request(url, {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
}

const admin = (body: Record<string, unknown>) =>
  post("https://studio.example/api/sponsors", { password, ...body });

describe("GET /api/sponsor", () => {
  it("answers with whoever is live today", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-15T09:00:00Z"));
    const { fetchImpl } = fakeRedis({ HGETALL: ["acme-tools-20260901", record()] });

    const response = await handleSponsorSlot(get(), configured, fetchImpl);
    const body = (await response.json()) as { sponsor: Record<string, string> };

    expect(response.status).toBe(200);
    expect(body.sponsor.sponsor).toBe("Acme Tools");
    // The digest is in the address, which is what lets the bytes be cached
    // hard: a replaced logo is never the same URL as the one it replaced.
    expect(body.sponsor.imageUrl).toBe(
      "/api/sponsor?image=acme-tools-20260901&v=abcd1234",
    );
    vi.useRealTimers();
  });

  it("answers with nobody once the last day is past, with nobody involved", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T00:05:00Z"));
    const { fetchImpl } = fakeRedis({ HGETALL: ["acme-tools-20260901", record()] });

    const response = await handleSponsorSlot(get(), configured, fetchImpl);
    await expect(response.json()).resolves.toEqual({ sponsor: null });
    vi.useRealTimers();
  });

  it("answers with nobody rather than an error when nothing is configured", async () => {
    // The opposite of /api/subscribe, deliberately. An empty slot is a state
    // the studio has to render correctly anyway, so failing into it costs
    // nothing. The operator hears about it from the admin endpoint instead.
    const { fetchImpl } = fakeRedis();
    const response = await handleSponsorSlot(get(), {}, fetchImpl);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ sponsor: null });
  });

  it("lets a shared cache hold the answer for a minute", async () => {
    const { fetchImpl } = fakeRedis({ HGETALL: null });
    const response = await handleSponsorSlot(get(), configured, fetchImpl);
    expect(response.headers.get("Cache-Control")).toContain("s-maxage=60");
  });

  it("serves the logo from our own origin, typed and not sniffable", async () => {
    const { fetchImpl } = fakeRedis({
      GET: JSON.stringify({
        base64: btoa(String.fromCharCode(...png)),
        mediaType: "image/png",
      }),
    });

    const response = await handleSponsorSlot(
      get("https://studio.example/api/sponsor?image=acme-tools-20260901"),
      configured,
      fetchImpl,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual(png);
  });

  it("answers the calendar with dates and nothing else", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-15T09:00:00Z"));
    const { fetchImpl } = fakeRedis({
      HGETALL: [
        "acme-tools-20260901",
        record(),
        "next-20261101",
        record({ endsOn: "2026-11-30", sponsor: "Northwind", startsOn: "2026-11-01" }),
      ],
    });

    const response = await handleSponsorSlot(
      get("https://studio.example/api/sponsor?calendar"),
      configured,
      fetchImpl,
    );
    const body = (await response.json()) as { taken: unknown[] };

    // A buyer needs to know what is sold. Nobody needs to know who bought it,
    // least of all about a booking that has not started yet.
    expect(body.taken).toEqual([
      { endsOn: "2026-09-30", startsOn: "2026-09-01" },
      { endsOn: "2026-11-30", startsOn: "2026-11-01" },
    ]);
    expect(JSON.stringify(body)).not.toContain("Northwind");
    vi.useRealTimers();
  });

  it("leaves finished bookings out of the calendar", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-12-01T09:00:00Z"));
    const { fetchImpl } = fakeRedis({ HGETALL: ["acme-tools-20260901", record()] });

    const response = await handleSponsorSlot(
      get("https://studio.example/api/sponsor?calendar"),
      configured,
      fetchImpl,
    );
    await expect(response.json()).resolves.toEqual({ taken: [] });
    vi.useRealTimers();
  });

  it("answers the calendar with nothing taken when unconfigured", async () => {
    const { fetchImpl } = fakeRedis();
    const response = await handleSponsorSlot(
      get("https://studio.example/api/sponsor?calendar"),
      {},
      fetchImpl,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ taken: [] });
  });

  it("answers 404 for a logo that is not there", async () => {
    const { fetchImpl } = fakeRedis({ GET: null });
    const response = await handleSponsorSlot(
      get("https://studio.example/api/sponsor?image=gone"),
      configured,
      fetchImpl,
    );
    expect(response.status).toBe(404);
  });
});

describe("counting a press", () => {
  it("increments one total and stores nothing about the visitor", async () => {
    const { fetchImpl, seen } = fakeRedis();
    const response = await handleSponsorSlot(
      post("https://studio.example/api/sponsor", { click: "acme-tools-20260901" }),
      configured,
      fetchImpl,
    );

    expect(response.status).toBe(204);
    expect(seen).toContainEqual([
      "HINCRBY",
      "mockup-studio:sponsor-clicks",
      "acme-tools-20260901",
      1,
    ]);
  });

  it("stops counting once one caller has pressed it too many times", async () => {
    const { fetchImpl, seen } = fakeRedis({ INCR: 500 });
    await handleSponsorSlot(
      post("https://studio.example/api/sponsor", { click: "acme-tools-20260901" }),
      configured,
      fetchImpl,
    );
    expect(seen.some((call) => call[0] === "HINCRBY")).toBe(false);
  });

  it("says nothing either way, whatever it was sent", async () => {
    const { fetchImpl } = fakeRedis();
    for (const body of [{}, { click: "" }, { click: "x".repeat(200) }]) {
      const response = await handleSponsorSlot(
        post("https://studio.example/api/sponsor", body),
        configured,
        fetchImpl,
      );
      expect(response.status).toBe(204);
    }
  });
});

describe("POST /api/sponsors", () => {
  it("refuses anything but POST, and a wrong password", async () => {
    const { fetchImpl } = fakeRedis();
    expect(
      (await handleSponsorAdmin(get(), configured, fetchImpl)).status,
    ).toBe(405);
    expect(
      (
        await handleSponsorAdmin(
          post("https://studio.example/api/sponsors", { action: "list", password: "no" }),
          configured,
          fetchImpl,
        )
      ).status,
    ).toBe(401);
  });

  it("says so out loud when nothing is configured", async () => {
    // Loudly here, because this is where the operator finds out that a booking
    // they entered was never going to be stored.
    const { fetchImpl } = fakeRedis();
    const response = await handleSponsorAdmin(admin({ action: "list" }), {}, fetchImpl);
    expect(response.status).toBe(503);
  });

  it("stores a booking and answers with the whole list", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-15T09:00:00Z"));
    const { fetchImpl, seen } = fakeRedis({
      HGETALL: ["acme-tools-20260901", record()],
    });

    const response = await handleSponsorAdmin(
      admin({ action: "save", ...booking }),
      configured,
      fetchImpl,
    );
    const body = (await response.json()) as {
      slots: { daysLeft: number; id: string; status: string }[];
    };

    expect(response.status).toBe(200);
    expect(seen.some((call) => call[0] === "SET")).toBe(true);
    expect(body.slots[0]?.id).toBe("acme-tools-20260901");
    expect(body.slots[0]?.status).toBe("live");
    expect(body.slots[0]?.daysLeft).toBe(16);
    vi.useRealTimers();
  });

  it("refuses a booking over days already sold, and names the clash", async () => {
    const { fetchImpl } = fakeRedis({
      HGETALL: ["acme-tools-20260901", record()],
    });

    const response = await handleSponsorAdmin(
      admin({
        action: "save",
        ...booking,
        endsOn: "2026-09-20",
        sponsor: "Someone Else",
        startsOn: "2026-09-15",
      }),
      configured,
      fetchImpl,
    );

    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain("Acme Tools");
  });

  it("lets the same booking be saved again, which is how a logo is corrected", async () => {
    const { fetchImpl } = fakeRedis({
      HGETALL: ["acme-tools-20260901", record()],
    });
    const response = await handleSponsorAdmin(
      admin({ action: "save", ...booking, headline: "New line" }),
      configured,
      fetchImpl,
    );
    expect(response.status).toBe(200);
  });

  it("refuses a booking with a link that is not https", async () => {
    const { fetchImpl } = fakeRedis({ HGETALL: null });
    const response = await handleSponsorAdmin(
      admin({ action: "save", ...booking, href: "javascript:alert(1)" }),
      configured,
      fetchImpl,
    );
    expect(response.status).toBe(400);
  });

  it("refuses a booking with no logo on it", async () => {
    const { fetchImpl } = fakeRedis({ HGETALL: null });
    const response = await handleSponsorAdmin(
      admin({ action: "save", ...booking, image: "" }),
      configured,
      fetchImpl,
    );
    expect(response.status).toBe(400);
  });

  it("takes a booking down and answers with what is left", async () => {
    const { fetchImpl, seen } = fakeRedis({ HGETALL: null });
    const response = await handleSponsorAdmin(
      admin({ action: "remove", id: "acme-tools-20260901" }),
      configured,
      fetchImpl,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ slots: [] });
    expect(seen.some((call) => call[0] === "DEL")).toBe(true);
  });

  it("keeps the payment note the operator wrote against the booking", async () => {
    const { fetchImpl, seen } = fakeRedis({ HGETALL: null });
    await handleSponsorAdmin(
      admin({ action: "save", ...booking, payment: "  Bybit 7 Sept  " }),
      configured,
      fetchImpl,
    );

    const written = seen.find((call) => call[0] === "HSET");
    expect(String(written?.[3])).toContain('"payment":"Bybit 7 Sept"');
  });

  it("refuses an action it does not have", async () => {
    const { fetchImpl } = fakeRedis();
    const response = await handleSponsorAdmin(
      admin({ action: "drop-everything" }),
      configured,
      fetchImpl,
    );
    expect(response.status).toBe(400);
  });
});
