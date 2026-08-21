import { describe, expect, it } from "vitest";

import type { ToolcraftState } from "@/toolcraft/runtime";

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
});
