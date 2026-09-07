import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { OPERATOR_EMAIL } from "../operator";
import { SPONSOR_PAGE_PATH, SPONSOR_PRICE } from "./sponsor-terms";

/**
 * The page that sells the slot is static HTML, so nothing type-checks it.
 *
 * It sits in `public/` rather than in the router for reasons its own comment
 * gives, and the cost of that is a page written in a different language from
 * the card that points at it. Two things have to agree across that gap and
 * neither compiler can see the other: the price, and the address somebody is
 * asked to write to. A card offering one price beside a page asking another is
 * the first thing a buyer would notice, and it is exactly the kind of drift
 * that survives every check a repository normally runs.
 *
 * So the agreement is a test. It is the same shape as the privacy claims test
 * next door: a promise written in prose, restated as a rule about the source.
 */

const page = readFileSync("public/sponsor.html", "utf8");

describe("the page that sells the sponsor slot", () => {
  it("asks for money at the price the card advertises", () => {
    expect(page).toContain(SPONSOR_PRICE);
  });

  it("gives the same address the privacy note gives", () => {
    expect(page).toContain(OPERATOR_EMAIL);
  });

  it("carries no other address that somebody could pay by mistake", () => {
    // A stale copy of an old address on a payment page is money sent to
    // somewhere nobody is reading, so every address on the page has to be the
    // one address this repository knows about.
    const addresses = new Set(page.match(/[\w.+-]+@[\w-]+\.[\w.]+/gu) ?? []);
    expect([...addresses]).toEqual([OPERATOR_EMAIL]);
  });

  it("is reachable at the path the card sends people to", () => {
    // The card is an anchor to a path that only exists because a rewrite says
    // it does. Delete the rewrite and the link quietly lands on the studio
    // instead, with nothing broken enough for anybody to notice.
    const vercel = JSON.parse(readFileSync("vercel.json", "utf8")) as {
      rewrites: { destination: string; source: string }[];
    };
    expect(vercel.rewrites).toContainEqual({
      destination: "/sponsor.html",
      source: SPONSOR_PAGE_PATH,
    });
    // Before the catch-all, or the catch-all answers first and wins.
    expect(vercel.rewrites[0]?.source).toBe(SPONSOR_PAGE_PATH);
  });

  it("is left open to crawlers, since it is the only page with prose in it", () => {
    expect(readFileSync("public/robots.txt", "utf8")).toContain(
      `Allow: ${SPONSOR_PAGE_PATH}`,
    );
  });

  it("states no traffic number, having promised not to", () => {
    // The page says out loud that it will not quote numbers it cannot prove.
    // This is that promise, held to the file rather than to good intentions:
    // any count of visits, views or users appearing here breaks the build.
    expect(page).not.toMatch(
      /[\d,]+\s*(?:visitors?|views?|impressions?|users?|monthly)/iu,
    );
  });
});
