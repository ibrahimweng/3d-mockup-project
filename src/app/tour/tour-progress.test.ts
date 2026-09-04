import { afterEach, describe, expect, test, vi } from "vitest";

import { hasSeenTour, rememberTourSeen } from "./tour-progress";

/**
 * A storage that behaves like a browser's.
 *
 * The suite runs in node, where there is no `window` at all, so these tests
 * supply one. That is the honest way round: the module's whole job is to talk
 * to browser storage and survive the several ways it refuses, and a fake that
 * cannot refuse would only prove the happy path.
 */
function stubStorage(entries: Map<string, string> = new Map()): Map<string, string> {
  vi.stubGlobal("window", {
    localStorage: {
      clear: () => entries.clear(),
      getItem: (key: string) => entries.get(key) ?? null,
      removeItem: (key: string) => entries.delete(key),
      setItem: (key: string, value: string) => entries.set(key, value),
    },
  });
  return entries;
}

afterEach(() => vi.unstubAllGlobals());

describe("remembering the tour", () => {
  test("a browser that has not been here gets the tour", () => {
    stubStorage();
    expect(hasSeenTour()).toBe(false);
  });

  test("a browser that has been walked through does not get it again", () => {
    stubStorage();
    rememberTourSeen();
    expect(hasSeenTour()).toBe(true);
  });

  /**
   * The claim that makes this honest: what is written down is site data, so
   * clearing site data brings the tour back. Nothing else identifies a
   * visitor, which is the point — a first-run experience should not need to
   * know who someone is to decide whether they are new.
   */
  test("clearing the browser's storage makes them a first-time visitor again", () => {
    const entries = stubStorage();
    rememberTourSeen();
    expect(hasSeenTour()).toBe(true);

    entries.clear();
    expect(hasSeenTour()).toBe(false);
  });

  /**
   * Storage throws rather than returning null in a private window with site
   * data blocked, and in an embedded webview with storage partitioned off. The
   * failure has to resolve to "show the tour": a studio that will not open
   * because it could not remember whether it had been opened is a worse fault
   * than a tour shown twice.
   */
  test("a browser that cannot remember shows the tour rather than breaking", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("site data blocked");
        },
        setItem: () => {
          throw new Error("site data blocked");
        },
      },
    });

    expect(() => rememberTourSeen()).not.toThrow();
    expect(hasSeenTour()).toBe(false);
  });
});
