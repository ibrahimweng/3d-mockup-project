import { matchesAdminPassword, readAdminPassword } from "../signup/admin-access";
import {
  countRecentCalls,
  readRedisConfig,
  type RedisConfig,
} from "../store/redis-rest";
import { createSponsorStore, type SponsorStore } from "./sponsor-store";
import {
  decodeBase64,
  describeImageRejection,
  readSponsorImage,
} from "./sponsor-image";
import {
  daysLeft,
  describeSlotRejection,
  findLiveSlot,
  normalizeSlotDraft,
  slotStatus,
  slotsOverlap,
  type SponsorSlot,
} from "./sponsor-slot";

/**
 * The two endpoints behind the sponsor slot, as functions of a request.
 *
 * They take a `Request` and return a `Response`, so the files under `api/` are
 * one line each and everything worth testing is here, where `vitest run src`
 * reaches it and nothing under `api/` is.
 *
 * The public one is the only new thing the studio itself talks to. It answers
 * three questions and no others: who is in the slot, what does their logo look
 * like, and one more press happened. It reads no cookie, sets none, and is
 * given nothing to identify anybody with.
 */

/** Room for a 200 KB logo as base64, and not much more. */
const maxAdminBodyBytes = 400_000;
const maxPublicBodyBytes = 512;

/** Long enough for any slug and date, short enough to be a real bound. */
const maxSlotIdLength = 80;

const clickWindowSeconds = 60 * 60;
const maxClicksPerCallerPerWindow = 60;

/**
 * A minute.
 *
 * Long enough that the store is read about 1,400 times a day however busy the
 * studio gets, which is what keeps this inside a free tier's daily command
 * count. Short enough that a booking the operator has just entered appears
 * while they are still looking at the page, and that one whose last day ended
 * at midnight is gone a minute later rather than at the next deploy.
 */
const slotCacheSeconds = 60;

type Env = Readonly<Record<string, string | undefined>>;

function json(body: unknown, status: number, cacheControl = "no-store"): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      "Cache-Control": cacheControl,
      "Content-Type": "application/json",
    },
    status,
  });
}

async function readJsonBody(
  request: Request,
  maxBytes: number,
): Promise<Record<string, unknown> | null> {
  const text = await request.text();
  if (text.length > maxBytes) return null;

  try {
    const value: unknown = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function configFor(env: Env, fetchImpl: typeof globalThis.fetch): RedisConfig | null {
  return readRedisConfig(env, fetchImpl);
}

function storeFor(config: RedisConfig | null): SponsorStore | null {
  return config ? createSponsorStore(config) : null;
}

function callerKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for") ?? "";
  return forwarded.split(",")[0]?.trim() || "unknown";
}

/** What the studio is told about whoever is in the slot. */
export type PublicSponsor = {
  readonly headline: string;
  readonly href: string;
  readonly id: string;
  readonly imageUrl: string;
  readonly sponsor: string;
};

function toPublicSponsor(slot: SponsorSlot): PublicSponsor {
  return {
    headline: slot.headline,
    href: slot.href,
    id: slot.id,
    // The digest is in the URL so a replaced logo is a different address, which
    // is what lets the bytes themselves be cached hard and for a long time.
    imageUrl: `/api/sponsor?image=${encodeURIComponent(slot.id)}&v=${slot.imageDigest}`,
    sponsor: slot.sponsor,
  };
}

/**
 * The public endpoint: who is in the slot, their logo, and a press.
 *
 * An unconfigured deployment answers "nobody", not an error. This is the
 * opposite of what `/api/subscribe` does, and deliberately: a signup form that
 * silently stores nothing loses something that cannot be got back, while an
 * empty sponsor slot is a thing the studio has to render correctly anyway,
 * because it is what it shows on every day nobody has bought. Failing quietly
 * here fails into a state that already exists. The operator finds out from the
 * admin page, which does say so out loud.
 */
export async function handleSponsorSlot(
  request: Request,
  env: Env,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<Response> {
  const config = configFor(env, fetchImpl);
  const store = storeFor(config);

  if (request.method === "POST") {
    // A press. Nothing is stored about who made it, so there is nothing to
    // rate limit for privacy; the ceiling is here so the counter cannot be
    // driven up by hand and the store's daily budget cannot be spent by a
    // stranger with a loop.
    const body = await readJsonBody(request, maxPublicBodyBytes);
    const id = typeof body?.click === "string" ? body.click : "";
    // Nothing to answer with either way, so an unconfigured store, a missing id
    // and a counted press all leave with the same empty 204.
    if (config && store && id !== "" && id.length <= maxSlotIdLength) {
      const calls = await countRecentCalls(
        config,
        `mockup-studio:sponsor-click-rate:${callerKey(request)}`,
        clickWindowSeconds,
      );
      if (calls <= maxClicksPerCallerPerWindow) await store.countClick(id);
    }
    return new Response(null, { status: 204 });
  }

  if (request.method !== "GET") return json({ error: "Use GET." }, 405);

  const imageId = new URL(request.url).searchParams.get("image");
  if (imageId !== null) {
    // Bounded before it is used, so a long query string cannot spend a command
    // from the store's daily budget on a key that was never going to exist.
    const known = imageId !== "" && imageId.length <= maxSlotIdLength;
    const stored = store && known ? await store.readImage(imageId) : null;
    if (!stored) return new Response(null, { status: 404 });

    return new Response(decodeBase64(stored.base64), {
      headers: {
        // Safe to cache hard because the address carries the content digest,
        // so a replaced logo is never the same URL as the one it replaced.
        "Cache-Control": "public, max-age=86400, immutable",
        "Content-Type": stored.mediaType,
        // The type was checked against the bytes on the way in. This stops a
        // browser deciding for itself that it was something else.
        "X-Content-Type-Options": "nosniff",
      },
      status: 200,
    });
  }

  const cache = `public, s-maxage=${slotCacheSeconds}, stale-while-revalidate=600`;
  if (!store) return json({ sponsor: null }, 200, cache);

  const live = findLiveSlot(await store.listSlots(), new Date());
  return json({ sponsor: live ? toPublicSponsor(live) : null }, 200, cache);
}

/** One booking as the admin page reads it: the record plus what it is doing. */
export type AdminSponsorSlot = SponsorSlot & {
  readonly clicks: number;
  readonly daysLeft: number;
  readonly status: ReturnType<typeof slotStatus>;
};

async function listForAdmin(store: SponsorStore): Promise<AdminSponsorSlot[]> {
  const now = new Date();
  const [slots, clicks] = await Promise.all([
    store.listSlots(),
    store.listClicks(),
  ]);
  return slots.map((slot) => ({
    ...slot,
    clicks: clicks[slot.id] ?? 0,
    daysLeft: daysLeft(slot, now),
    status: slotStatus(slot, now),
  }));
}

async function saveSlot(
  store: SponsorStore,
  body: Record<string, unknown>,
): Promise<Response> {
  const normalized = normalizeSlotDraft(
    {
      endsOn: body.endsOn,
      headline: body.headline,
      href: body.href,
      sponsor: body.sponsor,
      startsOn: body.startsOn,
    },
    new Date(),
  );
  if (!normalized.ok) {
    return json({ error: describeSlotRejection(normalized.reason) }, 400);
  }

  const image = await readSponsorImage(body.image);
  if (!image.ok) {
    return json({ error: describeImageRejection(image.reason) }, 400);
  }

  /*
   * One sponsor at a time, and the clash is named.
   *
   * The slot is sold as the corner of the studio for a period, so two bookings
   * over the same days is a promise that cannot be kept to either of them. The
   * booking being replaced is left out of the comparison, which is what makes
   * re-uploading a logo or fixing a link an edit rather than a refusal.
   */
  const existing = await store.listSlots();
  const clash = existing.find(
    (slot) =>
      slot.id !== normalized.slot.id && slotsOverlap(slot, normalized.slot),
  );
  if (clash) {
    return json(
      {
        error: `Those days are already sold to ${clash.sponsor} (${clash.startsOn} to ${clash.endsOn}).`,
      },
      409,
    );
  }

  const slot: SponsorSlot = {
    ...normalized.slot,
    imageDigest: image.image.digest,
    imageMediaType: image.image.mediaType,
  };
  await store.saveSlot(slot, image.image.base64);

  return json({ slots: await listForAdmin(store) }, 200);
}

/**
 * The operator's endpoint: read the bookings, add one, take one down.
 *
 * Behind the same password as the email list and for the same reason: a check
 * the browser performs is a check anyone can skip by not running it. POST only,
 * so the password is never in a URL, where it would be written into server
 * logs, browser history and every referrer header the page sends.
 */
export async function handleSponsorAdmin(
  request: Request,
  env: Env,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<Response> {
  if (request.method !== "POST") return json({ error: "Use POST." }, 405);

  const password = readAdminPassword(env);
  const store = storeFor(configFor(env, fetchImpl));
  // Loudly here, unlike the public endpoint: this is where the operator finds
  // out that a booking they entered was never going to be stored.
  if (!password || !store) {
    return json({ error: "Sponsorship is not configured." }, 503);
  }

  const body = await readJsonBody(request, maxAdminBodyBytes);
  if (!body) return json({ error: "Send a smaller image." }, 400);
  if (!(await matchesAdminPassword(body.password, password))) {
    return json({ error: "Wrong password." }, 401);
  }

  if (body.action === "list") {
    return json({ slots: await listForAdmin(store) }, 200);
  }

  if (body.action === "save") return saveSlot(store, body);

  if (body.action === "remove") {
    const id = typeof body.id === "string" ? body.id : "";
    if (id === "") return json({ error: "Which booking?" }, 400);
    await store.removeSlot(id);
    return json({ slots: await listForAdmin(store) }, 200);
  }

  return json({ error: "Unknown action." }, 400);
}
