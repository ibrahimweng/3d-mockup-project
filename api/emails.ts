import { handleAdminList } from "../src/signup/handlers";

/**
 * Reading the list back, behind a password checked here and nowhere else.
 *
 * A check the browser performs is a check anyone can skip by not running it,
 * so the admin page posts what was typed and this decides. It answers POST
 * only: a password in a query string ends up in server logs, browser history
 * and every referrer header the page sends.
 */
export const config = { runtime: "edge" };

export default async function handler(request: Request): Promise<Response> {
  return handleAdminList(request, process.env);
}
