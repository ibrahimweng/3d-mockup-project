import * as React from "react";

import type { ToolcraftCommand } from "@/toolcraft/runtime";
import { useToolcraftDispatch } from "@/toolcraft/runtime/react";

import { activateQuickActionPanelButton } from "../quick-actions/quick-action-reveal";
import { isTypingTarget } from "../typing-target";

/*
 * Space is play/pause and the arrows nudge the device, both of which would be
 * infuriating while typing a canvas width or a hex colour. Every shortcut here
 * stands down when the focus is in a field, and `isTypingTarget` is the one
 * copy of that rule, shared with the export gate that listens in front of it.
 */

/** How far one arrow press moves the device, as a percentage of its own size. */
const nudgeStep = 1;
const nudgeStepWithShift = 10;

const nudgeTargets: Readonly<Record<string, { axis: string; sign: number }>> = {
  ArrowDown: { axis: "device.positionY", sign: -1 },
  ArrowLeft: { axis: "device.positionX", sign: -1 },
  ArrowRight: { axis: "device.positionX", sign: 1 },
  ArrowUp: { axis: "device.positionY", sign: 1 },
};

/**
 * The keys an experienced user expects, and a beginner never has to learn.
 *
 * Everything here is reachable by pointer somewhere else in the app; none of
 * it is the only way to do anything.
 */
export function useMockupKeyboardShortcuts(values: Record<string, unknown>): void {
  const dispatch = useToolcraftDispatch();
  // Read through a ref so the listener is attached once rather than rebound on
  // every value change, which would be every frame of a drag.
  const valuesRef = React.useRef(values);
  valuesRef.current = values;

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (isTypingTarget(event.target)) return;
      /*
       * The canvas owns the arrows while it has focus, and it turns the
       * product with them. These move it across the frame instead, and one
       * pair of keys cannot do both jobs at once.
       *
       * Said here rather than left to the canvas stopping the event on its way
       * past. That would work today and is exactly the arrangement that let
       * the export gate answer Ctrl-E over the top of this handler: a rule
       * that only holds because of which listener runs first is a rule nobody
       * can read.
       */
      if (event.target instanceof HTMLCanvasElement) return;
      const accel = event.metaKey || event.ctrlKey;

      if (accel && event.key.toLowerCase() === "e") {
        event.preventDefault();
        activateQuickActionPanelButton("Export PNG");
        return;
      }
      if (accel || event.altKey) return;

      // Space is play/pause and belongs to the timeline, which owns it now.
      // It used to be dispatched from here, and it did not work: the panel
      // stands its clock down while the pointer is over it, so pressing space
      // with the mouse anywhere near the timeline flipped the transport to
      // Playing and left the playhead where it was. Clearing that hover pause
      // needs the panel's own state, which product code cannot reach.
      if (event.key === " " || event.code === "Space") {
        return;
      }

      const nudge = nudgeTargets[event.key];
      if (nudge) {
        event.preventDefault();
        const current = Number(valuesRef.current[nudge.axis]);
        const base = Number.isFinite(current) ? current : 0;
        const step = event.shiftKey ? nudgeStepWithShift : nudgeStep;
        const command: ToolcraftCommand = {
          // Grouped, so holding an arrow down collapses into one undo step
          // rather than fifty.
          historyGroup: `nudge-${nudge.axis}`,
          label: "Nudge device",
          target: nudge.axis,
          type: "controls.setValue",
          value: base + nudge.sign * step,
        };
        dispatch(command);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [dispatch]);
}
