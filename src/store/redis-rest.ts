/**
 * The one connection this site has to a database, and the one place that holds
 * the credential for it.
 *
 * Upstash Redis over its REST API, reached with plain `fetch`. That is a
 * deliberate choice over a driver: it adds no dependency to a project that has
 * to keep a supply chain small, it runs on the Edge runtime where a TCP driver
 * cannot, and it is one HTTP call that can be faked in a test without a
 * database.
 *
 * Two things are stored, the email list and the sponsor bookings, and both
 * reach the store through here. Neither module holds the credential or knows
 * the shape of a REST reply; they know their own keys and nothing else.
 *
 * This module only ever runs inside a serverless function, which reads the
 * credential from the environment. Nothing here is reachable from a browser.
 */

export type RedisConfig = {
  readonly fetch: typeof globalThis.fetch;
  readonly token: string;
  readonly url: string;
};

/**
 * The two environment variables the store needs, or nothing.
 *
 * Nothing rather than a half-filled config, so every caller has one question to
 * ask — is this deployment configured — and can answer it before it has done
 * anything it would have to undo.
 */
export function readRedisConfig(
  env: Readonly<Record<string, string | undefined>>,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): RedisConfig | null {
  const url = env.UPSTASH_REDIS_REST_URL?.trim();
  const token = env.UPSTASH_REDIS_REST_TOKEN?.trim();

  return url && token ? { fetch: fetchImpl, token, url } : null;
}

export async function redisCommand(
  config: RedisConfig,
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
    throw new Error(`The store refused the request (${response.status}).`);
  }

  const payload: unknown = await response.json();
  return payload && typeof payload === "object" && "result" in payload
    ? (payload as { result: unknown }).result
    : null;
}

/**
 * A flat `HGETALL` reply as pairs.
 *
 * Redis answers a hash as one array of alternating field and value, which is
 * the shape every caller has to unpick before it can do anything. Unpicking it
 * once here means a caller that reads records never writes an index-plus-one.
 */
export function readHashPairs(reply: unknown): readonly [string, string][] {
  if (!Array.isArray(reply)) return [];

  const pairs: [string, string][] = [];
  for (let index = 0; index + 1 < reply.length; index += 2) {
    const field: unknown = reply[index];
    const value: unknown = reply[index + 1];
    if (typeof field === "string" && typeof value === "string") {
      pairs.push([field, value]);
    }
  }
  return pairs;
}

/**
 * How many times this caller has been seen inside the current window.
 *
 * A public POST endpoint with no ceiling is someone else's free write budget,
 * and this deployment's budget is a free tier with a daily command count on it.
 * `INCR` returns the new count and the expiry is set on the first one, so a
 * window starts at the first request and ends on its own with nothing to sweep.
 */
export async function countRecentCalls(
  config: RedisConfig,
  key: string,
  windowSeconds: number,
): Promise<number> {
  const count = await redisCommand(config, ["INCR", key]);
  if (count === 1) await redisCommand(config, ["EXPIRE", key, windowSeconds]);
  return typeof count === "number" ? count : 0;
}
