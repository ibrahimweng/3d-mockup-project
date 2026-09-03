import { describe, expect, it } from "vitest";

import { appSchema } from "./app-schema";
import { PANEL_TAB_OPTIONS, PANEL_TAB_TARGET } from "./panel-tabs";

const sections = appSchema.panels.controls?.sections ?? [];
const tabValues = PANEL_TAB_OPTIONS.map((option) => option.value);

/**
 * Sections that are not one of the four jobs.
 *
 * Setup is the runtime's own and is always on screen; the tab bar is the thing
 * doing the switching; the footer is the pair of export buttons, which are the
 * point of the app and belong under every tab.
 */
const alwaysOnScreen = new Set([
  "runtime.setup",
  "view-tabs",
  // The authored `deliver` section, which the runtime re-registers as its own
  // sticky footer.
  "runtime.export",
]);

describe("panel tabs", () => {
  it("every product section names one tab and every tab owns sections", () => {
    const switched = sections.filter(
      (section) => !alwaysOnScreen.has(section.id),
    );

    // Nothing may be left unreachable: a section with no visibleWhen would sit
    // under all four tabs, which is the crowding this exists to undo.
    expect(
      switched
        .filter((section) => section.visibleWhen?.target !== PANEL_TAB_TARGET)
        .map((section) => section.id),
    ).toEqual([]);

    // And no tab may be empty, which is what a renamed tab value would leave
    // behind.
    const owned = new Map<unknown, string[]>(
      tabValues.map((tab) => [tab, []]),
    );
    for (const section of switched) {
      const tab = section.visibleWhen?.equals;
      expect(tabValues, `${section.id} names an unknown tab`).toContain(tab);
      owned.get(tab)?.push(section.id);
    }

    expect(
      [...owned].filter(([, ids]) => ids.length === 0).map(([tab]) => tab),
    ).toEqual([]);
  });

  it("never shows the whole panel at once", () => {
    const total = sections.reduce(
      (count, section) => count + Object.keys(section.controls).length,
      0,
    );
    const shownPerTab = tabValues.map((tab) =>
      sections
        .filter(
          (section) =>
            alwaysOnScreen.has(section.id) ||
            section.visibleWhen?.equals === tab,
        )
        .reduce((count, section) => count + Object.keys(section.controls).length, 0),
    );

    // The point of the tabs, stated as a number: whichever one is open, a third
    // of the panel is somewhere else. Before them every control was on screen
    // at once, which is what made a 272px column feel like a wall.
    expect(Math.max(...shownPerTab)).toBeLessThanOrEqual((total * 2) / 3);
  });
});
