import * as React from "react";

import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/toolcraft/ui/components/composites";

import { guideTopics, type GuideTopic } from "./guide-content";
import { useBodyPortalContainer } from "./portal-to-body";
import { useOutsideDismiss } from "./use-outside-dismiss";

export const guideDialogSelector = '[data-slot="mockup-guide"]';

function GuideSection({ topic }: { topic: GuideTopic }): React.JSX.Element {
  return (
    <section className="flex flex-col gap-2" data-guide-topic={topic.id}>
      <div className="flex flex-col gap-0.5">
        <h3 className="font-medium text-[color:var(--foreground)] text-sm">{topic.title}</h3>
        <p className="text-[color:var(--muted-foreground)] text-xs leading-relaxed">
          {topic.blurb}
        </p>
      </div>
      <ul className="flex flex-col gap-1.5">
        {topic.steps.map((step) => (
          <li className="flex flex-col gap-0.5" key={step.action}>
            <span className="text-[color:var(--foreground)] text-xs font-medium">
              {step.action}
            </span>
            {step.detail === undefined ? null : (
              <span className="text-[color:var(--muted-foreground)] text-xs leading-relaxed">
                {step.detail}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function GuideDialog({
  onOpenChange,
  open,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}): React.JSX.Element {
  const portalContainer = useBodyPortalContainer();
  const close = React.useCallback(() => onOpenChange(false), [onOpenChange]);
  useOutsideDismiss(open, guideDialogSelector, close);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="max-h-[80vh] sm:max-w-2xl"
        data-slot="mockup-guide"
        portalContainer={portalContainer}
        layout="sections"
        /*
         * Pointer events stop here. A portal bubbles through the React tree,
         * not the DOM one, and this is mounted inside the canvas content — so
         * without this a press travels on into the preview's handlers, which
         * claim the pointer with `setPointerCapture`. The release then belongs
         * to the canvas, no click is synthesised, and a press meant for this
         * surface turns the device behind it.
         */
        onPointerDown={(event) => event.stopPropagation()}
        onPointerMove={(event) => event.stopPropagation()}
        onPointerUp={(event) => event.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle>How to use Mockup Studio</DialogTitle>
          <DialogDescription>
            Everything here is optional. Pick a device, drop in a screenshot, and export —
            the rest is for when you want more control.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {/*
            Two columns on a wide dialog, because the whole point is that a
            person can find the one thing they came for without reading the
            rest. A single tall column makes that a scroll hunt.
          */}
          <div className="grid gap-6 sm:grid-cols-2">
            {guideTopics.map((topic) => (
              <GuideSection key={topic.id} topic={topic} />
            ))}
          </div>
          {/*
            Findable by someone who has not pressed Export, which is the only
            other place it is linked from.
          */}
          <p className="pt-6 text-xs text-[color:color-mix(in_oklab,var(--foreground)_55%,transparent)]">
            Your designs never leave your browser.{" "}
            <a
              className="underline underline-offset-2 hover:text-[color:var(--foreground)]"
              href="/privacy"
              rel="noreferrer"
              target="_blank"
            >
              Privacy
            </a>
          </p>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
