/**
 * Whether this browser has already given an address.
 *
 * One flag, and it only ever gets set by a signup the server accepted. Skipping
 * does not set it: the studio asks again on the next export, which is the whole
 * shape of this — the question is asked until it is answered, and then never
 * again.
 *
 * Wrapped because reading storage throws rather than returning null in a
 * private window with site data blocked and in an embedded webview with storage
 * partitioned off. A browser that cannot remember is one where "never again"
 * cannot be honoured across visits, so the session keeps its own copy: someone
 * who signs up is not asked twice in the same sitting, even where nothing can
 * be written down. Next visit asks again, which is the honest consequence of a
 * browser that forgets.
 */

const givenStorageKey = "mockup-studio:email-given:v1";

let givenThisSession = false;

export function hasGivenEmail(): boolean {
  if (givenThisSession) return true;

  try {
    return window.localStorage.getItem(givenStorageKey) === "true";
  } catch {
    return false;
  }
}

export function rememberEmailGiven(): void {
  givenThisSession = true;

  try {
    window.localStorage.setItem(givenStorageKey, "true");
  } catch {
    // Nothing to do. The session flag above still spares them a second ask
    // today, and tomorrow is a browser that cannot remember anything.
  }
}

/**
 * Whether the ask has already been turned down in this sitting.
 *
 * A skip is not an answer, so the studio asks again on the next visit. It does
 * not ask again on the next export. Someone exporting ten variations of one
 * shot for a client is one person doing one job, and putting the same question
 * in front of them ten times reads as the studio not listening rather than as
 * the studio asking.
 *
 * Held in memory rather than in storage, which is what makes it "this sitting"
 * and not "for good". Reloading the page asks again, and so does coming back
 * tomorrow, so nothing is given up except the repetition.
 */
let skippedThisSession = false;

export function hasSkippedEmailAsk(): boolean {
  return skippedThisSession;
}

export function rememberEmailAskSkipped(): void {
  skippedThisSession = true;
}

/** For tests, which must not leak one case's storage into the next. */
export function forgetEmailGivenForTests(): void {
  givenThisSession = false;
  skippedThisSession = false;
}

/**
 * Whether a machine is driving this session.
 *
 * Every browser proof opens a fresh profile, so every proof would meet the gate
 * standing between it and the export it came to assert. An automated session is
 * not someone to ask for an email address, and a proof that has to dismiss a
 * modal before every export is a proof measuring the modal.
 */
export function isAutomatedSession(): boolean {
  try {
    return navigator.webdriver === true;
  } catch {
    return false;
  }
}
