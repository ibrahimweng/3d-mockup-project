import { expect, test } from "vitest";

import {
  createToolcraftState,
  toolcraftReducer,
  type ToolcraftCommand,
  type ToolcraftState,
} from "@/toolcraft/runtime";
import {
  getToolcraftTimelineValueGraphRange,
  getToolcraftTimelineValueGraphRatio,
  getToolcraftTimelineValueGraphValue,
  isToolcraftTimelineValueGraphable,
  sampleToolcraftTimelineValueGraph,
} from "@/toolcraft/runtime/state/timeline-value-graph";

import { appSchema } from "./app-schema";

/**
 * The track drawn as what its value actually does over time.
 *
 * The claim worth testing is not that a line appears. It is that the line is
 * the animation: sampled through the runtime's own evaluator, so an eased
 * segment reads as eased and the graph cannot drift from the frame being drawn.
 */
function run(state: ToolcraftState, ...commands: readonly ToolcraftCommand[]): ToolcraftState {
  return commands.reduce(toolcraftReducer, state);
}

function keyed(
  entries: readonly (readonly [number, number])[],
  controlId = "device.spin",
): ToolcraftState {
  return entries.reduce<ToolcraftState>(
    (state, [timeSeconds, value]) =>
      run(state, {
        controlId,
        controlLabel: "Spin",
        timeSeconds,
        type: "timeline.upsertControlKeyframe",
        value,
        valueLabel: String(value),
      }),
    createToolcraftState(appSchema),
  );
}

const groupOf = (state: ToolcraftState, controlId = "device.spin") => {
  const group = state.timeline.keyframeGroups.find((item) => item.controlId === controlId);

  if (!group) {
    throw new Error(`No keyframe group for ${controlId}`);
  }

  return group;
};

test("the axis covers the keyed values with room around them", () => {
  // Padded from the keyframes rather than taken from the control's own limits.
  // Spin can reach 360; a track keyed between 0 and 90 drawn against 0..360
  // would be a nearly flat line, which hides what the graph is for.
  const range = getToolcraftTimelineValueGraphRange(groupOf(keyed([[0, 0], [3, 90]])));

  expect(range.minValue).toBeLessThan(0);
  expect(range.maxValue).toBeGreaterThan(90);
  // The padding is a fraction of the span, not a fixed number, so the shape
  // reads the same whether a track moves by ten or by a thousand.
  expect(range.maxValue - range.minValue).toBeCloseTo(90 * 1.24, 5);
});

test("a track that never changes still has an axis to sit on", () => {
  // No span at all would divide by zero and put the line nowhere. It belongs
  // in the middle, because that is the truth about a value that never moves.
  const range = getToolcraftTimelineValueGraphRange(groupOf(keyed([[0, 45], [3, 45]])));

  expect(range.minValue).toBeLessThan(45);
  expect(range.maxValue).toBeGreaterThan(45);
  expect(getToolcraftTimelineValueGraphRatio(45, range)).toBeCloseTo(0.5, 5);
});

test("the curve is the animation, easing and all", () => {
  const group = groupOf(keyed([[0, 0], [4, 100]]));
  const points = sampleToolcraftTimelineValueGraph({
    endSeconds: 4,
    group,
    sampleCount: 41,
    startSeconds: 0,
  });

  expect(points).toHaveLength(41);
  expect(points[0]?.value).toBeCloseTo(0, 5);
  expect(points[points.length - 1]?.value).toBeCloseTo(100, 5);

  // The default curve rests at both ends, so the drawn line has to be flatter
  // near the keyframes than in the middle. A straight line between the ends --
  // which is what drawing one point per keyframe would give -- would not.
  const climb = (index: number): number =>
    (points[index + 1]?.value ?? 0) - (points[index]?.value ?? 0);
  const middleClimb = climb(20);

  expect(climb(0)).toBeLessThan(middleClimb / 2);
  expect(climb(39)).toBeLessThan(middleClimb / 2);
  // And it is monotonic: a rest-to-rest ease never doubles back.
  for (let index = 0; index < points.length - 1; index += 1) {
    expect(climb(index), `sample ${index}`).toBeGreaterThanOrEqual(-1e-9);
  }
});

test("a hold draws as a step rather than a ramp", () => {
  const state = keyed([[0, 0], [4, 100]]);
  const held = run(state, {
    easing: { type: "step" },
    keyframeId: groupOf(state).keyframes[0]!.id,
    type: "timeline.changeKeyframeEasing",
  });
  const points = sampleToolcraftTimelineValueGraph({
    endSeconds: 4,
    group: groupOf(held),
    sampleCount: 41,
    startSeconds: 0,
  });

  // Everything before the end sits at the first value, so the graph shows a
  // flat run and one jump rather than a slope that was never drawn.
  expect(points.slice(0, 40).every((point) => point.value === 0)).toBe(true);
  expect(points[points.length - 1]?.value).toBe(100);
});

test("value and position convert back into each other", () => {
  const range = getToolcraftTimelineValueGraphRange(groupOf(keyed([[0, 0], [3, 90]])));

  // Dragging a point reads a position and writes a value, so a round trip that
  // does not land back where it started would make a point creep every time it
  // was picked up.
  for (const value of [range.minValue, 0, 45, 90, range.maxValue]) {
    const ratio = getToolcraftTimelineValueGraphRatio(value, range);
    expect(getToolcraftTimelineValueGraphValue(ratio, range)).toBeCloseTo(value, 9);
  }

  // Zero at the top, because that is how screen coordinates run.
  expect(getToolcraftTimelineValueGraphRatio(range.maxValue, range)).toBeCloseTo(0, 9);
  expect(getToolcraftTimelineValueGraphRatio(range.minValue, range)).toBeCloseTo(1, 9);
});

test("only tracks holding plain numbers can be drawn against an axis", () => {
  expect(isToolcraftTimelineValueGraphable(groupOf(keyed([[0, 0], [3, 90]])))).toBe(true);

  // A colour or a vector interpolates fine and has no single height, so the
  // graph declines it rather than drawing something meaningless.
  const colour = run(createToolcraftState(appSchema), {
    controlId: "export.includeBackground",
    controlLabel: "Background",
    timeSeconds: 0,
    type: "timeline.upsertControlKeyframe",
    value: "#112233",
    valueLabel: "#112233",
  });
  const colourGroup = colour.timeline.keyframeGroups.find(
    (group) => group.controlId === "export.includeBackground",
  );

  if (colourGroup) {
    expect(isToolcraftTimelineValueGraphable(colourGroup)).toBe(false);
  }
});
