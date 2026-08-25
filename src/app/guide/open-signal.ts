/**
 * A "someone asked for this" signal, shared across subtrees.
 *
 * The toolbar and the surfaces it opens live in different parts of the
 * composition with no provider between them, so rather than thread a context
 * through the app shell to join them, each surface listens and anything that
 * wants to open it calls.
 */
export type ToolcraftOpenSignal = {
  readonly open: () => void;
  readonly subscribe: (listener: () => void) => () => void;
};

export function createOpenSignal(): ToolcraftOpenSignal {
  const listeners = new Set<() => void>();
  return {
    open: () => {
      // Copied before iterating: a listener may unsubscribe as it runs.
      for (const listener of [...listeners]) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export const quickActionsSignal = createOpenSignal();
export const guideSignal = createOpenSignal();
