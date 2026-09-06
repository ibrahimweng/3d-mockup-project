import { describe, expect, it } from "vitest";

import { isExportShortcut, readExportLabel, shouldHoldExport } from "./export-gate";

describe("readExportLabel", () => {
  it("recognises the two buttons that export", () => {
    expect(readExportLabel("Export PNG")).toBe("Export PNG");
    expect(readExportLabel("Export Video")).toBe("Export Video");
    // Buttons carry an icon and whitespace around their text.
    expect(readExportLabel("  Export PNG \n")).toBe("Export PNG");
  });

  it("recognises nothing else, so no other press is ever swallowed", () => {
    for (const text of [
      "",
      null,
      undefined,
      "Export",
      "Export Settings",
      "Import Settings",
      "Download",
      "Export PNG at 4K",
      "export png",
    ]) {
      expect(readExportLabel(text), String(text)).toBeNull();
    }
  });
});

describe("shouldHoldExport", () => {
  it("holds a press from someone who has not given an address", () => {
    expect(
      shouldHoldExport({ automated: false, given: false, releasing: false, skipped: false }),
    ).toBe(true);
  });

  it("never holds again once an address is given", () => {
    expect(
      shouldHoldExport({ automated: false, given: true, releasing: false, skipped: false }),
    ).toBe(false);
  });

  it("never holds the press it makes itself", () => {
    // The gate presses the button to let the export through. Catching that
    // would be holding the door against ourselves, forever.
    expect(
      shouldHoldExport({ automated: false, given: false, releasing: true, skipped: false }),
    ).toBe(false);
  });

  it("never holds an automated session", () => {
    // Every browser proof opens a fresh profile, so every proof is someone who
    // has not signed up, and a modal would stand in front of every export
    // assertion in the suite.
    expect(
      shouldHoldExport({ automated: true, given: false, releasing: false, skipped: false }),
    ).toBe(false);
  });

  it("does not ask a second time in a sitting someone already said no in", () => {
    // The ask is worth making once. Repeating it on every export turns a
    // question into an obstacle, and the person exporting ten variations of
    // one shot is the person it lands on hardest.
    expect(
      shouldHoldExport({
        automated: false,
        given: false,
        releasing: false,
        skipped: true,
      }),
    ).toBe(false);
  });
});

describe("isExportShortcut", () => {
  /** Ctrl-E and Cmd-E, with nothing else held and nobody typing. */
  const press = (over: Partial<Parameters<typeof isExportShortcut>[0]> = {}) =>
    isExportShortcut({
      altKey: false,
      ctrlKey: true,
      key: "e",
      metaKey: false,
      shiftKey: false,
      typing: false,
      ...over,
    });

  it("answers to both accelerators, in either case", () => {
    expect(press()).toBe(true);
    expect(press({ ctrlKey: false, metaKey: true })).toBe(true);
    // A capital E is the same key with Caps Lock on, not a different shortcut.
    expect(press({ key: "E" })).toBe(true);
  });

  it("stands down while somebody is typing", () => {
    // The whole point. On a Mac, Ctrl-E moves the cursor to the end of the line
    // in every text field there is, so reaching for the end of a half-typed
    // address used to open the export dialog on top of it.
    expect(press({ typing: true })).toBe(false);
    expect(press({ ctrlKey: false, metaKey: true, typing: true })).toBe(false);
  });

  it("takes no key that is not ours", () => {
    for (const over of [
      { key: "f" },
      { key: "" },
      { ctrlKey: false },
      // Every other modifier belongs to some other shortcut, here or in the
      // browser.
      { altKey: true },
      { shiftKey: true },
    ]) {
      expect(press(over), JSON.stringify(over)).toBe(false);
    }
  });
});
