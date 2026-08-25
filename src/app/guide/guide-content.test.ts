import { describe, expect, test } from "vitest";

import { firstRunSteps, guideTopics } from "./guide-content";

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
    // Three steps, because that is the claim the welcome makes.
    expect(first.steps).toHaveLength(3);
    expect(firstRunSteps).toHaveLength(3);
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
