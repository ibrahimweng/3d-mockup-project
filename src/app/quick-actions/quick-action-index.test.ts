import { describe, expect, test } from "vitest";

import type { ToolcraftCommand } from "@/toolcraft/runtime";

import { appSchema } from "../app-schema";
import type { QuickActionEntry, QuickActionRunContext } from "./quick-action-entry";
import { quickActionDefaultIds } from "./quick-action-dialog";
import { quickActionIndex } from "./quick-action-index";
import { searchQuickActions } from "./quick-action-search";

type QuickActionRunRecord = {
  readonly actions: { label: string; sectionId: string }[];
  readonly commands: ToolcraftCommand[];
  readonly reveals: { sectionId: string; target: string }[];
};

function runEntry(entry: QuickActionEntry, durationSeconds = 6): QuickActionRunRecord {
  const record: QuickActionRunRecord = { actions: [], commands: [], reveals: [] };
  const context: QuickActionRunContext = {
    activatePanelAction: (request) => record.actions.push(request),
    dispatch: (command) => record.commands.push(command),
    durationSeconds,
    revealControl: (request) => record.reveals.push(request),
  };
  entry.run(context);
  return record;
}

const sections = appSchema.panels.controls?.sections ?? [];
const allControls = sections.flatMap((section) =>
  Object.entries(section.controls).map(([key, control]) => ({ control, key, section })),
);

/**
 * Named to match the acceptance row it satisfies. Every category is checked in
 * one test rather than three, so the requirement has one proof rather than a
 * set the reporter would have to be taught to combine; the assertion collects
 * everything missing, so a failure still names which rows are gone.
 */
test("every control, value and action in the schema is reachable from the palette", () => {
  const ids = new Set(quickActionIndex.map((entry) => entry.id));
  const missing = [
    ...allControls.map(({ key, section }) => `control:${section.id}:${key}`),
    ...allControls.flatMap(({ control, key, section }) =>
      (control.options ?? []).map((option) => `value:${section.id}:${key}:${option.value}`),
    ),
    ...allControls.flatMap(({ control, key, section }) =>
      (control.actions ?? [])
        .filter((action) => typeof action !== "string" && action.label !== undefined)
        .map((action) => `action:${section.id}:${key}:${(action as { value: string }).value}`),
    ),
    ...(appSchema.panels.timeline?.animations ?? []).map(
      (animation) => `animation:${animation.id}`,
    ),
  ].filter((id) => !ids.has(id));

  expect(missing).toEqual([]);
});

describe("what the index covers", () => {
  test("ids are unique, so no row silently shadows another", () => {
    expect(new Set(quickActionIndex.map((entry) => entry.id)).size).toBe(
      quickActionIndex.length,
    );
  });

  test("nothing is offered without a readable label", () => {
    for (const entry of quickActionIndex) {
      expect(entry.title.trim().length).toBeGreaterThan(0);
      expect(entry.subtitle.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("what the rows do", () => {
  test("choosing a value sets it, and puts the control under the cursor", () => {
    const gold = quickActionIndex.find((entry) => entry.id === "value:device:finish:gold");
    expect(gold).toBeDefined();
    const record = runEntry(gold!);
    expect(record.commands).toEqual([
      {
        label: "Finish: Gold",
        target: "device.finish",
        type: "controls.setValue",
        value: "gold",
      },
    ]);
    expect(record.reveals).toEqual([{ sectionId: "device", target: "device.finish" }]);
  });

  test("a control row only reveals; it does not change the scene", () => {
    const spin = quickActionIndex.find((entry) => entry.id === "control:device:spin");
    const record = runEntry(spin!);
    expect(record.commands).toEqual([]);
    expect(record.reveals).toEqual([{ sectionId: "device", target: "device.spin" }]);
  });

  test("resetting one control leaves the others alone", () => {
    const reset = quickActionIndex.find((entry) => entry.id === "reset:device:spin");
    const record = runEntry(reset!);
    expect(record.commands).toEqual([
      { label: "Reset Spin", targets: ["device.spin"], type: "controls.resetTargets" },
    ]);
  });

  test("an export presses the button that already exists rather than exporting itself", () => {
    const exportPng = quickActionIndex.find(
      (entry) => entry.id === "action:runtime.export:footer:export-png",
    );
    const record = runEntry(exportPng!);
    expect(record.commands).toEqual([]);
    expect(record.actions).toEqual([
      { label: "Export PNG", sectionId: "runtime.export" },
    ]);
  });

  test("an animation lays its last key on the end of the loop, wherever it is", () => {
    const turntable = quickActionIndex.find((entry) => entry.id === "animation:turntable");
    const record = runEntry(turntable!, 9);
    const upsert = record.commands.find(
      (command) => command.type === "timeline.upsertControlKeyframe",
    );
    expect(upsert).toMatchObject({ controlId: "device.spin", timeSeconds: 9, value: 360 });
    // Clearing first is what makes applying a preset twice idempotent.
    expect(record.commands[0]).toEqual({
      controlId: "device.spin",
      type: "timeline.deleteControlKeyframes",
    });
    expect(record.commands.at(-1)).toEqual({ expanded: true, type: "timeline.setExpanded" });
  });
});

describe("the suggestions shown before anything is typed", () => {
  test("every default resolves to a row", () => {
    const ids = new Set(quickActionIndex.map((entry) => entry.id));
    expect(quickActionDefaultIds.filter((id) => !ids.has(id))).toEqual([]);
  });
});

/**
 * Named to match the acceptance row it satisfies.
 *
 * Each of these is phrased the way someone who does not know the vocabulary
 * would phrase it — the outcome they want, not the control that produces it.
 * "shiny" is in no label and no description; "picture", "laptop" and "wood"
 * name nothing in the schema. Every one of them still has to land.
 */
test("describing an outcome ranks the control that produces it", () => {
  const cases: readonly (readonly [string, string])[] = [
    ["make it shiny", "Finish"],
    ["i want the phone to spin", "Spin"],
    ["no background", "Background off"],
    ["the shadow is too harsh", "Shadow softness"],
    ["save it as a picture", "Export PNG"],
    ["put it on wood", "Oak"],
    ["how do i make a video", "Export Video"],
    ["show my screenshot bigger", "Scale"],
    ["laptop", "MacBook"],
    ["undo that", "Undo"],
    ["turntable", "Add turntable animation"],
    ["4k", "4K"],
    ["gold", "Gold"],
  ];

  const wrong = cases
    .map(([query, expected]) => {
      const actual = (searchQuickActions(quickActionIndex, query, 5) ?? [])[0]?.entry.title;
      return actual === expected ? null : `${query} -> ${actual ?? "nothing"} (want ${expected})`;
    })
    .filter((failure): failure is string => failure !== null);

  expect(wrong).toEqual([]);
});

describe("searching the real index", () => {
  test("a description with no matching word returns nothing rather than noise", () => {
    expect(searchQuickActions(quickActionIndex, "qwertyuiop", 5)).toEqual([]);
  });
});
