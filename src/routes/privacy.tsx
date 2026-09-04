import * as React from "react";

/**
 * What this studio does with what it is given.
 *
 * Written from what the code actually does rather than from a template. Every
 * claim here is checkable: there are exactly two calls in the app that reach a
 * server, `/api/subscribe` and `/api/emails`, and no route anywhere accepts a
 * file — which is what makes the first section true rather than reassuring.
 *
 * Kept as a page in the app instead of a hosted document so it moves with the
 * code. If the app ever starts sending something somewhere, the note that says
 * it does not is in the same repository as the change.
 */

/** Where a removal request goes. One place, so it is one line to change. */
const CONTACT = "ibrahimweng0@gmail.com";
const OPERATOR = "Mockup Studio";

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
          If you choose to give an email address at the export prompt, we store
          three things: the address, the date we first saw it, and the fact that
          it came from that prompt. Nothing else — no name, no location, no
          record of what you designed.
        </p>
        <p>
          We use it for one purpose: to tell you when new products, finishes and
          templates are added. We do not sell it, rent it, or share it with
          anyone.
        </p>
        <p>
          Giving it is optional. You can skip the prompt and export anyway, and
          everything on this site works the same either way.
        </p>
      </Section>

      <Section title="No tracking, no analytics, no cookies">
        <p>
          There are no analytics, no advertising, and no third-party trackers.
          Nothing follows you between visits.
        </p>
        <p>
          Your browser stores a few small notes locally so the studio behaves
          sensibly — whether you have seen the welcome, whether you have already
          given an address. Those stay on your device and are never sent
          anywhere.
        </p>
      </Section>

      <Section title="Where the address is kept">
        <p>
          In a database hosted by Upstash, reachable only with a credential held
          on the server. It is never included in anything your browser
          downloads, so nobody visiting this site can read the list.
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
