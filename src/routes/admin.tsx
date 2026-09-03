import * as React from "react";

import { Button, Input } from "@/toolcraft/ui/components/primitives";
import type { SubscriberRecord } from "@/signup/email-store";

/**
 * The list of addresses, behind a password this page never checks.
 *
 * What is typed here is posted to `/api/emails` and compared there, inside a
 * serverless function, against a value that only exists in the deployment's
 * environment. That split is the whole point: a password compared in the
 * browser is a password anyone can skip by not running the comparison, and a
 * list fetched by the browser on its own authority is a list anyone can fetch.
 *
 * Nothing is remembered between visits — no token, no cookie, no local copy of
 * the password. Re-typing it is cheap and a page that keeps it is one stolen
 * laptop away from being the leak it exists to prevent.
 */
export function AdminEmails(): React.JSX.Element {
  const [password, setPassword] = React.useState("");
  const [records, setRecords] = React.useState<readonly SubscriberRecord[] | null>(null);
  const [error, setError] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);

  const load = React.useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      setIsLoading(true);
      setError("");

      try {
        const response = await fetch("/api/emails", {
          body: JSON.stringify({ password }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        });
        const body = (await response.json()) as {
          error?: string;
          records?: readonly SubscriberRecord[];
        };

        if (!response.ok) {
          setError(body.error ?? "That did not work.");
          setRecords(null);
          return;
        }

        setRecords(body.records ?? []);
      } catch {
        setError("Could not reach the server.");
      } finally {
        setIsLoading(false);
      }
    },
    [password],
  );

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-8 text-[color:var(--foreground)]">
      <header className="flex flex-col gap-1">
        <h1 className="text-lg font-medium">Collected emails</h1>
        <p className="text-sm text-[color:color-mix(in_oklab,var(--foreground)_60%,transparent)]">
          Everyone who left an address after exporting.
        </p>
      </header>

      <form className="flex items-start gap-2" onSubmit={load}>
        <Input
          aria-label="Admin password"
          autoComplete="current-password"
          className="max-w-sm"
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Admin password"
          type="password"
          value={password}
        />
        <Button disabled={isLoading || password === ""} type="submit">
          {isLoading ? "Checking…" : "Show list"}
        </Button>
      </form>

      {error ? (
        <p className="text-sm text-[color:var(--destructive)]" role="alert">
          {error}
        </p>
      ) : null}

      {records ? (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-sm">
              {records.length} {records.length === 1 ? "address" : "addresses"}
            </p>
            {records.length > 0 ? (
              /*
               * A real form submission, not a scripted download.
               *
               * Product source must not own artifact delivery — building a blob
               * and clicking an invisible link is exactly the pattern the
               * repository forbids. Posting the form navigates to the endpoint,
               * which answers with the file and a Content-Disposition header,
               * so the browser saves it and nothing in this page handles bytes.
               * The password rides in the POST body, where it is already going.
               */
              <form action="/api/emails" method="post">
                <input name="password" type="hidden" value={password} />
                <input name="format" type="hidden" value="csv" />
                <Button size="sm" type="submit" variant="outline">
                  Download CSV
                </Button>
              </form>
            ) : null}
          </div>

          {records.length === 0 ? (
            <p className="text-sm text-[color:color-mix(in_oklab,var(--foreground)_60%,transparent)]">
              Nobody has signed up yet.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-[color:var(--border)] rounded-lg border">
              {records.map((record) => (
                <li className="flex justify-between gap-4 p-3 text-sm" key={record.email}>
                  <span>{record.email}</span>
                  <span className="text-[color:color-mix(in_oklab,var(--foreground)_55%,transparent)]">
                    {record.firstSeen.slice(0, 10)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </main>
  );
}
