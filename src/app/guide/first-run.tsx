import * as React from "react";

import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/toolcraft/ui/components/composites";

import { DialogActionButton } from "./dialog-action-button";
import { firstRunSteps } from "./guide-content";
import { useBodyPortalContainer } from "./portal-to-body";
import { useOutsideDismiss } from "./use-outside-dismiss";

const firstRunStorageKey = "mockup-studio:seen-welcome:v1";
const firstRunSelector = '[data-slot="mockup-first-run"]';

/**
 * Whether this browser has been here before.
 *
 * Wrapped, because storage throws rather than returning null in a few real
 * situations — a private window with site data blocked, an embedded webview
 * with storage partitioned off. A studio that refuses to open because it could
 * not remember whether it had been opened is a worse bug than showing the
 * welcome twice, so every failure resolves to "show it".
 */
function hasSeenWelcome(): boolean {
  try {
    return window.localStorage.getItem(firstRunStorageKey) === "true";
  } catch {
    return false;
  }
}

function rememberWelcome(): void {
  try {
    window.localStorage.setItem(firstRunStorageKey, "true");
  } catch {
    // Nothing to do. The welcome shows again next time, which is survivable.
  }
}

/**
 * What a first-time visitor sees.
 *
 * Deliberately three lines and two buttons. The failure mode of a first-run
 * tour is that it becomes the thing standing between someone and the product,
 * so this names the three moves that get them to a finished picture and gets
 * out of the way. Anyone who wants more presses the other button.
 */
export function FirstRunWelcome({
  onOpenGuide,
}: {
  onOpenGuide: () => void;
}): React.JSX.Element | null {
  const [isOpen, setIsOpen] = React.useState(false);
  const portalContainer = useBodyPortalContainer();

  React.useEffect(() => {
    // Read after mount rather than during render: the same component runs in a
    // server render and in a test where `window` is not there to be asked.
    if (!hasSeenWelcome()) setIsOpen(true);
  }, []);

  const dismiss = React.useCallback(() => {
    rememberWelcome();
    setIsOpen(false);
  }, []);
  useOutsideDismiss(isOpen, firstRunSelector, dismiss);

  return (
    <Dialog
      onOpenChange={(next) => {
        if (!next) dismiss();
      }}
      open={isOpen}
    >
      <DialogContent
        className="sm:max-w-md"
        data-slot="mockup-first-run"
        portalContainer={portalContainer}
      >
        <DialogHeader>
          <DialogTitle>Make a product shot</DialogTitle>
          <DialogDescription>
            Put a screenshot on a real device, light it, and save the picture. Three steps.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <ol className="flex flex-col gap-3">
            {firstRunSteps.map((step, index) => (
              <li className="flex gap-3" key={step.action}>
                <span
                  aria-hidden="true"
                  className="mt-px flex size-5 shrink-0 items-center justify-center rounded-full bg-[color:color-mix(in_oklab,var(--foreground)_10%,transparent)] font-mono text-[11px] text-[color:var(--foreground)]"
                >
                  {index + 1}
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="text-[color:var(--foreground)] text-xs font-medium">
                    {step.action}
                  </span>
                  {step.detail === undefined ? null : (
                    <span className="text-[color:var(--muted-foreground)] text-xs leading-relaxed">
                      {step.detail}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ol>
        </DialogBody>
        <DialogFooter>
          <DialogActionButton
            onActivate={() => {
              dismiss();
              onOpenGuide();
            }}
            variant="ghost"
          >
            Show me how
          </DialogActionButton>
          <DialogActionButton onActivate={dismiss}>Start</DialogActionButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
