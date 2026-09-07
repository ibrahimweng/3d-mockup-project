import { handleSponsorAdmin } from "../src/sponsor/handlers";

/**
 * Selling the slot: the bookings, adding one, and taking one down.
 *
 * Behind the same password as the email list, checked here and nowhere else,
 * because a check the browser performs is a check anyone can skip by not
 * running it. It answers POST only: a password in a query string ends up in
 * server logs, browser history and every referrer header the page sends.
 */
export const config = { runtime: "edge" };

export default async function handler(request: Request): Promise<Response> {
  return handleSponsorAdmin(request, process.env);
}
