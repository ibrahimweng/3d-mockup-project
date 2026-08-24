import { describe, expect, test } from "vitest";

import {
  stemQuickActionWord,
  tokenizeQuickActionQuery,
  tokenizeQuickActionText,
} from "./quick-action-text";

describe("quick action stemming", () => {
  test("collapses the inflections of one verb onto one token", () => {
    const forms = ["spin", "spins", "spinning"].map(stemQuickActionWord);
    expect(new Set(forms).size).toBe(1);

    const rotations = ["rotate", "rotates", "rotated", "rotating"].map(stemQuickActionWord);
    expect(new Set(rotations).size).toBe(1);
  });

  test("collapses plurals onto the singular", () => {
    expect(stemQuickActionWord("shadows")).toBe(stemQuickActionWord("shadow"));
    expect(stemQuickActionWord("lights")).toBe(stemQuickActionWord("light"));
    expect(stemQuickActionWord("blinds")).toBe(stemQuickActionWord("blind"));
  });

  test("leaves a double s alone", () => {
    // "gloss" losing its final s would land on "glos", one letter from "glas".
    expect(stemQuickActionWord("gloss")).toBe("gloss");
    expect(stemQuickActionWord("glass")).toBe("glass");
    expect(stemQuickActionWord("gloss")).not.toBe(stemQuickActionWord("glass"));
  });

  test("leaves short words untouched", () => {
    for (const word of ["png", "mp4", "4k", "fit", "key", "add"]) {
      expect(stemQuickActionWord(word)).toBe(word);
    }
  });
});

describe("quick action tokenizing", () => {
  test("keeps the words that name a state or a direction", () => {
    // A general stop-word list drops all of these; here each one is an answer.
    expect(tokenizeQuickActionText("on off no up down out")).toEqual([
      "on", "off", "no", "up", "down", "out",
    ]);
  });

  test("drops the words that carry no intent", () => {
    expect(tokenizeQuickActionText("i want to make the thing")).toEqual(["thing"]);
  });

  test("splits on punctuation and case, and lowercases", () => {
    expect(tokenizeQuickActionText("Export PNG / 4K")).toEqual(["export", "png", "4k"]);
  });

  test("a query counts each word once, so coverage cannot be gamed by repetition", () => {
    expect(tokenizeQuickActionQuery("shadow shadow shadows")).toEqual(["shadow"]);
  });
});
