import { describe, expect, test } from "vitest";

import { appSchema } from "../app-schema";
import { PANEL_TAB_OPTIONS } from "../panel-tabs";
import { guideTopics } from "./guide-content";
import { tourSteps } from "../tour/tour-steps";

/**
 * The help screen is for someone who has never used a 3D tool. That is a
 * writing constraint, not a layout one, so it is checked here rather than
 * left to whoever edits the copy next.
 */
const jargon = [
  "keyframe", "raster", "render scale", "artboard", "viewport", "HDRI",
  "environment map", "bezier", "easing", "schema", "target", "dispatch",
  "GLB", "mesh", "shader", "UV", "anisotropic", "roughness map",
];

/**
 * Every name the panel actually shows: the tabs, the section titles, and the
 * label on every control.
 *
 * Read off the schema rather than listed, because a list written here is
 * exactly the thing that goes stale — which is how the help screen came to
 * send people to a studio preset called "Environment" months after it stopped
 * being called that.
 */
const panelNames = new Set<string>([
  ...PANEL_TAB_OPTIONS.map((option) => option.label),
  ...(appSchema.panels.controls?.sections ?? []).flatMap((section) => [
    // A sticky footer's title is never drawn — the runtime suppresses it, so
    // the export section's "Export" is not a heading anyone can look for, and
    // counting it would only quarrel with every step that says "Export PNG".
    ...(section.title && !section.actionGroup ? [section.title] : []),
    ...Object.values(section.controls)
      .map((control) => control.label)
      .filter((label): label is string => typeof label === "string"),
  ]),
]);

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

const allSteps = [
  ...guideTopics.flatMap((topic) =>
    topic.steps.map((step) => ({ step, where: topic.id })),
  ),
  // The tour is held to the same rules as the help screen: it is read by the
  // same person, and it points at the panel by name in the same way.
  ...tourSteps.map((step) => ({ step, where: "first-run-tour" })),
];

describe("the help screen points at things that exist", () => {
  test("every name it sends someone to is a real tab, section or control", () => {
    const missing = allSteps.flatMap(({ step, where }) =>
      (step.names ?? [])
        .filter((name) => !panelNames.has(name))
        .map((name) => `${where}: "${name}" is not a name the panel shows`),
    );

    expect(missing).toEqual([]);
  });

  test("every name it declares is a name it actually says", () => {
    // Otherwise the list above drifts from the prose beside it and stops
    // meaning anything: a step could keep a stale heading in its words while
    // declaring the new one.
    const unspoken = allSteps.flatMap(({ step, where }) => {
      const words = `${step.action} ${step.detail ?? ""}`;

      return (step.names ?? [])
        .filter((name) => !words.includes(name))
        .map((name) => `${where}: declares "${name}" but does not say it`);
    });

    expect(unspoken).toEqual([]);
  });

  test("every panel name it says is a name it declares", () => {
    // The other direction, and the one that catches drift: a step that names a
    // heading in its words without listing it is a claim nothing checks, so it
    // is free to go stale. Matched case-sensitively and whole-word, because
    // "the device" is prose and "Device" is a section.
    const undeclared = allSteps.flatMap(({ step, where }) => {
      const words = `${step.action} ${step.detail ?? ""}`;
      const declared = new Set(step.names ?? []);

      return [...panelNames]
        .filter(
          (name) =>
            !declared.has(name) &&
            new RegExp(`(?<![\\w])${escapeForRegExp(name)}(?![\\w])`, "u").test(
              words,
            ),
        )
        .map((name) => `${where}: says "${name}" without declaring it`);
    });

    expect(undeclared).toEqual([]);
  });
});

describe("the help screen speaks plainly", () => {
  test("it uses no words from the codebase", () => {
    const offenders: string[] = [];
    for (const topic of guideTopics) {
      const text = [
        topic.title,
        topic.blurb,
        ...topic.steps.flatMap((step) => [step.action, step.detail ?? ""]),
      ]
        .join(" ")
        .toLowerCase();
      for (const word of jargon) {
        if (text.includes(word.toLowerCase())) offenders.push(`${topic.id}: "${word}"`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test("every line is short enough to read at a glance", () => {
    for (const topic of guideTopics) {
      expect(topic.blurb.length, `${topic.id} blurb`).toBeLessThanOrEqual(110);
      for (const step of topic.steps) {
        expect(step.action.length, `${topic.id}: ${step.action}`).toBeLessThanOrEqual(45);
        expect((step.detail ?? "").length, `${topic.id}: ${step.action}`).toBeLessThanOrEqual(105);
      }
    }
  });

  test("it opens with the shortest path to a finished picture", () => {
    const first = guideTopics[0];
    expect(first.id).toBe("start");
    expect(first.steps).toHaveLength(3);
    // Four, and the last one is the ask. A tour that grew a fifth teaching step
    // would be one more thing between someone and the studio they came for.
    expect(tourSteps).toHaveLength(4);
    expect(tourSteps.at(-1)?.target).toBeUndefined();
    expect(tourSteps.slice(0, -1).every((step) => step.target !== undefined)).toBe(true);
  });

  test("every topic earns its place", () => {
    expect(new Set(guideTopics.map((topic) => topic.id)).size).toBe(guideTopics.length);
    for (const topic of guideTopics) {
      expect(topic.steps.length, `${topic.id} has no steps`).toBeGreaterThan(0);
      expect(topic.title.length).toBeGreaterThan(0);
    }
    // The gestures nobody discovers on their own have to be in here somewhere.
    const everything = JSON.stringify(guideTopics).toLowerCase();
    for (const gesture of ["middle mouse", "drag the device's screen", "turns the device"]) {
      expect(everything, `no mention of ${gesture}`).toContain(gesture.toLowerCase());
    }
  });
});
