import * as React from "react";

/**
 * What a phone gets, which is an honest sentence rather than a broken studio.
 *
 * This is a decision, not a gap. The studio is a full-window 3D canvas next to
 * a control column of about 272 pixels, and the two of them are the layout. The
 * panel, its tabs and its collapsing are owned by the Toolcraft runtime, so a
 * narrow layout is a change to the runtime rather than to this app, and this
 * app is already carrying a fork of that runtime it cannot cleanly update.
 * Building a phone layout here would deepen that fork to fix a smaller problem
 * than the fork itself.
 *
 * So the smaller problem is answered the smaller way. Someone on a phone
 * currently downloads about nine megabytes and arrives at an interface built
 * for a mouse, with no explanation. What they get instead is one screen saying
 * the studio wants a bigger one, and a way past it if they want to try anyway.
 *
 * The way past matters. This is a measurement of the window and not of the
 * device, so a narrow desktop window, a split screen and a large tablet held
 * upright all land here too, and none of them is a phone. Nobody should be
 * locked out by a guess about their hardware.
 */

/**
 * Below this the panel and the canvas cannot both be on screen.
 *
 * 720 rather than a named phone size, because it is the number the layout
 * actually breaks at: the panel is about 272 wide and the canvas needs roughly
 * as much again before the product in it is bigger than the controls beside it.
 */
const minimumWidth = 720;

const storageKey = "mockup-studio:small-screen-dismissed:v1";

function readDismissed(): boolean {
  try {
    return window.sessionStorage.getItem(storageKey) === "true";
  } catch {
    // Storage throws rather than returning null in a private window with site
    // data blocked. A note shown twice is a smaller fault than a studio that
    // will not open, so every failure resolves to "show it".
    return false;
  }
}

function rememberDismissed(): void {
  try {
    window.sessionStorage.setItem(storageKey, "true");
  } catch {
    // Nothing to do. The state below still carries this sitting.
  }
}

function useIsNarrow(): boolean {
  const subscribe = React.useCallback((listener: () => void) => {
    const query = window.matchMedia(`(max-width: ${minimumWidth - 1}px)`);
    query.addEventListener("change", listener);
    return () => query.removeEventListener("change", listener);
  }, []);

  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(`(max-width: ${minimumWidth - 1}px)`).matches,
    // A server render has no window to measure, and guessing narrow would show
    // this note in the markup every visitor is first served.
    () => false,
  );
}

/**
 * Whether to hold the studio back, and how to let it go.
 *
 * A hook rather than a flag inside the note, because the studio has to not
 * mount while the note is up. The note says nine megabytes of models is a lot
 * to ask of a phone connection, and downloading them behind it while saying so
 * would make that sentence a lie.
 */
export function useSmallScreenHold(): {
  holding: boolean;
  release: () => void;
} {
  const narrow = useIsNarrow();
  const [dismissed, setDismissed] = React.useState(true);

  // Read after mount rather than during render, because this also runs where
  // `window` is not there to be asked.
  React.useEffect(() => setDismissed(readDismissed()), []);

  const release = React.useCallback(() => {
    rememberDismissed();
    setDismissed(true);
  }, []);

  return { holding: narrow && !dismissed, release };
}

export function SmallScreenNote({
  onContinue,
}: {
  onContinue: () => void;
}): React.JSX.Element {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[color:var(--background)] p-6"
      data-slot="mockup-small-screen"
    >
      <div className="flex max-w-sm flex-col gap-3">
        <h1 className="text-base font-medium text-[color:var(--foreground)]">
          The studio wants a wider screen.
        </h1>
        <p className="text-sm leading-relaxed text-[color:color-mix(in_oklab,var(--foreground)_70%,transparent)]">
          It puts a 3D preview beside a column of controls, and below about{" "}
          {minimumWidth} pixels there is not room for both. On a laptop or a
          desktop it works the way it is meant to.
        </p>
        <p className="text-sm leading-relaxed text-[color:color-mix(in_oklab,var(--foreground)_70%,transparent)]">
          It is also several megabytes of 3D models, which is a lot to ask of a
          phone connection. None of that is downloaded until you open it.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            className="rounded-md border border-[color:var(--border)] px-3 py-1.5 text-sm hover:bg-[color:var(--muted)]"
            data-slot="mockup-small-screen-continue"
            onClick={onContinue}
            type="button"
          >
            Open it anyway
          </button>
        </div>
        <p className="text-xs leading-relaxed text-[color:color-mix(in_oklab,var(--foreground)_50%,transparent)]">
          This is a measurement of the window, not of your device. Widening the
          window is enough.
        </p>
      </div>
    </div>
  );
}
