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

import type { QuickActionEntry, QuickActionRunContext } from "./quick-action-entry";
import { quickActionIndex } from "./quick-action-index";
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
  "control:device:finish",
  "animation:turntable",
  "action:runtime.export:footer:export-png",
  "action:runtime.export:footer:export-video",
  "control:runtime.setup:includeBackground",
  "control:surface:kind",
  "app:reset",
];

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

  const openPalette = React.useCallback(() => {
    setQuery("");
    setIsOpen(true);
  }, []);
  useQuickActionShortcut(openPalette);

  const results = React.useMemo(() => {
    const ranked = searchQuickActions(quickActionIndex, query, quickActionResultLimit);
    if (ranked !== null) return ranked.map((result) => result.entry);
    return quickActionDefaultIds
      .map((id) => quickActionIndex.find((entry) => entry.id === id))
      .filter((entry): entry is QuickActionEntry => entry !== undefined);
  }, [query]);

  const runEntry = React.useCallback(
    (entry: QuickActionEntry) => {
      setIsOpen(false);

      const openSection = (sectionId: string): void => {
        dispatch({ collapsed: false, sectionId, type: "panels.setSectionCollapsed" });
      };
      const context: QuickActionRunContext = {
        activatePanelAction: ({ label, sectionId }) => {
          openSection(sectionId);
          // The section may have been collapsed a moment ago, so the button is
          // only in the document after React has flushed the state above.
          requestAnimationFrame(() => activateQuickActionPanelButton(label));
        },
        dispatch,
        durationSeconds,
        revealControl: ({ sectionId, target }) => {
          openSection(sectionId);
          requestAnimationFrame(() => revealQuickActionControl(target));
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
      <Command data-slot="quick-action-palette" shouldFilter={false}>
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
