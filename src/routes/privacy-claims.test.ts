import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The privacy note says designs never leave the browser. This is what makes
 * that true rather than reassuring.
 *
 * The note is a promise written in prose, and prose does not fail a build. So
 * the claim is restated here as a rule about the source: the app may talk to
 * exactly two places, both of them ours, and neither takes a file. Add a third
 * and this fails, naming the file — which is the moment to ask whether the
 * privacy note is still true before shipping the change that made it false.
 */

const networkCall = /\b(?:fetch\(|XMLHttpRequest|sendBeacon|new WebSocket|EventSource\()/u;

/**
 * The calls that exist today, each with the reason it does not send anything
 * anywhere it should not.
 */
const allowed = [
  {
    file: "src/app/render/animated-artwork.ts",
    // A `blob:` URL for a GIF the person just dropped in. It reads back the
    // bytes the browser is already holding; nothing is requested from a server.
    reason: "reads a local object URL for an uploaded GIF",
  },
  {
    // Both places that ask — the tour's closing step and the export gate —
    // send through this one hook, which is why there is one entry here and not
    // two. If that ever splits back into two callers, this test says so.
    file: "src/app/signup/use-email-signup.ts",
    reason: "posts an offered email address to our own endpoint",
  },
  {
    file: "src/routes/admin.tsx",
    reason: "asks our own endpoint for the list, behind a password",
  },
] as const;

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/u.test(entry) && !/\.test\.tsx?$/u.test(entry) ? [path] : [];
  });
}

describe("the privacy note's claim about what leaves the browser", () => {
  it("finds no network call the note has not accounted for", () => {
    const known = new Set<string>(allowed.map((entry) => entry.file));
    const found = sourceFiles("src/app")
      .concat(sourceFiles("src/routes"))
      .filter((path) => networkCall.test(readFileSync(path, "utf8")))
      .filter((path) => !known.has(path));

    expect(
      found,
      "A new network call means the privacy note may no longer be true. Account for it in `allowed` above, and check what the note says before you do.",
    ).toEqual([]);
  });

  it("still finds every call it has accounted for", () => {
    // Otherwise the list rots into a set of names for code that is gone, and
    // stops being evidence of anything.
    for (const { file } of allowed) {
      expect(networkCall.test(readFileSync(file, "utf8")), file).toBe(true);
    }
  });
});
