import * as React from "react";

import type { ToolcraftState } from "@/toolcraft/runtime";
import { useToolcraftDispatch, useToolcraftSelector } from "@/toolcraft/runtime/react";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/toolcraft/ui/components/composites";

import { PANEL_TAB_OPTIONS, PANEL_TAB_TARGET } from "../panel-tabs";
import type {
  QuickActionEntry,
  QuickActionPanelTarget,
  QuickActionRunContext,
} from "./quick-action-entry";
import { quickActionIndex } from "./quick-action-index";
import { subscribeToQuickActionOpen } from "./quick-action-open";
import {
  activateQuickActionPanelButton,
  revealQuickActionControl,
} from "./quick-action-reveal";
import { searchQuickActions } from "./quick-action-search";

/** Enough to scan, few enough that the best answer is never below the fold. */
const quickActionResultLimit = 12;

/**
 * What the palette offers before anything is typed.
 *
 * An empty command palette is a dead end for the person this feature is for —
 * the one who does not know what the app can do. These are the moves that
 * answer "what is this for": pick a device, turn it, get it out.
 */
export const quickActionDefaultIds: readonly string[] = [
  "control:device:model",
  "control:product-parts:finish",
  "animation:turntable",
  "action:runtime.export:footer:export-png",
  "action:runtime.export:footer:export-video",
  "control:runtime.setup:includeBackground",
  "control:surface:kind",
  "app:reset",
];

/** The tab's own name, for the history entry the switch writes. */
function readPanelTabLabel(tab: string): string {
  return PANEL_TAB_OPTIONS.find((option) => option.value === tab)?.label ?? tab;
}

/**
 * Retries across a few frames rather than assuming one is enough.
 *
 * Switching tab unmounts one set of sections and mounts another, and the
 * callback here has to find a node in the set that is arriving. One frame is
 * usually enough and was not always: `attempt` reports whether it found what
 * it wanted, and this gives it a bounded number of frames to say yes.
 */
const quickActionPanelSettleFrames = 10;

function afterPanelSettles(attempt: () => boolean): void {
  let framesLeft = quickActionPanelSettleFrames;
  const tick = (): void => {
    if (attempt() || framesLeft <= 0) return;
    framesLeft -= 1;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

const selectTimelineDuration = (state: ToolcraftState): number =>
  state.timeline.durationSeconds;

function useQuickActionShortcut(open: () => void): void {
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      // `metaKey` on a Mac, `ctrlKey` everywhere else. Both are accepted on
      // both platforms rather than sniffing the user agent: a Mac keyboard
      // plugged into Linux should still answer to the key its cap shows.
      if (event.key.toLowerCase() !== "k") return;
      if (!event.metaKey && !event.ctrlKey) return;
      event.preventDefault();
      open();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);
}

function QuickActionRow({
  entry,
  onRun,
}: {
  entry: QuickActionEntry;
  onRun: (entry: QuickActionEntry) => void;
}): React.JSX.Element {
  return (
    <CommandItem
      data-quick-action-id={entry.id}
      key={entry.id}
      // Kept as a press rather than a click, belt and braces. The cause of the
      // missing click is now understood and stopped at the palette's root
      // above: a press here used to bubble through the React tree into the
      // canvas, which captured the pointer, so the release never came back to
      // the row. Keyboard selection still arrives as `onSelect`; `onRun`
      // ignores a second activation so one gesture cannot fire a row twice.
      onPointerDown={(event) => {
        // Mouse and pen only. A touch press is also the start of a scroll, and
        // the list scrolls, so activating on press would fire a row every time
        // someone swiped it. Touch keeps the ordinary click path; the fault
        // measured here was a mouse one, and guessing at touch would be
        // inventing a fix for something never observed.
        if (event.pointerType === "touch") return;
        event.preventDefault();
        onRun(entry);
      }}
      onSelect={() => onRun(entry)}
      // cmdk matches on this string when filtering; the palette does its own
      // ranking, so it only has to be unique.
      value={entry.id}
    >
      <span className="flex min-w-0 flex-1 items-baseline justify-between gap-3">
        <span className="truncate">{entry.title}</span>
        <span className="shrink-0 text-[color:var(--muted-foreground)] text-xs">
          {entry.subtitle}
        </span>
      </span>
    </CommandItem>
  );
}

export function QuickActionDialog(): React.JSX.Element {
  const [isOpen, setIsOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const dispatch = useToolcraftDispatch();
  const durationSeconds = useToolcraftSelector(selectTimelineDuration);
  /**
   * A row can be activated by press and by keyboard, and on a platform where
   * the click does arrive both would fire for one gesture. Undo twice is not
   * what anyone asked for, so the first activation of an opening wins.
   */
  const hasRunRef = React.useRef(false);

  const openPalette = React.useCallback(() => {
    hasRunRef.current = false;
    setQuery("");
    setIsOpen(true);
  }, []);
  useQuickActionShortcut(openPalette);
  React.useEffect(() => subscribeToQuickActionOpen(openPalette), [openPalette]);

  /**
   * Dismissal on an outside press is handled here rather than left to the
   * dialog.
   *
   * The backdrop is rendered inside the dialog's own portal, so the primitive
   * reads a press on it as a press *inside* the dialog and never dismisses —
   * measured: the backdrop is full-viewport, it is the element under the
   * pointer, and pressing it leaves the palette open while Escape closes it.
   * Listening on the capture phase catches the press before anything below can
   * swallow it.
   */
  React.useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: PointerEvent): void => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      const palette = document.querySelector('[data-slot="quick-action-palette"]');
      if (palette !== null && palette.contains(target)) return;
      setIsOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [isOpen]);

  const results = React.useMemo(() => {
    const ranked = searchQuickActions(quickActionIndex, query, quickActionResultLimit);
    if (ranked !== null) return ranked.map((result) => result.entry);
    return quickActionDefaultIds
      .map((id) => quickActionIndex.find((entry) => entry.id === id))
      .filter((entry): entry is QuickActionEntry => entry !== undefined);
  }, [query]);

  const runEntry = React.useCallback(
    (entry: QuickActionEntry) => {
      if (hasRunRef.current) return;
      hasRunRef.current = true;
      setIsOpen(false);

      /**
       * Put the panel where the row's control actually is.
       *
       * The tab first, then the section. A tab is not a filter over a panel
       * that holds everything — the sections it does not own are unmounted —
       * so a row for a control on another tab had nothing to scroll to and
       * nothing to focus, and the palette silently did nothing. That is the
       * one thing the palette exists to prevent, and it is how the panel's own
       * below-the-fold controls are reachable at all.
       */
      const openPanelAt = ({ sectionId, tab }: QuickActionPanelTarget): void => {
        if (tab !== undefined) {
          dispatch({
            label: `View: ${readPanelTabLabel(tab)}`,
            target: PANEL_TAB_TARGET,
            type: "controls.setValue",
            value: tab,
          });
        }
        dispatch({ collapsed: false, sectionId, type: "panels.setSectionCollapsed" });
      };
      const context: QuickActionRunContext = {
        activatePanelAction: ({ label, ...panelTarget }) => {
          openPanelAt(panelTarget);
          // The section may have been collapsed or on another tab a moment
          // ago, so the button is only in the document once React has flushed
          // the state above and mounted it.
          afterPanelSettles(() => activateQuickActionPanelButton(label));
        },
        dispatch,
        durationSeconds,
        revealControl: ({ target, ...panelTarget }) => {
          openPanelAt(panelTarget);
          afterPanelSettles(() => revealQuickActionControl(target));
        },
      };
      entry.run(context);
    },
    [dispatch, durationSeconds],
  );

  // Results are shown under the section they came from, which is the same
  // grouping the controls panel uses — the palette teaches where things live
  // rather than presenting a flat list that has to be searched again later.
  const groups = React.useMemo(() => {
    const byGroup = new Map<string, QuickActionEntry[]>();
    for (const entry of results) {
      const existing = byGroup.get(entry.groupLabel);
      if (existing === undefined) byGroup.set(entry.groupLabel, [entry]);
      else existing.push(entry);
    }
    return [...byGroup];
  }, [results]);

  return (
    <CommandDialog
      description="Search every control, value and action in the studio."
      onOpenChange={setIsOpen}
      open={isOpen}
      title="Quick actions"
    >
      <Command
        data-slot="quick-action-palette"
        /*
         * Pointer events stop here. A React portal bubbles through the React
         * tree, not the DOM one, and this is mounted inside the canvas content —
         * so without this a press travels on into the preview's handlers, which
         * claim the pointer with `setPointerCapture`. The release then belongs to
         * the canvas, no click is synthesised, and a press meant for this surface
         * turns the device behind it.
         */
        onPointerDown={(event) => event.stopPropagation()}
        onPointerMove={(event) => event.stopPropagation()}
        onPointerUp={(event) => event.stopPropagation()}
        shouldFilter={false}
      >
        <CommandInput
          onValueChange={setQuery}
          placeholder="What do you want to change? Try “make it shiny” or “no background”."
          value={query}
        />
        <CommandList>
          <CommandEmpty>
            Nothing matches that. Try describing what you want to see instead.
          </CommandEmpty>
          {groups.map(([groupLabel, entries]) => (
            <CommandGroup heading={groupLabel} key={groupLabel}>
              {entries.map((entry) => (
                <QuickActionRow entry={entry} key={entry.id} onRun={runEntry} />
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
