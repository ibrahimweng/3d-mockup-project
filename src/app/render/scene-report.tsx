import * as React from "react";

import { Button } from "@/toolcraft/ui/components/primitives";

import { DEVICE_OPTIONS } from "../product-domain";
import { retryScene, useSceneStatus } from "./scene-status";

/**
 * What the studio says while it is loading, and when it cannot.
 *
 * Three states and nothing on screen for the fourth, which is the ordinary one.
 * A studio that is working says nothing, because a picture that is finished is
 * the whole message.
 *
 * It sits over the canvas rather than in the panel. The panel already reads the
 * new product the moment it is chosen, so the panel is the thing that is ahead
 * of the truth. The canvas is the thing that is behind it, and that is where
 * someone is looking while they wait.
 */

/** The name a person picked, rather than the id the renderer works in. */
function readProductLabel(device: string): string {
  return DEVICE_OPTIONS.find((option) => option.value === device)?.label ?? "product";
}

const surface =
  "floating-popup-surface pointer-events-auto flex flex-col gap-3 rounded-2xl border p-4 text-[color:var(--popover-foreground)] shadow-2xl";

function Frame({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div
      className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center p-6"
      data-slot="mockup-scene-report"
    >
      {children}
    </div>
  );
}

export function SceneReport(): React.JSX.Element | null {
  const status = useSceneStatus();

  if (status.kind === "ready") return null;

  if (status.kind === "unavailable") {
    return (
      <Frame>
        <aside
          aria-live="assertive"
          className={`${surface} max-w-sm`}
          data-slot="mockup-scene-unavailable"
          role="alert"
        >
          <h2 className="text-sm font-medium text-[color:var(--foreground)]">
            This browser cannot draw 3D.
          </h2>
          <p className="text-xs leading-relaxed text-[color:color-mix(in_oklab,var(--popover-foreground)_70%,transparent)]">
            The studio needs WebGL, and this browser is not giving it to us.
            Turning on hardware acceleration in the browser's settings fixes it
            most of the time. Otherwise try a different browser, or the same one
            on another machine.
          </p>
          <p className="text-xs leading-relaxed text-[color:color-mix(in_oklab,var(--popover-foreground)_55%,transparent)]">
            Nothing you have uploaded has gone anywhere. There is no server here
            to send it to.
          </p>
        </aside>
      </Frame>
    );
  }

  const product = readProductLabel(status.device);

  if (status.kind === "failed") {
    return (
      <Frame>
        <aside
          aria-live="assertive"
          className={`${surface} max-w-sm`}
          data-slot="mockup-scene-failed"
          role="alert"
        >
          <h2 className="text-sm font-medium text-[color:var(--foreground)]">
            The {product} did not load.
          </h2>
          <p className="text-xs leading-relaxed text-[color:color-mix(in_oklab,var(--popover-foreground)_70%,transparent)]">
            Its model file did not arrive, which is usually the connection
            rather than anything you did. What is on screen is the product you
            had before.
          </p>
          <div className="flex justify-end">
            <Button
              data-slot="mockup-scene-retry"
              onClick={retryScene}
              size="sm"
              variant="secondary"
            >
              Try again
            </Button>
          </div>
        </aside>
      </Frame>
    );
  }

  return (
    <Frame>
      <aside
        aria-live="polite"
        className={`${surface} flex-row items-center gap-3 px-4 py-3`}
        data-slot="mockup-scene-loading"
        role="status"
      >
        {/*
          * A ring rather than a percentage. The model arrives over one request
          * with no progress to report until it is finished, so a number here
          * would be a number we made up.
          */}
        <span
          aria-hidden="true"
          className="size-4 shrink-0 animate-spin rounded-full border-2 border-[color:color-mix(in_oklab,var(--popover-foreground)_25%,transparent)] border-t-[color:var(--primary)] motion-reduce:animate-none"
        />
        <span className="text-xs text-[color:color-mix(in_oklab,var(--popover-foreground)_80%,transparent)]">
          Loading the {product}…
        </span>
      </aside>
    </Frame>
  );
}
