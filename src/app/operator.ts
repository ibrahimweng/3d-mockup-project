/**
 * Who runs this, and where to write to them.
 *
 * The privacy note reads it from here, where it is how somebody asks for their
 * address to be taken off the list. The sponsorship page at `/sponsor` shows it
 * too, and that page is static HTML in `public/`, so it cannot import this.
 * `sponsor-page.test.ts` holds the two to each other instead, which is the only
 * thing that can across a language boundary.
 */

export const OPERATOR_NAME = "Mockup Studio";

export const OPERATOR_EMAIL = "ibrahimweng0@gmail.com";
