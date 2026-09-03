import { describe, expect, it, vi } from "vitest";

import { handleAdminList, handleSubscribe } from "./handlers";

const password = "correct-horse-battery-staple";
const configured = {
  ADMIN_PASSWORD: password,
  UPSTASH_REDIS_REST_TOKEN: "secret-token",
  UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
};

/** A fake Redis that answers each command by name. */
function fakeRedis(replies: Partial<Record<string, unknown>> = {}) {
  const seen: string[] = [];
  const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const [name] = JSON.parse(String(init?.body)) as [string];
    seen.push(name);
    return {
      json: async () => ({ result: replies[name] ?? (name === "INCR" ? 1 : 1) }),
      ok: true,
      status: 200,
    } as unknown as Response;
  });
  return { fetchImpl: fetchImpl as unknown as typeof globalThis.fetch, seen };
}

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://studio.example/api/subscribe", {
    body: JSON.stringify(body),
    headers,
    method: "POST",
  });
}

describe("POST /api/subscribe", () => {
  it("stores a valid address", async () => {
    const { fetchImpl } = fakeRedis();
    const response = await handleSubscribe(post({ email: "Sam@Example.com", source: "export" }), configured, fetchImpl);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "added" });
  });

  it("says so loudly when nothing is configured, rather than dropping addresses", async () => {
    const { fetchImpl } = fakeRedis();
    const response = await handleSubscribe(post({ email: "a@b.com" }), {}, fetchImpl);
    expect(response.status).toBe(503);
  });

  it("refuses anything but POST", async () => {
    const { fetchImpl } = fakeRedis();
    const response = await handleSubscribe(
      new Request("https://studio.example/api/subscribe"),
      configured,
      fetchImpl,
    );
    expect(response.status).toBe(405);
  });

  it("rejects a bad address with something a person can act on", async () => {
    const { fetchImpl } = fakeRedis();
    const response = await handleSubscribe(post({ email: "not-an-address" }), configured, fetchImpl);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "That does not look like an email address.",
    });
  });

  it("refuses a body that is not a small JSON object", async () => {
    const { fetchImpl } = fakeRedis();
    for (const body of ["not json", JSON.stringify(["a@b.com"]), JSON.stringify("x")]) {
      const response = await handleSubscribe(
        new Request("https://studio.example/api/subscribe", { body, method: "POST" }),
        configured,
        fetchImpl,
      );
      expect(response.status, body).toBe(400);
    }
  });

  it("caps the body so nobody posts a payload", async () => {
    const { fetchImpl } = fakeRedis();
    const response = await handleSubscribe(
      post({ email: `${"a".repeat(4_000)}@b.com` }),
      configured,
      fetchImpl,
    );
    expect(response.status).toBe(400);
  });

  it("answers a filled honeypot with success and writes nothing", async () => {
    // Telling a bot it was caught is telling it what to change.
    const { fetchImpl, seen } = fakeRedis();
    const response = await handleSubscribe(
      post({ email: "a@b.com", website: "http://spam" }),
      configured,
      fetchImpl,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "already-known" });
    expect(seen).toEqual([]);
  });

  it("stops a caller that has signed up too many times in an hour", async () => {
    const { fetchImpl } = fakeRedis({ INCR: 21 });
    const response = await handleSubscribe(
      post({ email: "a@b.com" }, { "x-forwarded-for": "203.0.113.7, 10.0.0.1" }),
      configured,
      fetchImpl,
    );
    expect(response.status).toBe(429);
  });
});

describe("POST /api/emails", () => {
  it("returns the list and a CSV to the right password", async () => {
    const { fetchImpl } = fakeRedis({
      HGETALL: ["a@b.com", JSON.stringify({ firstSeen: "2026-01-01T00:00:00.000Z", source: "export" })],
    });
    const response = await handleAdminList(post({ password }), configured, fetchImpl);

    expect(response.status).toBe(200);
    const body = (await response.json()) as { csv: string; records: unknown[] };
    expect(body.records).toHaveLength(1);
    expect(body.csv).toContain("a@b.com");
  });

  it("refuses a wrong password, an absent one, and a non-string", async () => {
    const { fetchImpl, seen } = fakeRedis();
    for (const body of [{ password: "wrong" }, {}, { password: 42 }, { password: null }]) {
      const response = await handleAdminList(post(body), configured, fetchImpl);
      expect(response.status, JSON.stringify(body)).toBe(401);
    }
    // And never touched the store on the way to saying no.
    expect(seen).toEqual([]);
  });

  it("refuses to serve at all without a long enough password configured", async () => {
    const { fetchImpl } = fakeRedis();
    const response = await handleAdminList(
      post({ password: "short" }),
      { ...configured, ADMIN_PASSWORD: "short" },
      fetchImpl,
    );
    expect(response.status).toBe(503);
  });

  it("refuses anything but POST, so the password never lands in a URL", async () => {
    const { fetchImpl } = fakeRedis();
    const response = await handleAdminList(
      new Request("https://studio.example/api/emails"),
      configured,
      fetchImpl,
    );
    expect(response.status).toBe(405);
  });

  it("never lets a response be cached", async () => {
    const { fetchImpl } = fakeRedis({ HGETALL: [] });
    const response = await handleAdminList(post({ password }), configured, fetchImpl);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});

describe("the CSV download", () => {
  it("answers a form submission with the file itself", async () => {
    const { fetchImpl } = fakeRedis({
      HGETALL: ["a@b.com", JSON.stringify({ firstSeen: "2026-01-01T00:00:00.000Z", source: "export" })],
    });
    const response = await handleAdminList(
      new Request("https://studio.example/api/emails", {
        body: new URLSearchParams({ format: "csv", password }).toString(),
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        method: "POST",
      }),
      configured,
      fetchImpl,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/csv");
    expect(response.headers.get("Content-Disposition")).toContain("attachment");
    await expect(response.text()).resolves.toContain("a@b.com");
  });

  it("still needs the password when asked for as a form", async () => {
    const { fetchImpl } = fakeRedis();
    const response = await handleAdminList(
      new Request("https://studio.example/api/emails", {
        body: new URLSearchParams({ format: "csv", password: "wrong" }).toString(),
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        method: "POST",
      }),
      configured,
      fetchImpl,
    );
    expect(response.status).toBe(401);
  });
});
