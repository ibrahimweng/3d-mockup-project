import {
  countRecentCalls,
  readHashPairs,
  readRedisConfig,
  redisCommand,
  type RedisConfig,
} from "../store/redis-rest";

/**
 * Where the addresses live.
 *
 * A hash keyed by address rather than a list, because a hash field is the
 * dedupe: the same person pressing export on two devices writes the same field
 * twice and stays one subscriber, with the first sighting kept.
 *
 * The connection itself is in `src/store/redis-rest.ts`, which is also what the
 * sponsor bookings use. One place holds the credential and knows the shape of a
 * REST reply; this module knows its own key and nothing else.
 */

const emailHashKey = "mockup-studio:emails";

export type SubscriberRecord = {
  readonly email: string;
  /** ISO 8601, in UTC. When this address was first seen. */
  readonly firstSeen: string;
  /** Where the signup happened, so a later surface can be told apart. */
  readonly source: string;
};

export type EmailStoreConfig = RedisConfig;

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
  return readRedisConfig(env, fetchImpl);
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
      const created = await redisCommand(config, [
        "HSETNX",
        emailHashKey,
        record.email,
        JSON.stringify({ firstSeen: record.firstSeen, source: record.source }),
      ]);
      return created === 1 ? "added" : "already-known";
    },
    countRecentCalls: async (caller, windowSeconds) =>
      countRecentCalls(config, `mockup-studio:rate:${caller}`, windowSeconds),
    list: async () => {
      const pairs = readHashPairs(
        await redisCommand(config, ["HGETALL", emailHashKey]),
      );

      const records: SubscriberRecord[] = [];
      for (const [email, raw] of pairs) {
        const record = parseRecord(email, raw);
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
