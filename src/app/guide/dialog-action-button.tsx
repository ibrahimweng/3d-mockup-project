import * as React from "react";

import { Button } from "@/toolcraft/ui/components/primitives";

/**
 * A button inside a dialog that actually responds to being pressed.
 *
 * Measured on a real mouse click: `pointerdown` lands on the button, but by
 * `pointerup` the dialog has stopped hit-testing and the release lands on the
 * page underneath. The two targets differ, so the browser synthesises no
 * `click`, and an ordinary `onClick` never runs. It is the same fault that
 * made every row of the quick action palette dead, and it affects any button
 * inside any dialog here.
 *
 * So the press is the activation. Keyboard still arrives as a click, and the
 * guard makes sure one gesture cannot fire the action twice on a platform
 * where both do come through.
 */
export function DialogActionButton({
  children,
  onActivate,
  variant,
}: {
  children: React.ReactNode;
  onActivate: () => void;
  variant?: React.ComponentProps<typeof Button>["variant"];
}): React.JSX.Element {
  const firedRef = React.useRef(false);
  const activate = React.useCallback(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    onActivate();
  }, [onActivate]);

  return (
    <Button
      onClick={activate}
      onPointerDown={(event) => {
        // Touch keeps the ordinary path: a press there may be the start of a
        // scroll rather than a decision.
        if (event.pointerType === "touch") return;
        event.preventDefault();
        activate();
      }}
      variant={variant}
    >
      {children}
    </Button>
  );
}
