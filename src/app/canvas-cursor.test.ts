import { describe, expect, test } from "vitest";

import { canvasCursorFor, resolveCanvasGesture } from "./canvas-cursor";

const at = (patch: Partial<Parameters<typeof resolveCanvasGesture>[0]> = {}) =>
  resolveCanvasGesture({ hasDesign: true, isDragging: false, overScreen: false, ...patch });

describe("what the cursor says a press would do", () => {
  test("over the display it offers to move the design", () => {
    expect(at({ overScreen: true })).toBe("design");
    expect(canvasCursorFor[at({ overScreen: true })]).toBe("move");
  });

  test("anywhere else it offers to turn the device", () => {
    expect(at({ overScreen: false })).toBe("idle");
    expect(canvasCursorFor[at({ overScreen: false })]).toBe("grab");
  });

  test("with no design the display is just more device", () => {
    // Advertising a drag that would do nothing is worse than advertising none.
    expect(at({ hasDesign: false, overScreen: true })).toBe("idle");
  });
});

describe("what the cursor says a press is doing", () => {
  test("each gesture in progress has its own shape", () => {
    expect(at({ isDragging: "design" })).toBe("moving");
    expect(at({ isDragging: "turn" })).toBe("turning");
    expect(at({ isDragging: "view" })).toBe("view");
  });

  test("a gesture in progress wins over whatever is under the pointer", () => {
    // Mid-drag the pointer leaves the thing it grabbed; the shape must not
    // flicker back to the hover state while the drag is still running.
    expect(at({ isDragging: "turn", overScreen: true })).toBe("turning");
    expect(at({ hasDesign: false, isDragging: "design" })).toBe("moving");
  });

  test("every gesture maps to a real cursor keyword", () => {
    for (const cursor of Object.values(canvasCursorFor)) {
      expect(["move", "grab", "grabbing", "all-scroll"]).toContain(cursor);
    }
  });
});
