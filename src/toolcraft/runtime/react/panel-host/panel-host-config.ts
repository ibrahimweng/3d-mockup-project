import type { ToolcraftPanelType, PanelDragMode, PanelSnapEdge } from "./panel-host-types";

type PanelTypeConfig = {
  dragMode: PanelDragMode;
  panelId: ToolcraftPanelType;
  snapEdges: readonly PanelSnapEdge[];
  stageClassName: string;
  wrapperClassName: string;
};

export const panelHostConfig = {
  controls: {
    dragMode: "handle",
    panelId: "controls",
    snapEdges: ["left", "right"],
    stageClassName: "min-h-[560px]",
    wrapperClassName: "absolute top-2.5 right-2.5 z-30",
  },
  layers: {
    dragMode: "handle",
    panelId: "layers",
    snapEdges: ["left", "right"],
    stageClassName: "min-h-[560px]",
    wrapperClassName: "absolute top-2.5 left-2.5 z-30",
  },
  timeline: {
    dragMode: "panel",
    panelId: "timeline",
    snapEdges: ["top", "bottom"],
    stageClassName: "min-h-[320px]",
    // A band of its own beneath the stage rather than a panel floating over
    // it, so the canvas ends where the timeline begins.
    wrapperClassName: "relative z-40 w-full shrink-0 px-2.5 pb-2.5",
  },
  toolbar: {
    dragMode: "panel",
    panelId: "toolbar",
    snapEdges: ["top", "bottom"],
    stageClassName: "min-h-[180px]",
    // Back at the foot of the stage: the timeline is no longer over it.
    wrapperClassName: "absolute bottom-2.5 left-1/2 z-[70] -translate-x-1/2",
  },
} satisfies Record<ToolcraftPanelType, PanelTypeConfig>;

export const panelSnapMarginPx = 10;
export const panelSnapZonePx = 40;
export const panelVelocityMultiplierMs = 150;
export const panelDragHandleSelector = "[data-panel-drag-handle]";

export const panelDragTransition = {
  bounceDamping: 90,
  bounceStiffness: 1200,
  power: 0,
} as const;

export const panelSnapAnimation = {
  duration: 0.3,
  ease: [0.22, 1, 0.36, 1],
} as const;

export const panelDragIgnoredTargetSelector = [
  ".app-no-drag",
  "a[href]",
  "button",
  "input",
  "label",
  "select",
  "textarea",
  "[contenteditable='true']",
  "[data-panel-drag-ignore]",
  "[data-slot='input-group']",
  "[data-slot='select-trigger']",
  "[data-slot='slider']",
  "[role='button']",
  "[role='checkbox']",
  "[role='combobox']",
  "[role='menuitem']",
  "[role='option']",
  "[role='radio']",
  "[role='slider']",
  "[role='switch']",
  "[role='textbox']",
].join(",");
