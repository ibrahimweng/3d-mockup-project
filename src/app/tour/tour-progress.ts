/**
 * Whether this browser has been walked through the studio before.
 *
 * One flag, set when the tour ends however it ends — finished, skipped, or
 * closed at the email. The tour is a first-time experience and someone who has
 * decided not to do it has decided; asking again next visit would make it an
 * interruption rather than a welcome.
 *
 * It lives in local storage, so clearing site data brings the tour back. That
 * is the intended behaviour rather than a limitation: a browser with no history
 * of this app is a first-time visitor as far as anything here can tell, and the
 * alternative — a cookie, a fingerprint, an account — is a great deal of
 * machinery to avoid showing someone a four-step tour twice.
 *
 * Every read is wrapped, because storage throws rather than returning null in a
 * private window with site data blocked and in an embedded webview with storage
 * partitioned off. A studio that will not open because it could not remember
 * whether it had been opened is a worse fault than a tour shown twice, so every
 * failure resolves to "show it".
 */

const tourStorageKey = "mockup-studio:seen-tour:v1";

export function hasSeenTour(): boolean {
  try {
    return window.localStorage.getItem(tourStorageKey) === "true";
  } catch {
    return false;
  }
}

export function rememberTourSeen(): void {
  try {
    window.localStorage.setItem(tourStorageKey, "true");
  } catch {
    // Nothing to do. The tour shows again next visit, which is survivable.
  }
}
