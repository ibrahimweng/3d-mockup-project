import type { ToolcraftControlConditionSchema } from "@/toolcraft/runtime";

/**
 * The four jobs the panel is for, and the switch between them.
 *
 * Every control the renderer has used to be on screen at once — 47 for a phone,
 * 54 for a tote bag, under fifteen headers, about six screens of scrolling in a
 * 272px column. Nothing was ranked: the floor's roughness sat at the same
 * weight as the design being printed. This is the ranking. A tab is a phase of
 * the same job — pick the thing, print on it, light it, write the file — and
 * only one phase is ever the one in hand.
 *
 * Tabs rather than segmented because the choice replaces the view below it
 * rather than setting a value in it, which is the line the component contract
 * draws between the two. The runtime falls back to a select of the same options
 * when four cells cannot keep their padding on one row, so the panel does not
 * need a narrow-width plan of its own.
 */
export const PANEL_TAB_TARGET = "view.tab";

export const PANEL_TAB_OPTIONS = [
  { label: "Product", value: "product" },
  { label: "Design", value: "design" },
  { label: "Scene", value: "scene" },
  { label: "Output", value: "output" },
] as const;

export type PanelTab = (typeof PANEL_TAB_OPTIONS)[number]["value"];

/**
 * Opens on the product, because that is the first decision.
 *
 * The order the tabs sit in is the order the decisions happen in, and the app
 * opens on a device with nothing printed on it yet.
 */
export const DEFAULT_PANEL_TAB: PanelTab = "product";

/**
 * What a section says to be shown only on one tab.
 *
 * Written as a helper rather than an object spelled out fifteen times so the
 * mapping from section to tab reads as one line in each section, and so a tab
 * renamed here cannot leave a section pointing at a value that no longer
 * exists.
 */
export function onTab(tab: PanelTab): ToolcraftControlConditionSchema {
  return { equals: tab, target: PANEL_TAB_TARGET };
}
