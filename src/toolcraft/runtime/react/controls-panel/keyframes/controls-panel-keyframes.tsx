"use client";

import * as React from "react";
import { DiamondIcon } from "@phosphor-icons/react";
import {
  Button,
  ControlFieldLabelActionProvider,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/toolcraft/ui";

import { getToolcraftControlKeyframeCapability } from "../../../schema/keyframe-capability";
import type { ToolcraftControlSchema } from "../../../schema/types";
import type { ToolcraftCommand } from "../../../state/types";
import {
  getControlName,
  type ControlEntry,
} from "../layout/controls-panel-layout";

function cn(...classNames: Array<string | false | null | undefined>): string {
  return classNames.filter(Boolean).join(" ");
}

function canCreateControlKeyframe(control: ToolcraftControlSchema): boolean {
  return getToolcraftControlKeyframeCapability(control).capable;
}

export function getControlsPanelSectionHeaderKeyframeEntry(
  entries: readonly ControlEntry[],
  title: React.ReactNode,
): ControlEntry | null {
  if (typeof title !== "string") {
    return null;
  }

  return (
    entries.find(([id, control]) => {
      if (control.type === "channelMixer" || control.type === "curves") {
        return false;
      }

      return (
        getControlName(id, control.label) === title &&
        canCreateControlKeyframe(control)
      );
    }) ?? null
  );
}

function ControlKeyframeButton({
  active,
  name,
  onClick,
}: {
  active: boolean;
  name: string;
  onClick: () => void;
}): React.JSX.Element {
  const label = active ? `Disable ${name} keyframes` : `Add ${name} keyframe`;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={label}
            aria-pressed={active}
            className={cn(
              "size-4 opacity-100 transition-opacity duration-150 ease-out hover:!bg-transparent active:!bg-transparent aria-pressed:!bg-transparent data-popup-open:!bg-transparent [&_svg:not([class*='size-'])]:!size-2.5 [&_svg:not([class*='size-'])]:!opacity-70 data-[icon-active=true]:[&_svg:not([class*='size-'])]:!opacity-100",
              active &&
                "!text-[color:var(--link)] aria-pressed:!text-[color:var(--link)] data-popup-open:!text-[color:var(--link)] [&_svg]:!text-[color:var(--link)] [&_svg]:!fill-[color:var(--link)]",
            )}
            data-icon-active={active}
            onClick={(event) => {
              event.stopPropagation();
              onClick();

              if (typeof event.currentTarget.blur === "function") {
                event.currentTarget.blur();
              }
            }}
            size="icon-sm"
            style={active ? { color: "var(--link)" } : undefined}
            type="button"
            variant="ghost-static"
          />
        }
      >
        <DiamondIcon weight={active ? "fill" : "regular"} />
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}

export function createControlsPanelKeyframeActions({
  dispatchCommand,
  formatValueLabel,
  getControlName,
  getControlValue,
  keyframeControlsEnabled,
  keyframedControlIds,
}: {
  dispatchCommand: (command: ToolcraftCommand) => void;
  formatValueLabel: (control: ToolcraftControlSchema, value: unknown) => string;
  getControlName: (
    id: string,
    label: boolean | string | undefined,
  ) => string;
  getControlValue: (control: ToolcraftControlSchema) => unknown;
  keyframeControlsEnabled: boolean;
  keyframedControlIds: ReadonlySet<string>;
}): {
  getKeyframeLabelAction: (
    control: ToolcraftControlSchema,
    name: string,
    value: unknown,
  ) => React.ReactNode;
  getSectionHeaderKeyframeAction: (entry: ControlEntry) => React.ReactNode;
  getSectionHeaderKeyframeEntry: (
    entries: readonly ControlEntry[],
    title: React.ReactNode,
  ) => ControlEntry | null;
  maybeUpsertControlKeyframe: (
    control: ToolcraftControlSchema,
    name: string,
    value: unknown,
  ) => void;
  withKeyframeLabelAction: (args: {
    children: React.ReactNode;
    control: ToolcraftControlSchema;
    disableAction?: boolean;
    labelActionName?: string;
    name: string;
    providerKey: string;
    value: unknown;
  }) => React.ReactNode;
} {
  /**
   * Editing a keyframed control writes at the playhead. Always.
   *
   * This used to write at whichever keyframe happened to be selected, and
   * fall back to the playhead only when nothing was. Adding a keyframe
   * selects it, so something almost always was — which made the ordinary way
   * anyone builds an animation quietly impossible. Key the angle at the
   * start, drag the playhead to the end, turn the dial: the value went into
   * the keyframe back at the start, the one keyframe on the track changed
   * value, no second keyframe was ever created, and nothing moved. The
   * playhead, the one thing in the room saying which frame you are looking
   * at, had no say in where your edit went.
   *
   * Sending no time leaves the reducer to use `currentTimeSeconds`, which is
   * how a keyframe editor is expected to behave: change a value and you key
   * the frame you are on, landing on the keyframe already there if there is
   * one, adding one if there is not. Selection keeps the jobs it is good for
   * — dragging a keyframe, deleting it, shaping its easing — and stops
   * silently redirecting values to a frame nobody is looking at.
   */
  function maybeUpsertControlKeyframe(
    control: ToolcraftControlSchema,
    name: string,
    value: unknown,
  ): void {
    if (
      !keyframeControlsEnabled ||
      !keyframedControlIds.has(control.target) ||
      !canCreateControlKeyframe(control)
    ) {
      return;
    }

    dispatchCommand({
      controlId: control.target,
      controlLabel: name,
      type: "timeline.upsertControlKeyframe",
      value,
      valueLabel: formatValueLabel(control, value),
    });
  }

  function getKeyframeLabelAction(
    control: ToolcraftControlSchema,
    name: string,
    value: unknown,
  ): React.ReactNode {
    if (!keyframeControlsEnabled || !canCreateControlKeyframe(control)) {
      return null;
    }

    return (
      <ControlKeyframeButton
        active={keyframedControlIds.has(control.target)}
        name={name}
        onClick={() => {
          dispatchCommand({
            controlId: control.target,
            controlLabel: name,
            type: "timeline.toggleControlKeyframes",
            value,
            valueLabel: formatValueLabel(control, value),
          });
        }}
      />
    );
  }

  function withKeyframeLabelAction({
    children,
    control,
    disableAction = false,
    labelActionName,
    name,
    providerKey,
    value,
  }: {
    children: React.ReactNode;
    control: ToolcraftControlSchema;
    disableAction?: boolean;
    labelActionName?: string;
    name: string;
    providerKey: string;
    value: unknown;
  }): React.ReactNode {
    if (disableAction) {
      return children;
    }

    const actionName = labelActionName ?? name;
    const action = getKeyframeLabelAction(control, actionName, value);

    if (!action) {
      return children;
    }

    return (
      <ControlFieldLabelActionProvider
        action={action}
        key={providerKey}
        label={actionName}
      >
        {children}
      </ControlFieldLabelActionProvider>
    );
  }

  function getSectionHeaderKeyframeEntry(
    entries: readonly ControlEntry[],
    title: React.ReactNode,
  ): ControlEntry | null {
    return getControlsPanelSectionHeaderKeyframeEntry(entries, title);
  }

  function getSectionHeaderKeyframeAction(entry: ControlEntry): React.ReactNode {
    const [id, control] = entry;
    const name = getControlName(id, control.label);

    return getKeyframeLabelAction(control, name, getControlValue(control));
  }

  return {
    getKeyframeLabelAction,
    getSectionHeaderKeyframeAction,
    getSectionHeaderKeyframeEntry,
    maybeUpsertControlKeyframe,
    withKeyframeLabelAction,
  };
}

export type ControlsPanelKeyframeActions = ReturnType<
  typeof createControlsPanelKeyframeActions
>;
