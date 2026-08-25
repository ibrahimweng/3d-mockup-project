import { quickActionsSignal } from "../guide/open-signal";

/**
 * One shared "open the palette" signal.
 *
 * The dialog lives in the canvas content and the toolbar button lives in the
 * toolbar, which are separate subtrees with no common provider between them.
 * Both talk to this: the dialog listens, anything that wants to open it calls.
 */
export function openQuickActions(): void {
  quickActionsSignal.open();
}

export function subscribeToQuickActionOpen(listener: () => void): () => void {
  return quickActionsSignal.subscribe(listener);
}
