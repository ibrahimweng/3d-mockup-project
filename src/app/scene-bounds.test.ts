import { describe, expect, it } from "vitest";

import type { ToolcraftState } from "@/toolcraft/runtime";

import { readGltfJson, readModelTriangles } from "./model-file-test-utils";
import { DEVICE_CATALOG, type DeviceId } from "./product-domain";
import { getMockupSceneRect } from "./scene-bounds";

/**
 * The provider reads nothing but `state.values`, which is what makes it a pure
 * function of one exact state and testable without a browser, a canvas or a
 * decoded model.
 */
function frameState(values: Record<string, unknown>): ToolcraftState {
  return { values } as unknown as ToolcraftState;
}

const headOn = { position: [0, 0, 5], up: [0, 1, 0] };
/** Along the phone's own plane, so it presents its thinnest axis. */
const edgeOn = { position: [5, 0, 0], up: [0, 1, 0] };

const deviceIds = Object.keys(DEVICE_CATALOG) as DeviceId[];

describe("infinite scene bounds", () => {
  it("infinite export crops to the product scene bounds", () => {
    const phone = getMockupSceneRect(
      frameState({ "camera.orbit": headOn, "device.model": "iphone-17-pro-max" }),
    );
    const laptop = getMockupSceneRect(
      frameState({ "camera.orbit": headOn, "device.model": "macbook" }),
    );

    // A phone stands up and a laptop lies down, so the crop has to as well.
    expect(phone.height).toBeGreaterThan(phone.width);
    expect(laptop.width).toBeGreaterThan(laptop.height);

    // Furniture is part of the scene, and this table is far wider than the
    // phone standing on it, so it turns the same crop the other way up.
    const onOak = getMockupSceneRect(
      frameState({
        "camera.orbit": headOn,
        "device.model": "iphone-17-pro-max",
        "surface.kind": "oak",
      }),
    );
    expect(onOak.width).toBeGreaterThan(onOak.height);
    expect(onOak.width / onOak.height).toBeGreaterThan(phone.width / phone.height);
  });

  it("centres every device's crop on the origin at a usable shape", () => {
    for (const id of deviceIds) {
      const rect = getMockupSceneRect(
        frameState({ "camera.orbit": headOn, "device.model": id }),
      );
      expect(Math.max(rect.width, rect.height), id).toBe(1350);
      // Even edges keep the corner on a whole pixel, so the runtime's outward
      // rounding cannot quietly hand back a frame a pixel larger than reported.
      expect(rect.width % 2, id).toBe(0);
      expect(rect.height % 2, id).toBe(0);
      expect(rect.x, id).toBe(-rect.width / 2);
      expect(rect.y, id).toBe(-rect.height / 2);
    }
  });

  /**
   * The frame is cut for the picture that is actually being taken.
   *
   * A crop measured off the catalog's resting proportions answers for a
   * product standing square-on, and nothing in the app keeps it standing that
   * way: spin, tilt and roll are three sliders at the top of the panel. The
   * shirt is 0.69 wide and 0.29 deep, so a quarter turn presents well under
   * half the width -- and the export kept the square-on frame around it, 57
   * per cent bare backdrop in two bands down the sides.
   */
  it("cuts the frame for the pose the product is actually in", () => {
    const square = getMockupSceneRect(
      frameState({ "camera.orbit": headOn, "device.model": "tshirt" }),
    );
    const turned = getMockupSceneRect(
      frameState({
        "camera.orbit": headOn,
        "device.model": "tshirt",
        "device.spin": 90,
      }),
    );
    // Side-on the shirt is its own depth across, which is well under half its
    // width, so the frame it wants is a good deal narrower.
    expect(turned.width / turned.height).toBeLessThan(
      (square.width / square.height) * 0.75,
    );

    // A lean puts the shirt's corners where its faces were, which is a taller
    // box than the one it rests in.
    const leaning = getMockupSceneRect(
      frameState({
        "camera.orbit": headOn,
        "device.model": "tshirt",
        "device.tilt": 40,
      }),
    );
    expect(leaning.width / leaning.height).toBeLessThan(square.width / square.height);

    // Size is not a shape, and neither is where the product is standing: both
    // move the picture without changing what shape of frame holds it, and a
    // crop that shifted under them would fight the controls rather than
    // follow them.
    for (const [target, value] of [
      ["device.scale", 140],
      ["device.positionX", 30],
      ["device.positionY", -20],
    ] as const) {
      const moved = getMockupSceneRect(
        frameState({ "camera.orbit": headOn, "device.model": "tshirt", [target]: value }),
      );
      expect(moved, target).toEqual(square);
    }
  });

  it("refuses to cut a strip out of a device seen edge on", () => {
    const rect = getMockupSceneRect(
      frameState({ "camera.orbit": edgeOn, "device.model": "iphone-17-pro-max" }),
    );
    // A phone edge on is fourteen times taller than it is deep, and the honest
    // frame for that is a sliver nobody can use. The clamp is what stops one
    // degree of orbit turning the export into a ribbon.
    expect(rect.width / rect.height).toBeCloseTo(1 / 3, 2);
  });

  it("keeps every measured device frame on its own bounding sphere", () => {
    for (const id of deviceIds) {
      const [x, y, z] = DEVICE_CATALOG[id].frame;
      // Half a box, over the radius of the sphere drawn round it, is the box's
      // half-diagonal over its own length: a unit vector, always. A digit
      // dropped or transposed while transcribing a measurement breaks this.
      expect(Math.hypot(x, y, z), id).toBeCloseTo(1, 5);
    }
  });

  /**
   * The frame is a measurement of a model, and a model can change under it.
   *
   * Being a unit vector, checked above, is what catches a mistyped digit. It
   * does not catch the other way a written-down measurement goes wrong, which
   * is the file moving on without it: the clipboard grew a clip jaw and the
   * frame kept saying the shape the board was before, still a perfectly good
   * unit vector and no longer the product. So the shape is taken off the GLB
   * here and compared with what the catalog claims.
   *
   * Files holding more than one product are left out rather than measured
   * wrongly -- the scene builder picks one of their scenes and this reads them
   * all, so an iMac standing beside a phone would be measured into the phone --
   * and so are devices with nodes hidden before the measurement, which are
   * named by node while what is read back here is named by mesh. Both
   * conditions are read rather than listed, so a model that grows either drops
   * out of this by itself.
   */
  it("measures every frame against the model it names", () => {
    for (const id of deviceIds) {
      const device = DEVICE_CATALOG[id];
      if (device.excludedNodes.length > 0) continue;
      if ((readGltfJson(device.modelFile).scenes?.length ?? 1) > 1) continue;

      const turn = ((device.yawDegrees ?? 0) * Math.PI) / 180;
      const cos = Math.cos(turn);
      const sin = Math.sin(turn);
      const lo = [Infinity, Infinity, Infinity];
      const hi = [-Infinity, -Infinity, -Infinity];
      for (const triangle of readModelTriangles(device.modelFile)) {
        for (const [x, y, z] of triangle.position) {
          // The yaw is applied before the box is taken, because it is applied
          // before the box is taken in the scene.
          const turned = [x * cos + z * sin, y, -x * sin + z * cos];
          for (const [axis, value] of turned.entries()) {
            if (value < lo[axis]) lo[axis] = value;
            if (value > hi[axis]) hi[axis] = value;
          }
        }
      }

      const half = [0, 1, 2].map((axis) => (hi[axis] - lo[axis]) / 2);
      const radius = Math.hypot(...half);
      for (const axis of [0, 1, 2]) {
        expect(half[axis] / radius, `${id} frame[${axis}]`)
          .toBeCloseTo(device.frame[axis], 3);
      }
    }
  });
});
