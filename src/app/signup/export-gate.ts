import { isTypingTarget } from "../typing-target";
import {
  hasGivenEmail,
  hasSkippedEmailAsk,
  isAutomatedSession,
} from "./signup-storage";

/**
 * Standing between the export button and the export.
 *
 * The runtime owns Export PNG and Export Video outright — they are typed export
 * roles it runs itself, and `onPanelAction` is only ever handed the actions the
 * product owns. There is no press to handle and no hook to refuse from. So the
 * press is caught in the capture phase on `document`, which is an ancestor of
 * the root React attaches its listeners to: stopping it there means React never
 * dispatches, and the runtime never learns the button was pressed.
 *
 * Everything about this is built to fail open. A press is only ever swallowed
 * when this is certain it recognised an export button and certain the gate is
 * armed; anything unexpected lets the click through. The failure that matters
 * is not an ungated export, it is a person who cannot export at all.
 */

const exportButtonLabels = ["Export PNG", "Export Video"] as const;

export type ExportLabel = (typeof exportButtonLabels)[number];

export function readExportLabel(text: string | null | undefined): ExportLabel | null {
  const trimmed = (text ?? "").trim();
  return exportButtonLabels.find((label) => label === trimmed) ?? null;
}

/**
 * Whether this press should be held, given everything known about it.
 *
 * Split out from the listener so the rule is readable and testable without a
 * DOM: the suite runs in node, and "does a click get swallowed" is a decision
 * before it is an event.
 */
export function shouldHoldExport({
  automated,
  given,
  releasing,
  skipped,
}: {
  automated: boolean;
  given: boolean;
  releasing: boolean;
  skipped: boolean;
}): boolean {
  // `releasing` is this module pressing the button itself, on the far side of
  // the gate. Holding that would be holding the door against ourselves.
  //
  // `skipped` is someone who has already said no once in this sitting. The
  // question is worth asking again on their next visit and is not worth asking
  // again on their next export.
  return !releasing && !automated && !given && !skipped;
}

/**
 * Whether this keystroke is the export shortcut and is meant for the studio.
 *
 * `typing` is the half that was missing, and it was missing here alone. The
 * studio's own shortcut handler in `guide/keyboard-shortcuts.ts` has always
 * stood down while somebody is in a field. This one listens in the capture
 * phase on the window, so it runs first and cancels the event, and the handler
 * that knew better never saw it.
 *
 * What that cost is worst on a Mac, where Ctrl-E is the system binding for
 * moving the cursor to the end of a line in every text field. Reaching for the
 * end of a half-typed email address opened the export dialog on top of it. The
 * two now ask the same shared question.
 *
 * Split from the listener for the same reason `shouldHoldExport` is: the suite
 * runs in node, and this is a decision before it is an event.
 */
export function isExportShortcut({
  altKey,
  ctrlKey,
  key,
  metaKey,
  shiftKey,
  typing,
}: {
  altKey: boolean;
  ctrlKey: boolean;
  key: string;
  metaKey: boolean;
  shiftKey: boolean;
  typing: boolean;
}): boolean {
  if (typing) return false;
  if (key.toLowerCase() !== "e") return false;
  if (!(metaKey || ctrlKey)) return false;
  // Every other modifier belongs to some other shortcut, here or in the
  // browser, and claiming those would be taking keys that are not ours.
  return !altKey && !shiftKey;
}

/** True while the gate is letting an export through, so it does not re-catch it. */
let releasing = false;

/**
 * Press the export the panel already owns.
 *
 * The same approach the quick-action palette takes, and for the same reason:
 * exports live with the controls panel, which holds the render host and the
 * scene-export visibility they need. Reaching around it from product code would
 * be a second export path beside the button, and two paths is one too many.
 */
export function releaseExport(label: ExportLabel, root: ParentNode = document): boolean {
  releasing = true;
  try {
    for (const button of root.querySelectorAll<HTMLButtonElement>("button")) {
      if (button.disabled) continue;
      if (readExportLabel(button.textContent) === label) {
        button.click();
        return true;
      }
    }
    return false;
  } finally {
    releasing = false;
  }
}

function findExportButton(target: EventTarget | null): ExportLabel | null {
  if (!(target instanceof Element)) return null;
  const button = target.closest("button");
  return button && !button.disabled ? readExportLabel(button.textContent) : null;
}

/**
 * Catch the press, and the shortcut that does the same thing.
 *
 * Ctrl-E and Cmd-E export too, and a gate the keyboard walks around is a gate
 * anyone finds by accident and then tells other people about. The one place it
 * lets the keyboard past is a field somebody is typing in, which was never a
 * way around the gate and was only ever a way to interrupt them.
 */
export function installExportGate(onHold: (label: ExportLabel) => void): () => void {
  const armed = (): boolean =>
    shouldHoldExport({
      automated: isAutomatedSession(),
      given: hasGivenEmail(),
      releasing,
      skipped: hasSkippedEmailAsk(),
    });

  const onClick = (event: MouseEvent): void => {
    if (!armed()) return;
    const label = findExportButton(event.target);
    if (!label) return;

    event.preventDefault();
    event.stopPropagation();
    // Both, because React's listener sits on the root container while other
    // capture listeners may sit on document beside this one.
    event.stopImmediatePropagation();
    onHold(label);
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!armed()) return;
    const wanted = isExportShortcut({
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      // Missing on a few synthetic events, and this runs on every keystroke in
      // the page, so a throw here would stop somebody typing at all.
      key: event.key ?? "",
      metaKey: event.metaKey,
      shiftKey: event.shiftKey,
      typing: isTypingTarget(event.target),
    });
    if (!wanted) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    onHold("Export PNG");
  };

  document.addEventListener("click", onClick, true);
  window.addEventListener("keydown", onKeyDown, true);

  return () => {
    document.removeEventListener("click", onClick, true);
    window.removeEventListener("keydown", onKeyDown, true);
  };
}
