import { expect, test } from "vitest";

import {
  createToolcraftState,
  toolcraftReducer,
  type ToolcraftState,
} from "@/toolcraft/runtime";

import { appSchema } from "./app-schema";
import {
  readFramePose,
  readFramingTransform,
  readRasterSettings,
} from "./render/settings";
import { getMockupSceneRect } from "./scene-bounds";

/**
 * The switch that stops the camera answering the product.
 *
 * With Auto frame on the camera re-derives where it stands whenever the
 * product is leaned, resized or moved, which is what keeps the whole set in
 * shot and is also what partly cancels those controls: push the product bigger
 * and the camera backs away from it. Off, the camera stops on the frame it was
 * showing and those controls move the product inside it instead.
 *
 * The crop is what these read, because it is the one thing measurable without
 * a GPU that the camera's framing decides — `getMockupSceneRect` runs the same
 * fit the renderer does, off nothing but one state.
 */
function set(state: ToolcraftState, target: string, value: unknown): ToolcraftState {
  return toolcraftReducer(state, { target, type: "controls.setValue", value });
}

/** The shape of the frame, which is what the camera's fit decides. */
function frame(state: ToolcraftState): string {
  const rect = getMockupSceneRect(state);
  return `${rect.width}x${rect.height}`;
}

const values = (state: ToolcraftState) => state.values as Record<string, unknown>;

/** Switching off, the way the studio does it: flip the switch, keep the pose. */
function freeze(state: ToolcraftState): ToolcraftState {
  const captured = readRasterSettings(values(state)).transform;
  return set(set(state, "camera.autoFrame", false), "camera.framePose", captured);
}

const shirt = () => set(createToolcraftState(appSchema), "device.model", "tshirt");

test("auto frame off holds the framing the camera was left with", () => {
  const on = shirt();

  // On by default, and on, the camera answers the product: leaning the shirt
  // changes the shape of the frame that holds it.
  expect(readRasterSettings(values(on)).autoFrame).toBe(true);
  expect(readFramePose(values(on))).toBeNull();
  expect(frame(set(on, "device.tilt", 40))).not.toBe(frame(on));

  // Switching off does not move the picture. This is the promise the switch
  // makes and the reason the pose is captured rather than the framing being
  // reset to something neutral: the frame you were looking at is the frame you
  // keep, so there is nothing to re-compose after flipping it.
  const off = freeze(on);
  expect(frame(off), "switching Auto frame off must not move the picture").toBe(
    frame(on),
  );

  // And from there the transform moves the product inside that frame rather
  // than being answered by the camera.
  for (const [target, value] of [
    ["device.tilt", 40],
    ["device.roll", 35],
    ["device.scale", 250],
    ["device.positionX", 80],
    ["device.positionY", -60],
    ["device.positionZ", 40],
  ] as const) {
    expect(frame(set(off, target, value)), `${target} with auto frame off`).toBe(
      frame(off),
    );
  }

  // The two poses have genuinely parted company: the product is leaning and
  // the framing is not.
  const leaning = set(off, "device.tilt", 40);
  expect(readRasterSettings(values(leaning)).transform.tilt).toBe(40);
  expect(readFramingTransform(readRasterSettings(values(leaning))).tilt).toBe(0);
});

test("auto frame back on hands the camera back to the product", () => {
  const on = shirt();
  const off = freeze(on);
  const leaning = set(off, "device.tilt", 40);

  // Switching back on drops the frozen pose and the camera answers the product
  // again -- including the lean it was ignoring a moment ago.
  const again = set(set(leaning, "camera.autoFrame", true), "camera.framePose", null);
  expect(readFramePose(values(again))).toBeNull();
  expect(frame(again)).toBe(frame(set(on, "device.tilt", 40)));
  expect(frame(again)).not.toBe(frame(off));
});

test("a frozen pose is refused rather than trusted", () => {
  // The only value in this workspace no control renders, so it is the only one
  // that can carry something no control could have produced -- from an edited
  // store, an old file, or a settings import. A bad one has to fall back to
  // the live pose, because the alternative is a camera somewhere the panel
  // cannot explain and no control can recover from.
  const off = set(shirt(), "camera.autoFrame", false);

  for (const bad of [
    null,
    undefined,
    42,
    "somewhere",
    [],
    {},
    { offsetX: 0, offsetY: 0 },
    { offsetX: 0, offsetY: 0, offsetZ: 0, roll: 0, scale: 1, tilt: "40" },
    {
      offsetX: Number.NaN,
      offsetY: 0,
      offsetZ: 0,
      roll: 0,
      scale: 1,
      tilt: 0,
    },
    {
      offsetX: Number.POSITIVE_INFINITY,
      offsetY: 0,
      offsetZ: 0,
      roll: 0,
      scale: 1,
      tilt: 0,
    },
  ]) {
    const state = set(off, "camera.framePose", bad);
    const label = JSON.stringify(bad) ?? "undefined";
    expect(readFramePose(values(state)), label).toBeNull();
    // Falling back to the live pose, which is what an un-frozen camera does.
    expect(
      readFramingTransform(readRasterSettings(values(state))).tilt,
      label,
    ).toBe(readRasterSettings(values(state)).transform.tilt);
  }

  // A well-formed one is taken.
  const good = { offsetX: 0.1, offsetY: 0.2, offsetZ: 0.3, roll: 5, scale: 1.5, tilt: 10 };
  expect(readFramePose(values(set(off, "camera.framePose", good)))).toEqual(good);
});

test("the turntable is still steady with auto frame either way", () => {
  // Spin was taken out of the framing before this switch existed, and it stays
  // out of it on both sides: an animation must not start breathing again just
  // because somebody locked the camera, or stop being steady because they
  // unlocked it.
  for (const state of [shirt(), freeze(shirt())]) {
    const rest = frame(state);
    for (let spin = 0; spin < 360; spin += 15) {
      expect(frame(set(state, "device.spin", spin)), `spin ${spin}`).toBe(rest);
    }
  }
});
