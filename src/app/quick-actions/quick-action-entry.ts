import type { ToolcraftCommand } from "@/toolcraft/runtime";

import {
  buildQuickActionSearchDocument,
  type QuickActionSearchDocument,
  type QuickActionSearchFields,
} from "./quick-action-search";

export type QuickActionKind = "animation" | "command" | "control" | "value";

/**
 * Which section the row lives in. A collapsed section has no control to focus
 * and no button to press, so both callbacks are handed the section and open it
 * before they look for anything.
 */
export type QuickActionPanelTarget = { readonly sectionId: string };

/**
 * What an entry is handed when it runs.
 *
 * Everything the palette does goes through one of these. Reducer commands are
 * dispatched directly; the two things that are not reducer commands — running
 * an export and putting a control under the cursor — are handed in as
 * callbacks, so this module stays free of React and of the DOM and can be
 * tested as plain data.
 */
export type QuickActionRunContext = {
  /**
   * Presses the real button in the controls panel by its label.
   *
   * Exports need the panel's render host, scene-export visibility and renderer
   * pipeline; reaching them from here would mean standing up a second export
   * path beside the one the Deliver buttons already use, and second paths
   * drift. Pressing the button that exists keeps exactly one.
   */
  readonly activatePanelAction: (request: QuickActionPanelTarget & { readonly label: string }) => void;
  readonly dispatch: (command: ToolcraftCommand) => void;
  /** Animation presets lay their last key on the end of the loop, wherever it is. */
  readonly durationSeconds: number;
  readonly revealControl: (request: QuickActionPanelTarget & { readonly target: string }) => void;
};

export type QuickActionEntry = {
  readonly document: QuickActionSearchDocument;
  readonly groupLabel: string;
  readonly id: string;
  readonly kind: QuickActionKind;
  /**
   * Scales the entry's score. Secondary actions on a control — resetting it —
   * carry the control's own words in their title and would otherwise tie with
   * the control itself on every query that names it.
   */
  readonly priority: number;
  readonly run: (context: QuickActionRunContext) => void;
  /** The trailing context line: which section, and which control within it. */
  readonly subtitle: string;
  readonly title: string;
};

export type QuickActionDefinition = Omit<QuickActionEntry, "document" | "priority"> &
  Partial<Pick<QuickActionEntry, "priority">> & {
    /** Extra searchable words that should not appear on screen. */
    readonly keywords?: readonly string[];
    /** The schema's description, searched at low weight. */
    readonly prose?: string;
  };

export function createQuickActionEntry(definition: QuickActionDefinition): QuickActionEntry {
  const fields: QuickActionSearchFields = {
    groupLabel: definition.groupLabel,
    keywords: definition.keywords ?? [],
    prose: definition.prose ?? "",
    title: definition.title,
  };
  return {
    document: buildQuickActionSearchDocument(fields),
    groupLabel: definition.groupLabel,
    id: definition.id,
    kind: definition.kind,
    priority: definition.priority ?? 1,
    run: definition.run,
    subtitle: definition.subtitle,
    title: definition.title,
  };
}
