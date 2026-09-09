import { expect, test } from "vitest";

import {
  createToolcraftState,
  evaluateToolcraftTimelineValue,
  toolcraftReducer,
  type ToolcraftCommand,
  type ToolcraftState,
} from "@/toolcraft/runtime";
import { describeToolcraftOrientationPose } from "@/toolcraft/runtime/react";
import {
  interpolateToolcraftOrientation,
  isToolcraftOrientationValue,
  slerpToolcraftUnitVectors,
} from "@/toolcraft/runtime/state/timeline-orientation-interpolation";

import { appSchema } from "./app-schema";
import { orbitCommand, turn } from "./view-orbit";

/**
 * Animating where the camera stands.
 *
 * The camera pose is `{ position, up }`, and both are directions. Every other
 * keyframed value is interpolated component by component, and doing that to a
 * direction does not orbit: it cuts through the sphere the camera is supposed
 * to travel around, arriving nearer the product in the middle than at either
 * end, and for a half turn it lands exactly on the product with no direction
 * left to point along. These are the tests that the timeline goes round.
 */
function run(state: ToolcraftState, ...commands: readonly ToolcraftCommand[]): ToolcraftState {
  return commands.reduce(toolcraftReducer, state);
}

const pose = (position: readonly number[], up: readonly number[] = [0, 1, 0]) => ({
  position: [...position],
  up: [...up],
});

const length = (v: readonly number[]) => Math.hypot(v[0]!, v[1]!, v[2]!);
const degreesBetween = (a: readonly number[], b: readonly number[]) =>
  (Math.acos(
    Math.max(
      -1,
      Math.min(1, (a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!) / (length(a) * length(b))),
    ),
  ) *
    180) /
  Math.PI;

const front = pose([0, 0, 1]);
const side = pose([1, 0, 0]);
const back = pose([0, 0, -1]);

test("a quarter turn is a quarter turn all the way along", () => {
  // Component-wise interpolation gives 18.4, 45, 71.6 degrees at the quarters
  // and pulls the camera in to 0.707 of its distance halfway. Going round the
  // sphere gives even degrees and a constant distance, which is what dragging
  // the gizmo slowly does.
  for (const [progress, expected] of [
    [0.25, 22.5],
    [0.5, 45],
    [0.75, 67.5],
  ] as const) {
    const at = interpolateToolcraftOrientation(front, side, progress);

    expect(degreesBetween(front.position, at.position), `${progress}`).toBeCloseTo(expected, 6);
    expect(length(at.position), `distance at ${progress}`).toBeCloseTo(1, 9);
  }
});

test("a half turn goes round the product rather than through it", () => {
  // The case that made the old rule right: interpolated straight, the midpoint
  // of a half turn is the zero vector -- the camera is at the product and has
  // no direction at all.
  for (const progress of [0.1, 0.25, 0.5, 0.75, 0.9]) {
    const at = interpolateToolcraftOrientation(front, back, progress);

    expect(length(at.position), `distance at ${progress}`).toBeCloseTo(1, 9);
    expect(Number.isFinite(at.position[0])).toBe(true);
  }

  // And it really does turn: halfway is a right angle from both ends.
  const midpoint = interpolateToolcraftOrientation(front, back, 0.5);
  expect(degreesBetween(front.position, midpoint.position)).toBeCloseTo(90, 6);
  expect(degreesBetween(back.position, midpoint.position)).toBeCloseTo(90, 6);
});

test("the ends are exactly the poses that were keyed", () => {
  expect(interpolateToolcraftOrientation(front, side, 0).position).toEqual(front.position);
  expect(interpolateToolcraftOrientation(front, side, 1).position.map((v) => Math.round(v)))
    .toEqual(side.position);
});

test("distance travels in a straight line while the direction goes round", () => {
  // Keyed close and to the front, then far and to the side, the camera should
  // sweep round while pulling back -- not swing wide and come in, which is what
  // slerping the whole vector including its length would do.
  const near = pose([0, 0, 2]);
  const far = pose([6, 0, 0]);

  for (const [progress, expected] of [
    [0.25, 3],
    [0.5, 4],
    [0.75, 5],
  ] as const) {
    const at = interpolateToolcraftOrientation(near, far, progress);

    expect(length(at.position), `distance at ${progress}`).toBeCloseTo(expected, 9);
    expect(degreesBetween(near.position, at.position), `angle at ${progress}`).toBeCloseTo(
      90 * progress,
      6,
    );
  }
});

test("up is carried round too, so the horizon does not tip mid-turn", () => {
  // Lerping two up vectors shortens the result in the middle and, once
  // normalised, tips it further than either end asked for.
  const rolled = interpolateToolcraftOrientation(
    pose([0, 0, 1], [0, 1, 0]),
    pose([0, 0, 1], [1, 0, 0]),
    0.5,
  );

  expect(length(rolled.up)).toBeCloseTo(1, 9);
  expect(degreesBetween([0, 1, 0], rolled.up)).toBeCloseTo(45, 6);
});

test("a degenerate pose is handed back rather than turned into a NaN", () => {
  // A stored file is the one place a pose with no direction can come from, and
  // there is nothing to point a camera along in it.
  const nowhere = pose([0, 0, 0]);

  expect(interpolateToolcraftOrientation(nowhere, side, 0.5)).toEqual(nowhere);
  expect(interpolateToolcraftOrientation(front, nowhere, 0.5)).toEqual(front);
  // Two identical directions are their own answer rather than a division by a
  // sine of zero.
  const same = interpolateToolcraftOrientation(front, front, 0.5);
  expect(same.position.every((component) => Number.isFinite(component))).toBe(true);
  expect(degreesBetween(front.position, same.position)).toBeCloseTo(0, 6);
});

test("only a camera pose takes the spherical path", () => {
  // Narrow on purpose: a record that merely has a position would change how it
  // animates if it were swept up by this.
  expect(isToolcraftOrientationValue({ position: [0, 0, 1], up: [0, 1, 0] })).toBe(true);
  for (const notAPose of [
    { position: [0, 0, 1] },
    { position: [0, 0, 1], up: [0, 1, 0], zoom: 2 },
    { position: [0, 0], up: [0, 1, 0] },
    { position: [0, 0, Number.NaN], up: [0, 1, 0] },
    { x: 1, y: 2 },
    [0, 0, 1],
    null,
  ]) {
    expect(isToolcraftOrientationValue(notAPose), JSON.stringify(notAPose)).toBe(false);
  }
});

test("the camera can be keyed, and the timeline evaluates the pose round the sphere", () => {
  // End to end through the real reducer and this product's own schema, which is
  // the claim that matters: the control accepts keyframes at all, and what the
  // renderer reads back at a time between them is a swept pose.
  const keyed = run(
    createToolcraftState(appSchema),
    {
      controlId: "camera.orbit",
      controlLabel: "Orbit",
      timeSeconds: 0,
      type: "timeline.upsertControlKeyframe",
      value: front,
      valueLabel: "front",
    },
    {
      controlId: "camera.orbit",
      controlLabel: "Orbit",
      timeSeconds: 4,
      type: "timeline.upsertControlKeyframe",
      value: side,
      valueLabel: "side",
    },
  );

  expect(
    keyed.timeline.keyframeGroups.find((group) => group.controlId === "camera.orbit")?.keyframes,
  ).toHaveLength(2);

  const midpoint = evaluateToolcraftTimelineValue(keyed, "camera.orbit", 2) as {
    position: number[];
  };

  expect(degreesBetween(front.position, midpoint.position)).toBeCloseTo(45, 4);
  expect(length(midpoint.position)).toBeCloseTo(1, 6);
});

test("slerp keeps its footing at both ends of the arc", () => {
  // Nearly parallel divides by a sine near zero, and exactly opposite has no
  // shortest arc to prefer. Both are guarded, and both must still come back
  // with a unit vector rather than a NaN.
  const almost = slerpToolcraftUnitVectors([0, 0, 1], [0, 0.0001, 0.99999999], 0.5);
  expect(length(almost)).toBeCloseTo(1, 6);

  const opposite = slerpToolcraftUnitVectors([0, 0, 1], [0, 0, -1], 0.5);
  expect(length(opposite)).toBeCloseTo(1, 6);
  expect(degreesBetween([0, 0, 1], opposite)).toBeCloseTo(90, 4);
});

/**
 * Dragging the product once the camera is keyed.
 *
 * The interpolation above is only half of a keyframeable camera. The other
 * half is that the thing you actually do -- drag the product round -- has to
 * reach the track. It did not: the drag wrote `state.values`, which nothing
 * reads once a control is keyed, so the camera sat still while the pointer
 * moved and no second keyframe ever appeared.
 */
const drag = (state: ToolcraftState, pixels: number, group?: string) => {
  const keyed = state.timeline.keyframeGroups.some(
    (item) => item.controlId === "camera.orbit",
  );
  const pose = evaluateToolcraftTimelineValue(
    state,
    "camera.orbit",
  ) as { position: [number, number, number]; up: [number, number, number] };

  return run(state, orbitCommand(keyed, turn(pose, pixels, 0), group));
};

test("a turn goes into the value while the camera is not keyed", () => {
  // Unchanged behaviour, and the reason this is a test: the camera is not keyed
  // in most sessions, and a drag then has nowhere to go but the value.
  const dragged = drag(createToolcraftState(appSchema), 100);

  expect(dragged.timeline.keyframeGroups).toHaveLength(0);
  expect(dragged.values["camera.orbit"]).not.toEqual(
    createToolcraftState(appSchema).values["camera.orbit"],
  );
});

test("a turn goes into a keyframe at the playhead once the camera is keyed", () => {
  const keyed = run(
    createToolcraftState(appSchema),
    { currentTimeSeconds: 0, type: "timeline.setCurrentTime" },
    {
      controlId: "camera.orbit",
      controlLabel: "Camera",
      type: "timeline.upsertControlKeyframe",
      value: front,
      valueLabel: "front",
    },
    { currentTimeSeconds: 4, type: "timeline.setCurrentTime" },
  );
  const before = keyed.values["camera.orbit"];
  const dragged = drag(keyed, 200);
  const group = dragged.timeline.keyframeGroups.find(
    (item) => item.controlId === "camera.orbit",
  );

  // A second keyframe, at the frame the playhead is on rather than at the one
  // that happened to be selected.
  expect(group?.keyframes.map((keyframe) => keyframe.timeSeconds)).toEqual([0, 4]);
  // And the raw value is left alone, because nothing reads it while the track
  // exists and writing it would only put a stale pose in the saved file.
  expect(dragged.values["camera.orbit"]).toEqual(before);

  // What the renderer now reads at 4s is where the drag put the camera.
  const at = evaluateToolcraftTimelineValue(dragged, "camera.orbit", 4) as {
    position: number[];
  };
  expect(degreesBetween(front.position, at.position)).toBeCloseTo(200 * 0.4, 4);
});

test("a drag starts from the pose on screen, not from the value under it", () => {
  // Between two keyframes the camera is wherever the track says, and
  // `state.values` still holds whatever it was before the first keyframe was
  // laid down. Grabbing the product has to continue from the picture.
  const keyed = run(
    createToolcraftState(appSchema),
    {
      controlId: "camera.orbit",
      controlLabel: "Camera",
      timeSeconds: 0,
      type: "timeline.upsertControlKeyframe",
      value: front,
      valueLabel: "front",
    },
    {
      controlId: "camera.orbit",
      controlLabel: "Camera",
      timeSeconds: 4,
      type: "timeline.upsertControlKeyframe",
      value: side,
      valueLabel: "side",
    },
    { currentTimeSeconds: 2, type: "timeline.setCurrentTime" },
  );
  const onScreen = evaluateToolcraftTimelineValue(keyed, "camera.orbit", 2) as {
    position: number[];
  };

  expect(degreesBetween(front.position, onScreen.position)).toBeCloseTo(45, 4);

  const nudged = drag(keyed, 10);
  const at = evaluateToolcraftTimelineValue(nudged, "camera.orbit", 2) as {
    position: number[];
  };

  // Four degrees on from where it already was, not four degrees from the stale
  // raw value -- which is the default pose, some 20 degrees the other side.
  expect(degreesBetween(onScreen.position, at.position)).toBeCloseTo(4, 4);
});

test("one drag is one thing to undo", () => {
  // A drag writes a keyframe on every animation frame it lasts. Without a
  // history group each of those is its own entry, so turning the camera for a
  // second would take sixty presses of undo to take back -- and the one press
  // anybody would actually make would leave the camera somewhere it was only
  // ever passing through.
  const keyed = run(createToolcraftState(appSchema), {
    controlId: "camera.orbit",
    controlLabel: "Camera",
    timeSeconds: 0,
    type: "timeline.upsertControlKeyframe",
    value: front,
    valueLabel: "front",
  });
  const entriesBefore = keyed.history.undo.length;
  let dragging = run(keyed, { currentTimeSeconds: 4, type: "timeline.setCurrentTime" });

  for (let frame = 0; frame < 20; frame += 1) {
    dragging = drag(dragging, 10, "view-orbit-1");
  }

  expect(dragging.history.undo.length - entriesBefore).toBe(1);
  expect(
    dragging.timeline.keyframeGroups.find((item) => item.controlId === "camera.orbit")
      ?.keyframes,
  ).toHaveLength(2);

  // And that one entry puts the track back to the single keyframe it had.
  const undone = run(dragging, { type: "history.undo" });
  expect(
    undone.timeline.keyframeGroups.find((item) => item.controlId === "camera.orbit")
      ?.keyframes,
  ).toHaveLength(1);

  // A second drag is a second entry: the group is per gesture, not per control.
  const again = drag(
    run(dragging, { currentTimeSeconds: 2, type: "timeline.setCurrentTime" }),
    10,
    "view-orbit-2",
  );
  expect(again.history.undo.length - entriesBefore).toBe(2);
});

test("a camera keyframe is named by where the camera is standing", () => {
  // The tooltip on the diamond. Before the pose had a label of its own this
  // fell through to the control's type and read "orientationGizmo".
  const keyed = drag(
    run(createToolcraftState(appSchema), {
      controlId: "camera.orbit",
      controlLabel: "Camera",
      timeSeconds: 0,
      type: "timeline.upsertControlKeyframe",
      value: front,
      valueLabel: describeToolcraftOrientationPose(front),
    }),
    0,
  );
  const labels = keyed.timeline.keyframeGroups
    .find((item) => item.controlId === "camera.orbit")
    ?.keyframes.map((keyframe) => keyframe.valueLabel);

  expect(labels).toEqual(["0°, 0°"]);
  expect(describeToolcraftOrientationPose(side)).toBe("90°, 0°");
  // Overhead, which needs an up vector that is not the way it is looking: a
  // camera straight above the product with up still pointing at the sky has no
  // orientation at all, which is why the next line reads "Pose".
  expect(describeToolcraftOrientationPose(pose([0, 1, 0], [0, 0, 1]))).toBe("0°, 90°");
  expect(describeToolcraftOrientationPose(pose([0, 1, 0]))).toBe("Pose");
  // Nor has a camera standing on the product itself.
  expect(describeToolcraftOrientationPose({ position: [0, 0, 0], up: [0, 1, 0] })).toBe("Pose");
});
