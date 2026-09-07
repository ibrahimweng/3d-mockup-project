import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { OPERATOR_NAME } from "./operator";

/**
 * What `index.html` has to keep saying about this app.
 *
 * The file is generated from a framework template and the framework's manifest
 * signs it, which means the app-specific parts of it are exactly the parts a
 * regeneration would quietly throw away: the title, the description, and a link
 * preview pointing at a render this studio made rather than at the framework's
 * own advertisement, which is what used to be there.
 *
 * Nothing else in this repository looks at that file. So this does. It is not
 * checking that the tags are well formed, which a browser would tell you; it is
 * checking that somebody's own writing is still in a file they were told not to
 * edit, because the way that writing disappears is silently.
 *
 * Two of the tags are still relative paths, so Facebook and LinkedIn show no
 * image for a shared link. Fixing that needs a domain, and the assertion that
 * they are absolute belongs here beside the rest once there is one.
 */

const page = readFileSync("index.html", "utf8");

function meta(pattern: RegExp): string {
  return pattern.exec(page)?.[1] ?? "";
}

/**
 * Roughly where a search result heading is cut off.
 *
 * It is a width in pixels rather than a count of letters, so this is an
 * approximation of somebody else's rule. It is worth having anyway: a title
 * that grows past it is one somebody will read the front half of.
 */
const maxTitleLength = 60;

describe("what the studio's own page tells a search engine", () => {
  it("has a title that says what the thing is, not only what it is called", () => {
    const title = meta(/<title>([^<]*)<\/title>/u);

    expect(title).not.toBe(OPERATOR_NAME);
    expect(title.length).toBeGreaterThan(OPERATOR_NAME.length);
    expect(title.length).toBeLessThanOrEqual(maxTitleLength);
    // The name still has to be in it, or somebody who has been here before
    // cannot pick this out of a list of ten results.
    expect(title).toContain(OPERATOR_NAME);
    expect(title.toLowerCase()).toContain("mockup");
  });

  it("still describes itself, in a sentence of its own", () => {
    const description = meta(/<meta name="description" content="([^"]*)"/u);
    expect(description.length).toBeGreaterThan(50);
  });

  it("still shares a picture this studio made", () => {
    // What used to be here pointed at the app framework's site, so every link
    // anybody shared advertised the framework rather than this. The image named
    // below is a real export, rebuilt by `npm run preview:social`.
    expect(meta(/<meta property="og:image" content="([^"]*)"/u)).toContain(
      "social-preview.jpg",
    );
    expect(meta(/<meta name="twitter:image" content="([^"]*)"/u)).toContain(
      "social-preview.jpg",
    );
    expect(page).toContain('name="twitter:card" content="summary_large_image"');
    // Nothing the page points at, as opposed to nothing it mentions: the
    // comment above those tags explains what used to be there by naming it.
    expect(page).not.toMatch(/(?:content|href|src)="[^"]*toolcraft\.sh/u);
  });

  it("names an image whose file is actually there", () => {
    // A link preview naming a picture that is not on the server is worse than
    // naming none: the crawler asks once, gets nothing, and caches that.
    expect(() => readFileSync("public/social-preview.jpg")).not.toThrow();
  });
});
