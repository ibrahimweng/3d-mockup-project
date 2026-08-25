import type {
  ResolvedToolcraftControlSchema,
  ResolvedToolcraftControlSectionSchema,
} from "@/toolcraft/runtime";

import { appSchema } from "../app-schema";
import {
  createQuickActionEntry,
  type QuickActionEntry,
} from "./quick-action-entry";

/** `positionX` reads as "Position X" to a person and to the search index alike. */
function humanizeQuickActionKey(key: string): string {
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_.]+/g, " ")
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

function readQuickActionControlLabel(
  key: string,
  control: ResolvedToolcraftControlSchema,
): string {
  return typeof control.label === "string" && control.label.length > 0
    ? control.label
    : humanizeQuickActionKey(key);
}

function readQuickActionSectionLabel(
  section: ResolvedToolcraftControlSectionSchema,
): string {
  return section.title ?? humanizeQuickActionKey(section.id);
}

/**
 * A target is searchable text in its own right. `device.spin` carries "device"
 * and "spin"; `studio.keyColor` carries "key" and "color". Those words are
 * often exactly what someone types, and they are not always in the label.
 */
function readQuickActionTargetWords(target: string): readonly string[] {
  return target.split(/[.\-_]/).flatMap((segment) =>
    segment.replace(/([a-z0-9])([A-Z])/g, "$1 $2").split(" "),
  );
}

function buildQuickActionControlEntries(
  section: ResolvedToolcraftControlSectionSchema,
  key: string,
  control: ResolvedToolcraftControlSchema,
): readonly QuickActionEntry[] {
  const sectionLabel = readQuickActionSectionLabel(section);
  const controlLabel = readQuickActionControlLabel(key, control);
  const targetWords = readQuickActionTargetWords(control.target);
  const entries: QuickActionEntry[] = [];

  entries.push(
    createQuickActionEntry({
      groupLabel: sectionLabel,
      id: `control:${section.id}:${key}`,
      keywords: [
        ...targetWords,
        key,
        control.unit ?? "",
        control.semanticGroup ?? "",
        control.type,
      ].filter((word) => word.length > 0),
      kind: "control",
      prose: control.description ?? "",
      run: ({ revealControl }) =>
        revealControl({ sectionId: section.id, target: control.target }),
      subtitle: sectionLabel,
      title: controlLabel,
    }),
  );

  // Every option of every picker is its own row, because "gold" is a thing
  // someone searches for and "Finish" is not — they know the outcome they want
  // long before they know which control produces it.
  for (const option of control.options ?? []) {
    entries.push(
      createQuickActionEntry({
        groupLabel: sectionLabel,
        id: `value:${section.id}:${key}:${option.value}`,
        keywords: [...targetWords, controlLabel, option.value],
        kind: "value",
        prose: control.description ?? "",
        run: ({ dispatch, revealControl }) => {
          dispatch({
            label: `${controlLabel}: ${option.label}`,
            target: control.target,
            type: "controls.setValue",
            value: option.value,
          });
          revealControl({ sectionId: section.id, target: control.target });
        },
        subtitle: `${sectionLabel} · ${controlLabel}`,
        title: option.label,
      }),
    );
  }

  if (control.type === "switch") {
    for (const [label, value] of [["On", true], ["Off", false]] as const) {
      entries.push(
        createQuickActionEntry({
          groupLabel: sectionLabel,
          id: `value:${section.id}:${key}:${String(value)}`,
          keywords: [...targetWords, controlLabel, value ? "enable" : "disable"],
          kind: "value",
          prose: control.description ?? "",
          run: ({ dispatch, revealControl }) => {
            dispatch({
              label: `${controlLabel}: ${label}`,
              target: control.target,
              type: "controls.setValue",
              value,
            });
            revealControl({ sectionId: section.id, target: control.target });
          },
          subtitle: `${sectionLabel} · ${controlLabel}`,
          title: `${controlLabel} ${label.toLowerCase()}`,
        }),
      );
    }
  }

  for (const action of control.actions ?? []) {
    if (typeof action === "string" || action.label === undefined) continue;
    const label = action.label;
    entries.push(
      createQuickActionEntry({
        groupLabel: sectionLabel,
        id: `action:${section.id}:${key}:${action.value}`,
        keywords: [...targetWords, action.value, action.role ?? ""].filter(
          (word) => word.length > 0,
        ),
        kind: "command",
        prose: control.description ?? "",
        run: ({ activatePanelAction }) =>
          activatePanelAction({ label, sectionId: section.id }),
        subtitle: sectionLabel,
        title: label,
      }),
    );
  }

  // Putting one control back without disturbing the rest of the scene. The
  // panel only offers resetting everything, so for a single control this is
  // the only route there is.
  entries.push(
    createQuickActionEntry({
      groupLabel: sectionLabel,
      id: `reset:${section.id}:${key}`,
      keywords: [...targetWords, "default", "revert", "restore"],
      kind: "command",
      priority: 0.85,
      run: ({ dispatch, revealControl }) => {
        dispatch({
          label: `Reset ${controlLabel}`,
          targets: [control.target],
          type: "controls.resetTargets",
        });
        revealControl({ sectionId: section.id, target: control.target });
      },
      subtitle: `${sectionLabel} · restore the default`,
      title: `Reset ${controlLabel}`,
    }),
  );

  return entries;
}

function buildQuickActionAnimationEntries(): readonly QuickActionEntry[] {
  const animations = appSchema.panels.timeline?.animations ?? [];
  return animations.map((animation) =>
    createQuickActionEntry({
      groupLabel: "Animation",
      id: `animation:${animation.id}`,
      keywords: [
        animation.id,
        "animate",
        "keyframe",
        "timeline",
        ...animation.tracks.map((track) => track.controlLabel),
      ],
      kind: "animation",
      prose:
        "Lays the whole move down as keyframes across the loop, from the first frame to the last.",
      run: ({ dispatch, durationSeconds }) => {
        // The same three dispatches the timeline's own preset button makes.
        for (const track of animation.tracks) {
          dispatch({ controlId: track.target, type: "timeline.deleteControlKeyframes" });
          dispatch({
            controlId: track.target,
            controlLabel: track.controlLabel,
            timeSeconds: 0,
            type: "timeline.toggleControlKeyframes",
            value: track.from,
            valueLabel: String(track.from),
          });
          dispatch({
            controlId: track.target,
            controlLabel: track.controlLabel,
            timeSeconds: durationSeconds,
            type: "timeline.upsertControlKeyframe",
            value: track.to,
            valueLabel: String(track.to),
          });
          // The easing belongs to the keyframe the segment leaves from. A
          // looping preset that inherits the editor's ease-in-out stops dead
          // once a cycle, which is not what a turntable is.
          if (track.easing) {
            dispatch({
              easing: track.easing,
              keyframeId: `${track.target}::0`,
              type: "timeline.changeKeyframeEasing",
            });
          }
        }
        dispatch({ expanded: true, type: "timeline.setExpanded" });
      },
      subtitle: "Animation · lay it down as keyframes",
      title: `Add ${animation.label.toLowerCase()} animation`,
    }),
  );
}

type QuickActionCommandSeed = {
  readonly id: string;
  readonly keywords: readonly string[];
  readonly prose: string;
  readonly run: Parameters<typeof createQuickActionEntry>[0]["run"];
  readonly subtitle: string;
  readonly title: string;
};

/**
 * The moves that belong to the app rather than to any one control. Without
 * these the palette would know how to change the scene but not how to undo it,
 * play it, or frame it.
 */
const quickActionAppCommandSeeds: readonly QuickActionCommandSeed[] = [
  {
    id: "app:undo",
    keywords: ["history", "back", "revert", "mistake"],
    prose: "Steps back through the changes made to the scene.",
    run: ({ dispatch }) => dispatch({ type: "history.undo" }),
    subtitle: "History",
    title: "Undo",
  },
  {
    id: "app:redo",
    keywords: ["history", "forward", "again"],
    prose: "Steps forward again through changes that were undone.",
    run: ({ dispatch }) => dispatch({ type: "history.redo" }),
    subtitle: "History",
    title: "Redo",
  },
  {
    id: "app:reset",
    keywords: ["default", "restore", "clear", "start", "over"],
    prose: "Puts every control in the studio back to the value it started at.",
    run: ({ dispatch }) => dispatch({ type: "controls.reset" }),
    subtitle: "History · every control at once",
    title: "Reset all controls",
  },
  {
    id: "app:play",
    keywords: ["pause", "stop", "animation", "preview", "motion", "timeline"],
    prose: "Runs the animation on the timeline, or stops it if it is running.",
    run: ({ dispatch }) => dispatch({ type: "timeline.togglePlayback" }),
    subtitle: "Timeline",
    title: "Play or pause the animation",
  },
  {
    id: "app:loop",
    keywords: ["repeat", "cycle", "animation", "timeline"],
    prose: "Decides whether playback runs once or starts over at the end.",
    run: ({ dispatch }) => dispatch({ type: "timeline.toggleLoop" }),
    subtitle: "Timeline",
    title: "Toggle looping",
  },
  {
    id: "app:timeline",
    keywords: ["keyframe", "track", "animation", "open", "close", "expand", "collapse"],
    prose: "Opens the track editor below the canvas, where keyframes live.",
    run: ({ dispatch }) => dispatch({ type: "timeline.toggleExpanded" }),
    subtitle: "Timeline",
    title: "Open or close the timeline",
  },
  {
    id: "app:zoom-in",
    keywords: ["magnify", "closer", "bigger", "canvas", "view"],
    prose: "Moves the board closer without changing the shot itself.",
    run: ({ dispatch }) => dispatch({ type: "canvas.zoomIn" }),
    subtitle: "View · the board, not the camera",
    title: "Zoom in",
  },
  {
    id: "app:zoom-out",
    keywords: ["shrink", "further", "smaller", "canvas", "view"],
    prose: "Moves the board further away without changing the shot itself.",
    run: ({ dispatch }) => dispatch({ type: "canvas.zoomOut" }),
    subtitle: "View · the board, not the camera",
    title: "Zoom out",
  },
  {
    id: "app:zoom-reset",
    keywords: ["fit", "actual", "hundred", "percent", "canvas", "view"],
    prose: "Returns the board to its natural size on screen.",
    run: ({ dispatch }) => dispatch({ type: "canvas.zoomReset" }),
    subtitle: "View · the board, not the camera",
    title: "Reset zoom",
  },
  {
    id: "app:center",
    keywords: ["centre", "middle", "recenter", "canvas", "view"],
    prose: "Brings the board back to the middle of the workspace.",
    run: ({ dispatch }) => dispatch({ type: "canvas.center" }),
    subtitle: "View · the board, not the camera",
    title: "Center the canvas",
  },
];

function buildQuickActionAppCommandEntries(): readonly QuickActionEntry[] {
  return quickActionAppCommandSeeds.map((seed) =>
    createQuickActionEntry({
      groupLabel: seed.subtitle.split(" · ")[0] ?? seed.subtitle,
      id: seed.id,
      keywords: seed.keywords,
      kind: "command",
      prose: seed.prose,
      run: seed.run,
      subtitle: seed.subtitle,
      title: seed.title,
    }),
  );
}

/**
 * Everything the palette can reach, derived from the schema rather than listed
 * by hand — a control added to the schema is searchable the moment it exists,
 * and one removed cannot linger here as a row that dispatches at a dead target.
 */
export function buildQuickActionIndex(): readonly QuickActionEntry[] {
  const entries: QuickActionEntry[] = [];
  for (const section of appSchema.panels.controls?.sections ?? []) {
    for (const [key, control] of Object.entries(section.controls)) {
      entries.push(...buildQuickActionControlEntries(section, key, control));
    }
  }
  entries.push(...buildQuickActionAnimationEntries());
  entries.push(...buildQuickActionAppCommandEntries());
  return entries;
}

/** Built once: the schema does not change while the app is running. */
export const quickActionIndex: readonly QuickActionEntry[] = buildQuickActionIndex();
