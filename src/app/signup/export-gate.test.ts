import { describe, expect, it } from "vitest";

import { readExportLabel, shouldHoldExport } from "./export-gate";

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
      shouldHoldExport({ automated: false, given: false, releasing: false }),
    ).toBe(true);
  });

  it("never holds again once an address is given", () => {
    expect(
      shouldHoldExport({ automated: false, given: true, releasing: false }),
    ).toBe(false);
  });

  it("never holds the press it makes itself", () => {
    // The gate presses the button to let the export through. Catching that
    // would be holding the door against ourselves, forever.
    expect(
      shouldHoldExport({ automated: false, given: false, releasing: true }),
    ).toBe(false);
  });

  it("never holds an automated session", () => {
    // Every browser proof opens a fresh profile, so every proof is someone who
    // has not signed up, and a modal would stand in front of every export
    // assertion in the suite.
    expect(
      shouldHoldExport({ automated: true, given: false, releasing: false }),
    ).toBe(false);
  });
});
