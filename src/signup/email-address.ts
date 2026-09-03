/**
 * What counts as an email address here.
 *
 * Deliberately not RFC 5322. A validator that accepts every legal address is
 * enormous, and the addresses it uniquely admits — quoted local parts, comments
 * in the domain — are not the ones anyone types into a signup box. What this
 * has to do is reject the things that are obviously not addresses and normalise
 * the rest so the same person does not arrive twice as `A@x.com` and `a@x.com`.
 *
 * The only address that must never be rejected is a real one, so where a rule
 * was a judgement call it went the permissive way -- TLD length is
 * unchecked, and plus addressing, dots and dashes are all allowed wherever
 * they are legal.
 */

/** Long enough for any real address, short enough that nobody posts a novel. */
export const maxEmailLength = 254;

const emailPattern =
  /^[^\s@,;:<>()[\]\\"]{1,64}@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/u;

export type EmailNormalization =
  | { readonly email: string; readonly ok: true }
  | { readonly ok: false; readonly reason: EmailRejection };

export type EmailRejection = "empty" | "malformed" | "too-long";

/**
 * Trim, lower-case and check one address.
 *
 * Lower-cased whole rather than domain-only: the local part is
 * case-sensitive by the standard and case-insensitive at every mail provider
 * anyone signing up here actually uses, and treating `Sam@` and `sam@` as two
 * subscribers is the worse of the two errors.
 */
export function normalizeEmail(value: unknown): EmailNormalization {
  if (typeof value !== "string") return { ok: false, reason: "empty" };

  const email = value.trim().toLowerCase();

  if (email.length === 0) return { ok: false, reason: "empty" };
  if (email.length > maxEmailLength) return { ok: false, reason: "too-long" };
  if (!emailPattern.test(email)) return { ok: false, reason: "malformed" };

  return { email, ok: true };
}

/**
 * What to tell someone whose address was refused.
 *
 * One sentence each, saying what to do rather than what went wrong, because
 * "malformed" is a word for a log and not for a person halfway through
 * exporting a picture.
 */
export function describeEmailRejection(reason: EmailRejection): string {
  switch (reason) {
    case "empty":
      return "Enter an email address.";
    case "too-long":
      return "That address is too long.";
    case "malformed":
      return "That does not look like an email address.";
  }
}
