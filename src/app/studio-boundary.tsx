import * as React from "react";

/**
 * The last thing between a thrown error and a white page.
 *
 * There was no error boundary anywhere in this app, which meant any throw
 * during a render unmounted the whole tree. React does that deliberately, on
 * the reasoning that a half-rendered interface is worse than none, and it is
 * right about that and wrong about what to leave behind: an empty document
 * with no text in it tells the person nothing and tells us nothing either.
 *
 * This does not try to recover. The studio is one canvas and one renderer, so
 * there is no reduced version of it to fall back to. What it does is say that
 * something broke, say that the work is still in the browser, and offer the one
 * action that ever helps, which is loading the page again.
 *
 * A class, because an error boundary can only be a class. React has no hook for
 * this and has said it does not intend to add one.
 */

type BoundaryState = { readonly failed: boolean };

export class StudioBoundary extends React.Component<
  { children: React.ReactNode },
  BoundaryState
> {
  override state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  override componentDidCatch(error: unknown): void {
    // Loudly, and to the console rather than anywhere else. There is no
    // reporting service in this app and adding one would mean sending
    // something about a person's session to somebody, which is the one thing
    // the privacy note promises does not happen.
    console.error("The studio stopped", error);
  }

  override render(): React.ReactNode {
    if (!this.state.failed) return this.props.children;

    return (
      <main className="flex h-dvh w-full items-center justify-center bg-[color:var(--background)] p-6 text-[color:var(--foreground)]">
        <div className="flex max-w-sm flex-col gap-3">
          <h1 className="text-base font-medium">The studio stopped.</h1>
          <p className="text-sm leading-relaxed text-[color:color-mix(in_oklab,var(--foreground)_70%,transparent)]">
            Something went wrong that we did not plan for. Loading the page again
            usually clears it.
          </p>
          <p className="text-sm leading-relaxed text-[color:color-mix(in_oklab,var(--foreground)_55%,transparent)]">
            Whatever you uploaded is still on this machine. There is no server in
            this app for it to have gone to.
          </p>
          <div>
            <button
              className="rounded-md border border-[color:var(--border)] px-3 py-1.5 text-sm hover:bg-[color:var(--muted)]"
              onClick={() => window.location.reload()}
              type="button"
            >
              Reload the studio
            </button>
          </div>
        </div>
      </main>
    );
  }
}
