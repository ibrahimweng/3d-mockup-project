import * as React from "react";
import { createPortal } from "react-dom";

import { useExportGateOpen } from "../signup/gate-visibility";
import { SPONSOR_PAGE_PATH, SPONSOR_PRICE } from "./sponsor-terms";
import { useTourShowing } from "../tour/tour-visibility";
import { reportSponsorClick, useSponsorSlot } from "./use-sponsor-slot";

/**
 * The one thing in this studio anybody pays for.
 *
 * A card in the top-left corner, about the size of a business card, holding
 * one sponsor's logo and one line. It is sold by the period rather than by the
 * impression: somebody buys the corner for a month or two, their card is the
 * only thing in it for those days, and it comes down on its own when the last
 * day is over because the server stops serving it.
 *
 * There is no ad network here and no third party of any kind. No script is
 * loaded from anywhere, nothing is auctioned, and the logo is served from this
 * site's own domain. That is what makes this the one kind of advertising that
 * can live on a page whose privacy note promises that nothing about the person
 * looking at it goes anywhere: the sponsor is told how many people pressed
 * their card and is never told anything about any of them.
 *
 * It is also why it can sit beside a live 3D render at all. The reason this app
 * had no ads was that a real ad slot means someone else's JavaScript running
 * next to a WebGL canvas, competing for the same frame. This is an image and an
 * anchor. It costs one request on load and nothing after it.
 *
 * Top left, which is the one corner of this window that nothing else claims.
 * The controls panel is down the right side, the toolbar floats along the
 * bottom of the canvas, and the timeline takes a band under all of it. The
 * bottom-left corner looks free and is not: a card six from the bottom of the
 * window sits over the timeline band, because the band is below the canvas
 * rather than over it. Measured at 1280 by 800, where it covered the transport.
 *
 * Above the panel and inside the panel were both considered and both refused.
 * There is no room above it: measured at 1280 by 800, the panel is 300 wide and
 * its own top edge is 10 pixels from the top of the window, so a card over it
 * would cover the panel's title. Inside it is worse in a way that is not about
 * space. The panel is a runtime surface this product may not hand-compose, a
 * card added to it would scroll away with the controls and vanish when somebody
 * changed tab, and an advertisement sitting in the tool's own controls reads as
 * one of the tool's own features.
 *
 * Three rules hold it in its place:
 *
 * It never appears in an export. The exported picture is drawn from the scene
 * by the export renderer, not captured from the screen, so nothing in the DOM
 * can reach it. Somebody's product shot cannot come out with an advertisement
 * printed in the corner.
 *
 * It gets out of the way of the two things that matter more. The export gate is
 * holding a file somebody asked for, and the first-run tour is teaching
 * somebody how to use the studio. Neither is a moment to sell into.
 *
 * It says what it is. The word "Sponsored" is on it before the logo, and the
 * link carries `rel="sponsored"`, which is the same statement made to a search
 * engine. An advertisement that has to be worked out is a trick.
 */

/**
 * 288 wide, which is the width the operator asked for after seeing 224.
 *
 * The width is what a sponsor is buying, because a logo is a wide shape and
 * height is the dimension it cannot use. Sixty-four more pixels across is
 * another quarter of a logo at the same height, on a card that is still under a
 * quarter of a 1280 window and still narrower than the 300-wide panel opposite
 * it.
 */
const cardClassName =
  "floating-popup-surface pointer-events-auto fixed top-4 left-4 z-40 flex w-72 flex-col gap-1 rounded-xl border p-2.5 text-[color:var(--popover-foreground)] no-underline shadow-2xl transition-opacity hover:opacity-95";

const labelClassName =
  "font-mono text-[10px] uppercase tracking-wide text-[color:color-mix(in_oklab,var(--popover-foreground)_50%,transparent)]";

const lineClassName =
  "text-[11px] leading-snug text-[color:color-mix(in_oklab,var(--popover-foreground)_72%,transparent)]";

/**
 * What the corner says on a day nobody has bought it.
 *
 * An empty slot that shows nothing sells nothing, so on those days the card is
 * the advertisement for itself.
 *
 * It goes to `/sponsor` rather than opening a mail message, which is the fix
 * for two faults in the same link. A `mailto:` does nothing at all on a machine
 * with no mail program set up, so the interested person simply disappears. And
 * the ones it does work for have to compose a message knowing nothing: not the
 * price, not the size of the logo, not what happens if it goes wrong. The page
 * answers all of that before anybody has to ask, and the mail address is on it.
 */
function ForSaleCard(): React.JSX.Element {
  return (
    <a
      className={cardClassName}
      data-slot="mockup-sponsor-card"
      data-sponsor-state="for-sale"
      href={SPONSOR_PAGE_PATH}
    >
      <span className={labelClassName}>This spot is for sale</span>
      <span className="text-[color:var(--foreground)] text-xs font-medium">
        Put your brand here
      </span>
      <span className={lineClassName}>
        One sponsor at a time, {SPONSOR_PRICE}. See how it works.
      </span>
    </a>
  );
}

export function SponsorBox(): React.JSX.Element | null {
  const { settled, sponsor } = useSponsorSlot();
  const gateOpen = useExportGateOpen();
  const tourShowing = useTourShowing();

  /*
   * Nothing until the answer is in.
   *
   * The alternative is showing the for-sale card first and replacing it with a
   * sponsor's a moment later, which puts an advertisement for the empty slot in
   * front of every visitor on every load of a slot that is not empty.
   */
  if (!settled || gateOpen || tourShowing) return null;

  /*
   * Portalled to the body, and this is not optional.
   *
   * The studio's canvas board is pan-and-zoomed with a CSS transform, which
   * makes it the containing block for any `position: fixed` descendant. A card
   * mounted inside it and told to sit six from the bottom of the window sits
   * six from the bottom of the board instead, which is off screen. The body is
   * outside every transform. The tour's card next door says the same thing,
   * having found it the hard way.
   */
  return createPortal(
    sponsor === null ? (
      <ForSaleCard />
    ) : (
      <a
        aria-label={`Sponsored by ${sponsor.sponsor}. Opens in a new tab.`}
        className={cardClassName}
        data-slot="mockup-sponsor-card"
        data-sponsor-state="sold"
        href={sponsor.href}
        onClick={() => reportSponsorClick(sponsor.id)}
        // `sponsored` is the honest declaration for a paid link and `nofollow`
        // is the older spelling of it, kept for anything that reads only that.
        // `noopener` is not optional on a target of `_blank`: without it the
        // page being opened is handed a reference to this one.
        rel="nofollow noopener noreferrer sponsored"
        target="_blank"
      >
        <span className={labelClassName}>Sponsored</span>
        <img
          alt={sponsor.sponsor}
          className="h-8 w-auto max-w-full self-start object-contain"
          // The card's width is fixed and the logo's height is fixed, so nothing
          // below it moves when the bytes land.
          decoding="async"
          loading="lazy"
          src={sponsor.imageUrl}
        />
        {sponsor.headline === "" ? null : (
          <span className={lineClassName}>{sponsor.headline}</span>
        )}
      </a>
    ),
    document.body,
  );
}
