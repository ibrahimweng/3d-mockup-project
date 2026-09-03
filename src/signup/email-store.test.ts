import { describe, expect, it, vi } from "vitest";

import {
  createEmailStore,
  readEmailStoreConfig,
  type EmailStoreConfig,
} from "./email-store";

function fakeStore(reply: unknown, ok = true) {
  const calls: unknown[][] = [];
  const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
    calls.push(JSON.parse(String(init?.body)) as unknown[]);
    return {
      json: async () => ({ result: reply }),
      ok,
      status: ok ? 200 : 401,
    } as unknown as Response;
  });
  const config: EmailStoreConfig = {
    fetch: fetchImpl as unknown as typeof globalThis.fetch,
    token: "secret-token",
    url: "https://example.upstash.io",
  };
  return { calls, config, fetchImpl, store: createEmailStore(config) };
}

describe("readEmailStoreConfig", () => {
  it("needs both halves of the credential", () => {
    expect(readEmailStoreConfig({})).toBeNull();
    expect(readEmailStoreConfig({ UPSTASH_REDIS_REST_URL: "https://x" })).toBeNull();
    expect(readEmailStoreConfig({ UPSTASH_REDIS_REST_TOKEN: "t" })).toBeNull();
    // Whitespace-only is unset with extra steps, and is exactly what a
    // half-filled dashboard field leaves behind.
    expect(
      readEmailStoreConfig({
        UPSTASH_REDIS_REST_TOKEN: "  ",
        UPSTASH_REDIS_REST_URL: "https://x",
      }),
    ).toBeNull();
  });

  it("reads a configured environment", () => {
    const config = readEmailStoreConfig({
      UPSTASH_REDIS_REST_TOKEN: " t ",
      UPSTASH_REDIS_REST_URL: " https://x ",
    });
    expect(config?.token).toBe("t");
    expect(config?.url).toBe("https://x");
  });
});

describe("the email store", () => {
  it("sends the credential as a bearer token and never in the URL", async () => {
    const { fetchImpl, store } = fakeStore(1);
    await store.add({ email: "a@b.com", firstSeen: "2026-01-01T00:00:00.000Z", source: "export" });

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://example.upstash.io");
    expect(String(url)).not.toContain("secret-token");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer secret-token",
    );
  });

  it("adds a new address and reports a repeat as already known", async () => {
    const added = fakeStore(1);
    await expect(
      added.store.add({ email: "a@b.com", firstSeen: "2026-01-01T00:00:00.000Z", source: "export" }),
    ).resolves.toBe("added");
    // HSETNX, so a repeat cannot overwrite the first sighting with a later one.
    expect(added.calls[0]?.[0]).toBe("HSETNX");

    const repeat = fakeStore(0);
    await expect(
      repeat.store.add({ email: "a@b.com", firstSeen: "2026-06-01T00:00:00.000Z", source: "export" }),
    ).resolves.toBe("already-known");
  });

  it("reads the flat hash back as records, oldest first", async () => {
    const { store } = fakeStore([
      "later@b.com",
      JSON.stringify({ firstSeen: "2026-06-01T00:00:00.000Z", source: "export" }),
      "earlier@b.com",
      JSON.stringify({ firstSeen: "2026-01-01T00:00:00.000Z", source: "export" }),
    ]);

    await expect(store.list()).resolves.toEqual([
      { email: "earlier@b.com", firstSeen: "2026-01-01T00:00:00.000Z", source: "export" },
      { email: "later@b.com", firstSeen: "2026-06-01T00:00:00.000Z", source: "export" },
    ]);
  });

  it("survives a row it cannot read rather than losing the whole list", async () => {
    const { store } = fakeStore([
      "broken@b.com",
      "{not json",
      "good@b.com",
      JSON.stringify({ firstSeen: "2026-01-01T00:00:00.000Z", source: "export" }),
    ]);
    await expect(store.list()).resolves.toEqual([
      { email: "good@b.com", firstSeen: "2026-01-01T00:00:00.000Z", source: "export" },
    ]);
  });

  it("reports an empty list when the hash does not exist yet", async () => {
    const { store } = fakeStore(null);
    await expect(store.list()).resolves.toEqual([]);
  });

  it("throws with the status alone, never the body, when refused", async () => {
    const { store } = fakeStore(null, false);
    await expect(store.list()).rejects.toThrow(/refused the request \(401\)/u);
    await expect(store.list()).rejects.not.toThrow(/secret-token/u);
  });
});
