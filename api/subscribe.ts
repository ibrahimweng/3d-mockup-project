import { handleSubscribe } from "../src/signup/handlers";

/**
 * The signup endpoint, and the reason it exists at all.
 *
 * This site is otherwise static, which means everything it ships is public:
 * a database credential in the bundle is a credential anyone can read out of
 * devtools. This function is the one place that holds it, so the browser posts
 * an address here and never touches the store itself.
 *
 * Edge rather than Node because the store is reached over HTTP, so there is no
 * TCP driver to load and nothing to keep warm.
 */
export const config = { runtime: "edge" };

export default async function handler(request: Request): Promise<Response> {
  return handleSubscribe(request, process.env);
}
