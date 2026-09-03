/**
 * Where the addresses live, and why it is a fetch rather than a driver.
 *
 * The store is Upstash Redis over its REST API, reached with plain `fetch`.
 * That is a deliberate choice over a Postgres driver: it adds no dependency to
 * a project that has to keep a supply chain small, it runs on the Edge runtime
 * where a TCP driver cannot, and it is one HTTP call that can be faked in a
 * test without a database.
 *
 * A hash keyed by address rather than a list, because a hash field is the
 * dedupe: the same person pressing export on two devices writes the same field
 * twice and stays one subscriber, with the first sighting kept.
 *
 * The credential never reaches a browser. This module only ever runs inside a
 * serverless function, which reads it from the environment.
 */

const emailHashKey = "mockup-studio:emails";

export type SubscriberRecord = {
  readonly email: string;
  /** ISO 8601, in UTC. When this address was first seen. */
  readonly firstSeen: string;
  /** Where the signup happened, so a later surface can be told apart. */
  readonly source: string;
};

export type EmailStoreConfig = {
  readonly fetch: typeof globalThis.fetch;
  readonly token: string;
  readonly url: string;
};

export type EmailStore = {
  readonly add: (record: SubscriberRecord) => Promise<"added" | "already-known">;
  readonly list: () => Promise<readonly SubscriberRecord[]>;
  /**
   * How many times this caller has been seen inside the current window.
   *
   * A public POST endpoint with no ceiling is someone else's free write budget.
   * `INCR` returns the new count and the expiry is set on the first one, so a
   * window starts at the first request and ends on its own.
   */
  readonly countRecentCalls: (
    caller: string,
    windowSeconds: number,
  ) => Promise<number>;
};

/**
 * The two environment variables this needs, read once and reported clearly.
 *
 * An unconfigured deployment has to fail loudly at the endpoint rather than
 * quietly dropping addresses: a signup form that accepts everything and stores
 * nothing looks exactly like one that works.
 */
export function readEmailStoreConfig(
  env: Readonly<Record<string, string | undefined>>,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): EmailStoreConfig | null {
  const url = env.UPSTASH_REDIS_REST_URL?.trim();
  const token = env.UPSTASH_REDIS_REST_TOKEN?.trim();

  return url && token ? { fetch: fetchImpl, token, url } : null;
}

async function command(
  config: EmailStoreConfig,
  args: readonly (string | number)[],
): Promise<unknown> {
  const response = await config.fetch(config.url, {
    body: JSON.stringify(args),
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  if (!response.ok) {
    // The body can carry the credential back in an error message, so only the
    // status travels onward.
    throw new Error(`Email store refused the request (${response.status}).`);
  }

  const payload: unknown = await response.json();
  return payload && typeof payload === "object" && "result" in payload
    ? (payload as { result: unknown }).result
    : null;
}

function parseRecord(email: string, raw: unknown): SubscriberRecord | null {
  if (typeof raw !== "string") return null;

  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const record = value as Partial<SubscriberRecord>;
    return {
      email,
      firstSeen: typeof record.firstSeen === "string" ? record.firstSeen : "",
      source: typeof record.source === "string" ? record.source : "",
    };
  } catch {
    return null;
  }
}

export function createEmailStore(config: EmailStoreConfig): EmailStore {
  return {
    /**
     * `HSETNX`, not `HSET`, so a second signup cannot overwrite the first
     * sighting with a later date. Redis answers 1 when the field was created
     * and 0 when it already existed, which is the whole answer.
     */
    add: async (record) => {
      const created = await command(config, [
        "HSETNX",
        emailHashKey,
        record.email,
        JSON.stringify({ firstSeen: record.firstSeen, source: record.source }),
      ]);
      return created === 1 ? "added" : "already-known";
    },
    countRecentCalls: async (caller, windowSeconds) => {
      const key = `mockup-studio:rate:${caller}`;
      const count = await command(config, ["INCR", key]);
      if (count === 1) await command(config, ["EXPIRE", key, windowSeconds]);
      return typeof count === "number" ? count : 0;
    },
    list: async () => {
      const flat = await command(config, ["HGETALL", emailHashKey]);
      if (!Array.isArray(flat)) return [];

      const records: SubscriberRecord[] = [];
      for (let index = 0; index + 1 < flat.length; index += 2) {
        const email = flat[index];
        if (typeof email !== "string") continue;
        const record = parseRecord(email, flat[index + 1]);
        if (record) records.push(record);
      }
      // Newest last is how a list of signups reads; an empty date sorts first
      // rather than throwing the order away.
      return records.sort((left, right) =>
        left.firstSeen.localeCompare(right.firstSeen),
      );
    },
  };
}
