/**
 * The offer, in the one place both halves of it read from.
 *
 * The price appears twice: on the card in the studio, and on the page that
 * explains the deal. Those two live in different languages and different
 * folders, so nothing but a test can keep them from drifting apart, and a card
 * offering one price beside a page asking another is the first thing a buyer
 * would see. `sponsor-page.test.ts` holds the static page to what is written
 * here.
 */

/** What a month costs, worded the way the card and the page both say it. */
export const SPONSOR_PRICE = "$30 a month";

/** Where the card sends somebody who wants to know more. */
export const SPONSOR_PAGE_PATH = "/sponsor";

/**
 * How long a sponsor has to look at their card before paying for it.
 *
 * The card goes up first and the money comes after, because the alternative is
 * asking a stranger to send an irreversible payment for something they have not
 * seen. Three days is long enough to look properly and short enough that an
 * unsold slot is not standing empty for a week.
 */
export const SPONSOR_TRIAL_DAYS = 3;
