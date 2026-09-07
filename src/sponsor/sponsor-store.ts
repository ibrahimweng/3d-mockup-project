import {
  readHashPairs,
  redisCommand,
  type RedisConfig,
} from "../store/redis-rest";
import type { SponsorSlot } from "./sponsor-slot";

/**
 * Where the bookings live.
 *
 * Three keys, and the split between them is about what has to be read on a
 * page load rather than about tidiness.
 *
 * `bookings` is a hash of every slot ever entered, keyed by id, holding the
 * dates and the text and no image. It is small enough to read whole, which is
 * what the studio does once a minute to find out whose card is up.
 *
 * The image is a key of its own per booking, because it is four orders of
 * magnitude bigger than the record beside it. Kept in the same hash, every read
 * of "who is live" would drag every logo ever uploaded across the wire.
 *
 * `clicks` counts presses per booking and holds nothing else. There is no
 * visitor in it: no address, no identifier, no time. It exists so the operator
 * has a number to show a sponsor at renewal, and a total is the largest number
 * that can be kept without keeping anything about anybody.
 */

const bookingsKey = "mockup-studio:sponsors";
const clicksKey = "mockup-studio:sponsor-clicks";
const imageKeyPrefix = "mockup-studio:sponsor-image:";

export type SponsorStore = {
  readonly listSlots: () => Promise<readonly SponsorSlot[]>;
  readonly listClicks: () => Promise<Readonly<Record<string, number>>>;
  readonly readImage: (
    id: string,
  ) => Promise<{ base64: string; mediaType: string } | null>;
  readonly saveSlot: (
    slot: SponsorSlot,
    imageBase64: string,
  ) => Promise<void>;
  readonly removeSlot: (id: string) => Promise<void>;
  readonly countClick: (id: string) => Promise<void>;
};

function parseSlot(id: string, raw: string): SponsorSlot | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const record = value as Partial<SponsorSlot>;
    if (
      typeof record.endsOn !== "string" ||
      typeof record.href !== "string" ||
      typeof record.startsOn !== "string"
    ) {
      return null;
    }
    return {
      bookedAt: typeof record.bookedAt === "string" ? record.bookedAt : "",
      endsOn: record.endsOn,
      headline: typeof record.headline === "string" ? record.headline : "",
      href: record.href,
      id,
      imageDigest:
        typeof record.imageDigest === "string" ? record.imageDigest : "",
      imageMediaType:
        typeof record.imageMediaType === "string" ? record.imageMediaType : "",
      sponsor: typeof record.sponsor === "string" ? record.sponsor : id,
      startsOn: record.startsOn,
    };
  } catch {
    return null;
  }
}

export function createSponsorStore(config: RedisConfig): SponsorStore {
  return {
    /**
     * Counted, never attributed.
     *
     * `HINCRBY` on one field is the entire write: the store learns that the
     * card was pressed once more and nothing whatever about who pressed it.
     */
    countClick: async (id) => {
      await redisCommand(config, ["HINCRBY", clicksKey, id, 1]);
    },
    listClicks: async () => {
      const pairs = readHashPairs(await redisCommand(config, ["HGETALL", clicksKey]));
      const counts: Record<string, number> = {};
      for (const [id, value] of pairs) {
        const count = Number(value);
        if (Number.isFinite(count)) counts[id] = count;
      }
      return counts;
    },
    /**
     * Every booking, in the order they run.
     *
     * Sorted by start date rather than by when they were entered, because that
     * is the order the operator thinks in: what is on now, what is next, and
     * what is over.
     */
    listSlots: async () => {
      const pairs = readHashPairs(
        await redisCommand(config, ["HGETALL", bookingsKey]),
      );
      return pairs
        .flatMap(([id, raw]) => parseSlot(id, raw) ?? [])
        .sort((left, right) => left.startsOn.localeCompare(right.startsOn));
    },
    readImage: async (id) => {
      const raw = await redisCommand(config, ["GET", `${imageKeyPrefix}${id}`]);
      if (typeof raw !== "string") return null;
      try {
        const value: unknown = JSON.parse(raw);
        if (!value || typeof value !== "object") return null;
        const stored = value as { base64?: unknown; mediaType?: unknown };
        return typeof stored.base64 === "string" &&
          typeof stored.mediaType === "string"
          ? { base64: stored.base64, mediaType: stored.mediaType }
          : null;
      } catch {
        return null;
      }
    },
    /**
     * The image first, then the record that points at it.
     *
     * This order is the one that fails safely. A record naming an image that is
     * not there yet is a card with a hole in it; an image nothing names is a
     * few kilobytes nobody reads. Only the second is survivable, so the second
     * is what a half-finished save leaves behind.
     */
    removeSlot: async (id) => {
      await redisCommand(config, ["HDEL", bookingsKey, id]);
      await redisCommand(config, ["DEL", `${imageKeyPrefix}${id}`]);
      await redisCommand(config, ["HDEL", clicksKey, id]);
    },
    saveSlot: async (slot, imageBase64) => {
      await redisCommand(config, [
        "SET",
        `${imageKeyPrefix}${slot.id}`,
        JSON.stringify({ base64: imageBase64, mediaType: slot.imageMediaType }),
      ]);
      await redisCommand(config, [
        "HSET",
        bookingsKey,
        slot.id,
        JSON.stringify({
          bookedAt: slot.bookedAt,
          endsOn: slot.endsOn,
          headline: slot.headline,
          href: slot.href,
          imageDigest: slot.imageDigest,
          imageMediaType: slot.imageMediaType,
          sponsor: slot.sponsor,
          startsOn: slot.startsOn,
        }),
      ]);
    },
  };
}
