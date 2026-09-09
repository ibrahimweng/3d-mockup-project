import { expect, test } from "vitest";

import {
  createToolcraftState,
  evaluateToolcraftTimelineValue,
  toolcraftReducer,
  type ToolcraftCommand,
  type ToolcraftState,
} from "@/toolcraft/runtime";

import { appSchema } from "./app-schema";

/**
 * Shaping how motion arrives at a keyframe, not just how it leaves.
 *
 * A cubic segment has a handle at each end. Both used to belong to the
 * keyframe the segment left, so a keyframe had no say in how anything reached
 * it: easing a landing meant reaching back and shaping the keyframe before it,
 * which also changed how that one departed. After Effects gives every keyframe
 * an incoming and an outgoing handle; `easeIn` is the incoming one.
 *
 * Everything here is measured through `evaluateToolcraftTimelineValue`, the
 * same call the panel, the canvas and the video export all make, so a curve
 * that reads right here reads right in an exported frame.
 */
function run(state: ToolcraftState, ...commands: readonly ToolcraftCommand[]): ToolcraftState {
  return commands.reduce(toolcraftReducer, state);
}

/** Spin keyed at 0s, 2s and 4s, climbing by a hundred each time. */
function track(): ToolcraftState {
  return [0, 2, 4].reduce<ToolcraftState>(
    (state, timeSeconds) =>
      run(state, {
        controlId: "device.spin",
        controlLabel: "Spin",
        timeSeconds,
        type: "timeline.upsertControlKeyframe",
        value: timeSeconds * 50,
        valueLabel: `${timeSeconds * 50}`,
      }),
    createToolcraftState(appSchema),
  );
}

const idAt = (state: ToolcraftState, timeSeconds: number): string => {
  const keyframe = state.timeline.keyframeGroups
    .find((group) => group.controlId === "device.spin")
    ?.keyframes.find((item) => item.timeSeconds === timeSeconds);

  if (!keyframe) {
    throw new Error(`No keyframe at ${timeSeconds}s`);
  }

  return keyframe.id;
};

const at = (state: ToolcraftState, timeSeconds: number): number =>
  evaluateToolcraftTimelineValue(state, "device.spin", timeSeconds) as number;

/** How much of the segment's climb is still left in its last tenth. */
const arrivalSpeed = (state: ToolcraftState, endSeconds: number): number =>
  at(state, endSeconds) - at(state, endSeconds - 0.2);

/** A handle that arrives at full speed rather than settling into the keyframe. */
const chargingArrival = [0, 0, 1, 1] as const;

test("without an ease-in handle nothing changes", () => {
  // The whole compatibility claim: a keyframe carrying no `easeIn` leaves the
  // segment exactly as it was before the field existed, both handles owned by
  // the keyframe it leaves. Pinned to numbers rather than to a second
  // implementation, so a change to the resolution order has to break this.
  const state = track();

  expect(state.timeline.keyframeGroups[0]?.keyframes.every((k) => k.easeIn === undefined)).toBe(
    true,
  );
  expect(at(state, 0)).toBe(0);
  expect(at(state, 2)).toBe(100);
  expect(at(state, 4)).toBe(200);
  // The default curve rests at both ends, so the midpoint is the halfway value
  // and the segment is still nearly stopped a tenth before it arrives.
  expect(at(state, 1)).toBeCloseTo(50, 5);
  expect(arrivalSpeed(state, 2)).toBeLessThan(4);
});

test("an ease-in handle changes how the motion arrives, not how it leaves", () => {
  const rested = track();
  const charging = run(rested, {
    controlPoints: [...chargingArrival],
    keyframeId: idAt(rested, 2),
    type: "timeline.changeKeyframeEaseIn",
  });

  // Same keyframe values -- this shapes the path between them, never the ends.
  for (const timeSeconds of [0, 2, 4]) {
    expect(at(charging, timeSeconds)).toBe(at(rested, timeSeconds));
  }

  // The segment now arrives at speed instead of settling into the keyframe.
  expect(arrivalSpeed(charging, 2)).toBeGreaterThan(arrivalSpeed(rested, 2) * 3);

  // And it still leaves from rest. Worth being precise about what survives
  // here: a cubic's second handle reshapes the whole curve, not only its end,
  // so the values along the first half do move. What the departing keyframe
  // keeps is the slope it leaves at, which is its own handle's and nobody
  // else's -- so both still creep out of the first keyframe rather than
  // jumping, and neither covers more than a twentieth of the climb in the
  // first tenth of the segment.
  expect(at(rested, 0.2) - at(rested, 0)).toBeLessThan(5);
  expect(at(charging, 0.2) - at(charging, 0)).toBeLessThan(5);
});

test("an ease-in handle belongs to the segment before the keyframe, not after it", () => {
  // The distinction the whole feature rests on. Shaping the arrival at 2s must
  // leave 2s -> 4s alone; before this existed there was no way to say one
  // without saying the other.
  const rested = track();
  const charging = run(rested, {
    controlPoints: [...chargingArrival],
    keyframeId: idAt(rested, 2),
    type: "timeline.changeKeyframeEaseIn",
  });

  for (const timeSeconds of [2.5, 3, 3.5]) {
    expect(at(charging, timeSeconds), `${timeSeconds}s is after the eased keyframe`).toBeCloseTo(
      at(rested, timeSeconds),
      6,
    );
  }

  // The segment before it did move.
  expect(at(charging, 1.5)).not.toBeCloseTo(at(rested, 1.5), 3);
});

test("clearing an ease-in handle hands the segment back", () => {
  const rested = track();
  const charging = run(rested, {
    controlPoints: [...chargingArrival],
    keyframeId: idAt(rested, 2),
    type: "timeline.changeKeyframeEaseIn",
  });
  const cleared = run(charging, {
    controlPoints: null,
    keyframeId: idAt(charging, 2),
    type: "timeline.changeKeyframeEaseIn",
  });

  expect(
    cleared.timeline.keyframeGroups[0]?.keyframes.find((k) => k.timeSeconds === 2)?.easeIn,
  ).toBeUndefined();
  for (const timeSeconds of [0.5, 1, 1.5, 2.5, 3]) {
    expect(at(cleared, timeSeconds)).toBeCloseTo(at(rested, timeSeconds), 6);
  }
});

test("a curve applies to every selected keyframe at once", () => {
  // With multi-select, this is what "ease a whole track" is: select the lot,
  // pick a curve once, instead of one popover per keyframe.
  const state = track();
  const selected = run(
    state,
    {
      keyframeIds: [idAt(state, 2), idAt(state, 4)],
      type: "timeline.setKeyframeSelection",
    },
    {
      applyToSelection: true,
      controlPoints: [...chargingArrival],
      keyframeId: idAt(state, 2),
      type: "timeline.changeKeyframeEaseIn",
    },
  );

  const eased = selected.timeline.keyframeGroups[0]?.keyframes ?? [];
  expect(eased.find((k) => k.timeSeconds === 2)?.easeIn).toEqual([...chargingArrival]);
  expect(eased.find((k) => k.timeSeconds === 4)?.easeIn).toEqual([...chargingArrival]);
  // The first keyframe was not selected, so it was not touched -- and it has no
  // segment arriving at it anyway.
  expect(eased.find((k) => k.timeSeconds === 0)?.easeIn).toBeUndefined();

  // Both segments now arrive at speed.
  expect(arrivalSpeed(selected, 2)).toBeGreaterThan(arrivalSpeed(state, 2) * 3);
  expect(arrivalSpeed(selected, 4)).toBeGreaterThan(arrivalSpeed(state, 4) * 3);
});

test("a curve aimed outside the selection applies only to itself", () => {
  // Shaping a keyframe that is not selected means that keyframe, whatever else
  // happens to be highlighted somewhere else on the timeline.
  const state = track();
  const applied = run(
    state,
    { keyframeIds: [idAt(state, 4)], type: "timeline.setKeyframeSelection" },
    {
      applyToSelection: true,
      controlPoints: [...chargingArrival],
      keyframeId: idAt(state, 2),
      type: "timeline.changeKeyframeEaseIn",
    },
  );

  const keyframes = applied.timeline.keyframeGroups[0]?.keyframes ?? [];
  expect(keyframes.find((k) => k.timeSeconds === 2)?.easeIn).toEqual([...chargingArrival]);
  expect(keyframes.find((k) => k.timeSeconds === 4)?.easeIn).toBeUndefined();
});

test("a continuous keyframe still wins the handle it shares with an ease-in", () => {
  // Both want the handle arriving at the keyframe. Continuous says something an
  // ease-in cannot -- carry through at the speed the neighbours imply -- so it
  // is applied last and wins, and the result has to match a continuous keyframe
  // with no ease-in at all.
  const state = track();
  const continuousOnly = run(state, {
    easing: { type: "continuous" },
    keyframeId: idAt(state, 2),
    type: "timeline.changeKeyframeEasing",
  });
  const both = run(continuousOnly, {
    controlPoints: [...chargingArrival],
    keyframeId: idAt(continuousOnly, 2),
    type: "timeline.changeKeyframeEaseIn",
  });

  for (const timeSeconds of [0.5, 1, 1.5, 1.9]) {
    expect(at(both, timeSeconds), `${timeSeconds}s`).toBeCloseTo(at(continuousOnly, timeSeconds), 6);
  }
});

test("a hold still ignores both handles", () => {
  // A hold is absolute: it shortcuts the whole curve, so an ease-in on the
  // keyframe it lands on cannot leak a slope into a segment that is meant to
  // be a step.
  const state = track();
  const held = run(
    state,
    { easing: { type: "step" }, keyframeId: idAt(state, 0), type: "timeline.changeKeyframeEasing" },
    {
      controlPoints: [...chargingArrival],
      keyframeId: idAt(state, 2),
      type: "timeline.changeKeyframeEaseIn",
    },
  );

  for (const timeSeconds of [0.5, 1, 1.9]) {
    expect(at(held, timeSeconds), `${timeSeconds}s is inside the held segment`).toBe(0);
  }
  expect(at(held, 2)).toBe(100);
});
