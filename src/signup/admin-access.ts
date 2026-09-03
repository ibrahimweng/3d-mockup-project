/**
 * Reading the list back, and the two things that protects.
 *
 * The password is compared inside a serverless function and never leaves it,
 * because a check the browser performs is a check anyone can skip by not
 * running it. The comparison is constant-time: a plain `===` on strings returns
 * as soon as two characters differ, which leaks how much of a guess was right
 * and turns a long password into a short one, guessed a character at a time.
 *
 * Both sides are hashed first so the comparison is over two equal-length
 * digests. That removes the other leak — the length of the secret — for free.
 */

const minimumAdminPasswordLength = 16;

export function readAdminPassword(
  env: Readonly<Record<string, string | undefined>>,
): string | null {
  const password = env.ADMIN_PASSWORD ?? "";
  // A short password on a public endpoint is worse than none, because it reads
  // as protection. Refusing to serve is the safe direction to fail in.
  return password.length >= minimumAdminPasswordLength ? password : null;
}

async function digest(value: string): Promise<Uint8Array> {
  const bytes = new TextEncoder().encode(value);
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
}

/** Constant-time over the digests: every byte is compared, always. */
export async function matchesAdminPassword(
  offered: unknown,
  expected: string,
): Promise<boolean> {
  if (typeof offered !== "string") return false;

  const [left, right] = await Promise.all([digest(offered), digest(expected)]);
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }

  return difference === 0;
}

/**
 * One field of a CSV, quoted the way a spreadsheet expects.
 *
 * The leading apostrophe on a field starting with `=`, `+`, `-` or `@` is not
 * decoration: a spreadsheet treats those as the start of a formula, so an
 * address like `+x@example.com` — which is a legal address — becomes a live
 * cell in whatever program opens the file. Prefixing it makes it text.
 */
function csvField(value: string): string {
  const guarded = /^[=+\-@\t\r]/u.test(value) ? `'${value}` : value;
  return `"${guarded.replace(/"/gu, '""')}"`;
}

export function toCsv(
  records: readonly { email: string; firstSeen: string; source: string }[],
): string {
  const rows = [
    ["email", "first seen", "source"],
    ...records.map((record) => [record.email, record.firstSeen, record.source]),
  ];
  // CRLF, because that is what the CSV convention says and what Excel wants.
  return rows.map((row) => row.map(csvField).join(",")).join("\r\n");
}
