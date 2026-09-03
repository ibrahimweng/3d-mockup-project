import { describe, expect, it } from "vitest";

import {
  describeEmailRejection,
  maxEmailLength,
  normalizeEmail,
} from "./email-address";

describe("normalizeEmail", () => {
  it("accepts the shapes real addresses come in", () => {
    for (const value of [
      "sam@example.com",
      "sam.smith@example.co.uk",
      "sam+studio@example.com",
      "sam_smith@sub.example.io",
      "s@x.dev",
      "sam-smith@my-domain.com",
      // A long TLD and a numeric domain label are both legal and both get
      // rejected by validators that guess at the shape.
      "hello@example.photography",
      "hello@0example1.com",
    ]) {
      expect(normalizeEmail(value), value).toEqual({ email: value, ok: true });
    }
  });

  it("trims and lower-cases so one person is one subscriber", () => {
    expect(normalizeEmail("  Sam.Smith@Example.COM \n")).toEqual({
      email: "sam.smith@example.com",
      ok: true,
    });
  });

  it("refuses what is not an address", () => {
    const cases: Record<string, "empty" | "malformed" | "too-long"> = {
      "": "empty",
      "   ": "empty",
      "sam": "malformed",
      "sam@": "malformed",
      "@example.com": "malformed",
      "sam@example": "malformed",
      "sam@.com": "malformed",
      "sam@example..com": "malformed",
      "sam@-example.com": "malformed",
      "sam@example-.com": "malformed",
      "sam smith@example.com": "malformed",
      "sam@exam ple.com": "malformed",
      // A comma or a semicolon means someone pasted a list, and taking the
      // first address off it would sign up someone who did not ask.
      "sam@example.com,other@example.com": "malformed",
      "sam@example.com; other@example.com": "malformed",
      "<sam@example.com>": "malformed",
    };

    for (const [value, reason] of Object.entries(cases)) {
      expect(normalizeEmail(value), value).toEqual({ ok: false, reason });
    }
  });

  it("refuses anything that is not a string", () => {
    for (const value of [undefined, null, 42, {}, ["a@b.com"], true]) {
      expect(normalizeEmail(value)).toEqual({ ok: false, reason: "empty" });
    }
  });

  it("caps the length before running the pattern", () => {
    const long = `${"a".repeat(maxEmailLength)}@example.com`;
    expect(normalizeEmail(long)).toEqual({ ok: false, reason: "too-long" });
  });

  it("has something to say about every refusal", () => {
    for (const reason of ["empty", "malformed", "too-long"] as const) {
      expect(describeEmailRejection(reason).length).toBeGreaterThan(0);
    }
  });
});
