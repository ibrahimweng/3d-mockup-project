import {
  matchesAdminPassword,
  readAdminPassword,
  toCsv,
} from "./admin-access";
import { describeEmailRejection, normalizeEmail } from "./email-address";
import {
  createEmailStore,
  readEmailStoreConfig,
  type EmailStore,
} from "./email-store";

/**
 * The two endpoints, as functions of a request rather than of a platform.
 *
 * They take a `Request` and return a `Response`, so the files under `api/` are
 * one line each and everything worth testing is here — where the repository's
 * own checks and `vitest run src` reach it, which nothing under `api/` is.
 */

/** Generous for a person, small enough that nobody posts a payload. */
const maxBodyBytes = 2_048;
const rateWindowSeconds = 60 * 60;
const maxSignupsPerCallerPerWindow = 20;

type Env = Readonly<Record<string, string | undefined>>;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json",
    },
    status,
  });
}

/**
 * The body, whether it arrived as JSON or as a submitted form.
 *
 * Both, because the CSV download is a real `<form method="post">`: letting the
 * browser navigate to the endpoint is what makes the server the thing handing
 * over the file, rather than product code building a blob and clicking an
 * invisible link — which the repository forbids, and rightly, since delivery is
 * the runtime's to own.
 */
async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  const text = await request.text();
  if (text.length > maxBodyBytes) return null;

  if (
    request.headers
      .get("content-type")
      ?.includes("application/x-www-form-urlencoded")
  ) {
    return Object.fromEntries(new URLSearchParams(text));
  }

  try {
    const value: unknown = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * Who is calling, as well as a serverless function can know.
 *
 * The header is set by the platform in front of the function and is not
 * something a caller can forge on Vercel; behind any other proxy it would be,
 * which is why it only ever feeds a rate limit and never an identity.
 */
function callerKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for") ?? "";
  return forwarded.split(",")[0]?.trim() || "unknown";
}

function storeFor(env: Env, fetchImpl: typeof globalThis.fetch): EmailStore | null {
  const config = readEmailStoreConfig(env, fetchImpl);
  return config ? createEmailStore(config) : null;
}

export async function handleSubscribe(
  request: Request,
  env: Env,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<Response> {
  if (request.method !== "POST") return json({ error: "Use POST." }, 405);

  const store = storeFor(env, fetchImpl);
  // Loudly, not quietly: a form that accepts every address and stores none
  // looks exactly like one that works, and would lose every signup silently.
  if (!store) return json({ error: "Signup is not configured." }, 503);

  const body = await readBody(request);
  if (!body) return json({ error: "Send a small JSON object." }, 400);

  // A field a person never sees and a bot fills in. Answered with the same
  // success a real signup gets, because telling a bot it was caught is telling
  // it what to change.
  if (typeof body.website === "string" && body.website.trim() !== "") {
    return json({ status: "already-known" }, 200);
  }

  const normalized = normalizeEmail(body.email);
  if (!normalized.ok) {
    return json({ error: describeEmailRejection(normalized.reason) }, 400);
  }

  const calls = await store.countRecentCalls(callerKey(request), rateWindowSeconds);
  if (calls > maxSignupsPerCallerPerWindow) {
    return json({ error: "Too many signups from here. Try later." }, 429);
  }

  const status = await store.add({
    email: normalized.email,
    firstSeen: new Date().toISOString(),
    source: typeof body.source === "string" ? body.source.slice(0, 32) : "unknown",
  });

  return json({ status }, 200);
}

export async function handleAdminList(
  request: Request,
  env: Env,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<Response> {
  // POST rather than GET so the password is never in a URL, where it would be
  // written into server logs, browser history and any referrer header.
  if (request.method !== "POST") return json({ error: "Use POST." }, 405);

  const password = readAdminPassword(env);
  const store = storeFor(env, fetchImpl);
  if (!password || !store) return json({ error: "Admin is not configured." }, 503);

  const body = await readBody(request);
  if (!body || !(await matchesAdminPassword(body.password, password))) {
    return json({ error: "Wrong password." }, 401);
  }

  const records = await store.list();

  // A form submission asks for the file itself, so the response is the file:
  // the browser saves it because the header says to, and no script in the page
  // ever touches the bytes.
  if (body.format === "csv") {
    return new Response(toCsv(records), {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": 'attachment; filename="mockup-studio-emails.csv"',
        "Content-Type": "text/csv;charset=utf-8",
      },
      status: 200,
    });
  }

  return json({ csv: toCsv(records), records }, 200);
}
