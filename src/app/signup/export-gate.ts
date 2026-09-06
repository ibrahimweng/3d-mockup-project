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
 * anyone finds by accident and then tells other people about.
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
    if (event.key.toLowerCase() !== "e" || !(event.metaKey || event.ctrlKey)) return;
    if (event.altKey || event.shiftKey) return;

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
