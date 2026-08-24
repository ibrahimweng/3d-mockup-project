/**
 * One shared "open the palette" signal.
 *
 * The dialog lives in the canvas content and the toolbar button lives in the
 * toolbar, which are separate subtrees with no common provider between them.
 * Rather than invent a context that would have to be threaded through the
 * composition to join them, both talk to this: the dialog listens, anything
 * that wants to open it calls.
 */
const quickActionOpenListeners = new Set<() => void>();

export function openQuickActions(): void {
  for (const listener of [...quickActionOpenListeners]) listener();
}

export function subscribeToQuickActionOpen(listener: () => void): () => void {
  quickActionOpenListeners.add(listener);
  return () => {
    quickActionOpenListeners.delete(listener);
  };
}
