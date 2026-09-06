/**
 * Whether a keystroke belongs to whatever the person is typing into.
 *
 * Shared rather than written twice, which is how the fault this now guards
 * against got in. The studio's own shortcuts had this check and the export gate
 * did not, and the gate listens first, in the capture phase on the window. So
 * the gate answered Ctrl-E before the handler that knew to stand down ever saw
 * it. On a Mac, Ctrl-E moves the cursor to the end of the line in every text
 * field there is, so typing an email address or a hex colour and reaching for
 * the end of it opened the export dialog.
 *
 * One copy means the two cannot disagree again. Anything that listens on the
 * window for a bare key has to ask this first.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  // A range input is a slider, not a field: the arrows are its own and it
  // handles them itself, so this only has to stay out of text entry.
  if (tag === "INPUT") return (target as HTMLInputElement).type !== "range";
  return tag === "TEXTAREA" || tag === "SELECT";
}
