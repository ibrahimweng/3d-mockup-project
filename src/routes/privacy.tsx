import * as React from "react";

import { OPERATOR_EMAIL, OPERATOR_NAME } from "../app/operator";

/**
 * What this studio does with what it is given.
 *
 * Written from what the code actually does rather than from a template. Every
 * claim here is checkable: the calls the app makes are counted by
 * `privacy-claims.test.ts`, they all go to this site's own endpoints, and no
 * route anywhere accepts a file — which is what makes the first section true
 * rather than reassuring.
 *
 * The sponsor card in the corner is the section that has to be got right. It is
 * the one place another company's name appears, and the whole reason it can be
 * described as collecting nothing is that no request ever leaves this domain
 * for it: the logo is served from here, no script comes from anywhere, and the
 * only thing recorded is a running total of presses with no visitor in it.
 *
 * Kept as a page in the app instead of a hosted document so it moves with the
 * code. If the app ever starts sending something somewhere, the note that says
 * it does not is in the same repository as the change.
 */

const CONTACT = OPERATOR_EMAIL;
const OPERATOR = OPERATOR_NAME;

function Section({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}): React.JSX.Element {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-medium">{title}</h2>
      <div className="flex flex-col gap-2 text-sm leading-relaxed text-[color:color-mix(in_oklab,var(--foreground)_75%,transparent)]">
        {children}
      </div>
    </section>
  );
}

export function PrivacyNote(): React.JSX.Element {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 p-8 text-[color:var(--foreground)]">
      <header className="flex flex-col gap-2">
        <h1 className="text-lg font-medium">Privacy</h1>
        <p className="text-sm text-[color:color-mix(in_oklab,var(--foreground)_60%,transparent)]">
          What {OPERATOR} collects, which is one thing, and what it does with it.
        </p>
      </header>

      <Section title="Your designs never leave your browser">
        <p>
          Everything you upload — screenshots, artwork, logos, video — is read,
          rendered and exported on your own device. None of it is uploaded
          anywhere, and there is nowhere here that could receive it: this site
          has no route that accepts a file.
        </p>
        <p>
          The picture you export is made in your browser and saved straight to
          your computer. We never see it.
        </p>
      </Section>

      <Section title="The one thing we collect">
        <p>
          The studio asks for an email address twice at most: once at the end
          of the tour on your first visit, and again when you export a picture,
          until you give one. If you choose to give it, we store three things:
          the address, the date we first saw it, and which of those two places
          you gave it. Nothing else — no name, no location, no record of what
          you designed.
        </p>
        <p>
          We use it for one purpose: to tell you when new products, finishes and
          templates are added. We do not sell it, rent it, or share it with
          anyone.
        </p>
        <p>
          Giving it is optional in both places. You can skip the tour, skip the
          export prompt, export anyway, and everything on this site works the
          same either way.
        </p>
      </Section>

      <Section title="The sponsored card in the corner">
        <p>
          One sponsor buys that corner for a period, usually a month or two, and
          their logo is the only thing in it for those days. It is sold and
          filled in by hand. There is no ad network, no auction, and no script
          from anywhere else running on this page.
        </p>
        <p>
          The logo is stored by us and served from this site, so your browser
          never contacts the sponsor unless you press the card. Nothing about
          you is sent to them, and they are not told that you were here.
        </p>
        <p>
          When you do press it, we add one to a running total of presses for
          that sponsor, so we can tell them how the month went. That total is
          all we keep: no address, no identifier, no time, nothing that could be
          traced back to you or joined to anything else.
        </p>
        <p>
          The card is part of the page and never part of your picture. Exports
          are drawn from the 3D scene, so nothing on screen around it can end up
          in the file you save.
        </p>
      </Section>

      <Section title="No tracking, no analytics, no cookies">
        <p>
          There are no analytics and no third-party trackers. Nothing follows
          you between visits. The one advertisement is the sponsored card
          described above, which is a picture and a link and nothing else.
        </p>
        <p>
          Your browser stores a few small notes locally so the studio behaves
          sensibly — whether you have been shown the tour, whether you have
          already given an address. Those stay on your device and are never sent
          anywhere. Clearing your browser's site data erases them, and the
          studio will treat you as a first-time visitor again.
        </p>
      </Section>

      <Section title="Where the address is kept">
        <p>
          In a database hosted by Upstash, reachable only with a credential held
          on the server. It is never included in anything your browser
          downloads, so nobody visiting this site can read the list. The sponsor
          bookings and their press totals sit in the same database, and hold
          nothing about anybody who visits.
        </p>
        <p>The site itself is hosted by Vercel.</p>
      </Section>

      <Section title="Removing yourself">
        <p>
          Write to{" "}
          <a
            className="underline underline-offset-2 hover:text-[color:var(--foreground)]"
            href={`mailto:${CONTACT}?subject=Remove my email`}
          >
            {CONTACT}
          </a>{" "}
          and say so. We will delete the address, and you do not have to explain
          why.
        </p>
        <p>
          You can also ask what we hold about you, which will be the address and
          the date, and nothing else. Same address, same answer time: we will
          get to it as soon as we can, and within a month at the outside.
        </p>
      </Section>

      <Section title="Changes">
        <p>
          This note lives with the code, so it changes when the app does. If
          what we collect ever changes, this page changes in the same release.
        </p>
      </Section>
    </main>
  );
}
