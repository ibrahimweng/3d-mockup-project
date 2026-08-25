/**
 * What the pointer looks like over the canvas.
 *
 * Three gestures share this surface and none of them had any on-screen sign
 * that it existed: dragging the screen moves the design, dragging the body
 * turns the device, the middle button moves the board. A person who does not
 * already know that has no way to find out. The cursor is the cheapest way to
 * say it — the shape changes as the pointer crosses onto the display, which is
 * the moment the meaning of a drag changes.
 */
export type CanvasGesture = "design" | "idle" | "moving" | "turning" | "view";

export const canvasCursorFor: Readonly<Record<CanvasGesture, string>> = {
  /** Over the display with something on it: a press moves the design. */
  design: "move",
  /** Over the device or the room: a press turns the subject. */
  idle: "grab",
  /** Mid-drag on the design. */
  moving: "move",
  /** Mid-drag on the device. */
  turning: "grabbing",
  /** Mid-drag with the middle button. */
  view: "all-scroll",
};

export function resolveCanvasGesture({
  hasDesign,
  isDragging,
  overScreen,
}: {
  hasDesign: boolean;
  isDragging: false | "design" | "turn" | "view";
  overScreen: boolean;
}): CanvasGesture {
  if (isDragging === "view") return "view";
  if (isDragging === "design") return "moving";
  if (isDragging === "turn") return "turning";
  // With no design loaded the display is just another part of the device, so
  // it must not advertise a drag that would do nothing.
  return hasDesign && overScreen ? "design" : "idle";
}

export function resolveCanvasCursor(options: Parameters<typeof resolveCanvasGesture>[0]): string {
  return canvasCursorFor[resolveCanvasGesture(options)];
}
