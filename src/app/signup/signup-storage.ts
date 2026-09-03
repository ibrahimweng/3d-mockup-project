/**
 * Whether this browser has already been asked.
 *
 * Wrapped for the same reason the welcome card's storage is: reading storage
 * throws rather than returning null in a private window with site data blocked
 * and in an embedded webview with storage partitioned off. The two failures are
 * not equal, though, so they resolve in opposite directions — a studio that
 * cannot remember should never nag, and asking twice is worse than never
 * asking, so a failure to read means "already asked".
 *
 * This is a courtesy, not a lock. Clearing site data or opening a private
 * window asks again, and nothing here pretends otherwise: the card gates
 * nothing, so the worst a bypass wins is a second sight of it.
 */

const askedStorageKey = "mockup-studio:asked-for-email:v1";

export function hasBeenAskedForEmail(): boolean {
  try {
    return window.localStorage.getItem(askedStorageKey) === "true";
  } catch {
    return true;
  }
}

export function rememberAskedForEmail(): void {
  try {
    window.localStorage.setItem(askedStorageKey, "true");
  } catch {
    // Nothing to do. The card may show once more, which is survivable.
  }
}

/**
 * Whether a machine is driving this session.
 *
 * Every browser proof opens a fresh profile, so every proof is a first export,
 * so every proof would meet this card sitting over whatever it was about to
 * assert. An automated session is not someone to ask for an email address.
 */
export function isAutomatedSession(): boolean {
  try {
    return navigator.webdriver === true;
  } catch {
    return false;
  }
}
