import { isToolcraftRuntimeOwnedTarget } from "./runtime-targets";
import type { ToolcraftControlSchema } from "./types";

export type ToolcraftControlKeyframeCapabilityReason =
  | "control-type"
  | "runtime-owned-target";

export type ToolcraftControlKeyframeCapability =
  | {
      capable: true;
      reason: "control-type";
    }
  | {
      capable: false;
      reason: ToolcraftControlKeyframeCapabilityReason;
    };

const keyframeCapableControlTypes = new Set([
  "anchorGrid",
  "channelMixer",
  "color",
  "curves",
  "gradient",
  // An orientation is a pose rather than a number, and it is here because the
  // evaluator carries one around the sphere rather than straight through it.
  // Without that it could not be listed: component-wise interpolation of a
  // direction is not an orbit, and a half turn through it is undefined.
  "orientationGizmo",
  "rangeInput",
  "rangeSlider",
  "slider",
  "vector",
]);

export function getToolcraftControlKeyframeCapability(
  control: ToolcraftControlSchema,
): ToolcraftControlKeyframeCapability {
  if (isToolcraftRuntimeOwnedTarget(control.target)) {
    return {
      capable: false,
      reason: "runtime-owned-target",
    };
  }

  if (keyframeCapableControlTypes.has(control.type)) {
    return {
      capable: true,
      reason: "control-type",
    };
  }

  return {
    capable: false,
    reason: "control-type",
  };
}
