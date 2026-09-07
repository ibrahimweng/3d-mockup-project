import { handleSponsorSlot } from "../src/sponsor/handlers";

/**
 * The sponsor slot, as the studio sees it.
 *
 * The only thing on this endpoint is who has bought the corner today, the
 * bytes of their logo, and a counter that goes up when the card is pressed.
 * It reads no cookie and sets none, and nothing about the person asking is
 * stored, which is why the logo is served from here rather than linked from
 * the sponsor's own server: a request that is never made cannot be logged by
 * anybody.
 *
 * Edge rather than Node because the store is reached over HTTP, so there is no
 * TCP driver to load and nothing to keep warm.
 */
export const config = { runtime: "edge" };

export default async function handler(request: Request): Promise<Response> {
  return handleSponsorSlot(request, process.env);
}
