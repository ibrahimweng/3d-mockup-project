import { describe, expect, it } from "vitest";

import { matchesAdminPassword, readAdminPassword, toCsv } from "./admin-access";

describe("readAdminPassword", () => {
  it("refuses to serve without a long enough password", () => {
    expect(readAdminPassword({})).toBeNull();
    expect(readAdminPassword({ ADMIN_PASSWORD: "" })).toBeNull();
    // Fifteen characters, one short: a weak password on a public endpoint reads
    // as protection while providing very little.
    expect(readAdminPassword({ ADMIN_PASSWORD: "a".repeat(15) })).toBeNull();
    expect(readAdminPassword({ ADMIN_PASSWORD: "a".repeat(16) })).toBe("a".repeat(16));
  });
});

describe("matchesAdminPassword", () => {
  const expected = "correct-horse-battery-staple";

  it("accepts the password and refuses everything else", async () => {
    await expect(matchesAdminPassword(expected, expected)).resolves.toBe(true);
    for (const wrong of [
      "",
      "correct-horse-battery-stapl",
      "correct-horse-battery-staplE",
      "Correct-horse-battery-staple",
      `${expected} `,
      `${expected}x`,
    ]) {
      await expect(matchesAdminPassword(wrong, expected), wrong).resolves.toBe(false);
    }
  });

  it("refuses a non-string rather than coercing it", async () => {
    for (const value of [undefined, null, 0, {}, [expected], true]) {
      await expect(matchesAdminPassword(value, expected)).resolves.toBe(false);
    }
  });

  it("compares digests, so a near miss costs the same as a wild one", async () => {
    // Not a timing measurement — a wall clock in a test suite proves nothing
    // about constant time. What is checked is the property that makes it
    // constant: both sides become 32 bytes, so length tells an attacker
    // nothing and every byte is always compared.
    await expect(matchesAdminPassword("a", expected)).resolves.toBe(false);
    await expect(matchesAdminPassword("a".repeat(4096), expected)).resolves.toBe(false);
  });
});

describe("toCsv", () => {
  it("writes a header and one row per subscriber", () => {
    expect(
      toCsv([
        { email: "a@b.com", firstSeen: "2026-01-01T00:00:00.000Z", source: "export" },
      ]),
    ).toBe(
      '"email","first seen","source"\r\n"a@b.com","2026-01-01T00:00:00.000Z","export"',
    );
  });

  it("neutralises an address a spreadsheet would run as a formula", () => {
    // `+x@example.com` is a legal address and `=`-prefixed content is a live
    // formula in Excel and Sheets; the apostrophe makes it text.
    const csv = toCsv([
      { email: "+x@example.com", firstSeen: "", source: "export" },
      { email: "=cmd@example.com", firstSeen: "", source: "export" },
    ]);
    expect(csv).toContain(`"'+x@example.com"`);
    expect(csv).toContain(`"'=cmd@example.com"`);
  });

  it("escapes a quote by doubling it", () => {
    expect(toCsv([{ email: 'a"b@c.com', firstSeen: "", source: "" }])).toContain(
      '"a""b@c.com"',
    );
  });

  it("writes a header alone when nobody has signed up", () => {
    expect(toCsv([])).toBe('"email","first seen","source"');
  });
});
