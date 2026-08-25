import * as React from "react";

import { useToolcraftEvaluatedValues } from "@/toolcraft/runtime/react";

import { GuideSurface } from "./guide-surface";
import { useMockupKeyboardShortcuts } from "./keyboard-shortcuts";

/**
 * The product's own explaining-and-driving layer: the welcome, the help
 * screen, and the keyboard shortcuts. One component so the composition has one
 * thing to mount.
 */
export function GuideRuntime(): React.JSX.Element {
  useMockupKeyboardShortcuts(useToolcraftEvaluatedValues());
  return <GuideSurface />;
}
