import { expect, type Locator, type Page } from "@playwright/test";

import { getToolcraftControlFieldByTarget } from "./browser-control-target-helpers";

/**
 * Driving this product's own controls from a browser test.
 *
 * Every helper here takes the control field the proof session resolved from a
 * schema target, so a test says which control it is using in the one place the
 * evidence is keyed from, and cannot drift onto a different one.
 */

/** Choose an option from a select, by its visible label. */
export async function pickOption(control: Locator, label: string): Promise<void> {
  const combobox = control.locator("[role=combobox]").first();
  await combobox.scrollIntoViewIfNeeded();
  await combobox.click();
  const option = control
    .page()
    .locator("[role=listbox]:visible [role=option]", { hasText: new RegExp(`^${label}$`) })
    .first();
  await option.click();
  await expect(combobox).toContainText(label);
}

/** Whatever a select is showing now, so a test can pick something else. */
export async function readOption(control: Locator): Promise<string> {
  return (await control.locator("[role=combobox]").first().innerText()).trim();
}

/**
 * Put a slider at a value.
 *
 * Clicked on the track rather than typed, because that is what a person does,
 * and clamped just inside it: a click on the very end of the track lands on the
 * boundary and does not register, which is a fault that has already reported a
 * control as broken when it was the driving that was.
 */
export async function setSlider(control: Locator, value: number): Promise<number> {
  const input = control.locator("input[type=range]").first();
  const min = Number((await input.getAttribute("min")) ?? 0);
  const max = Number((await input.getAttribute("max")) ?? 100);
  const thumb = control.locator('[data-slot="slider-thumb"]').first();
  await thumb.scrollIntoViewIfNeeded();
  const track = control.locator('[data-slot="slider-track"], [data-slot="slider"]').first();
  const box = (await track.boundingBox()) ?? (await thumb.boundingBox());
  if (!box) throw new Error("Slider has no box to click.");
  const fraction = Math.min(0.97, Math.max(0.03, (value - min) / (max - min)));
  await control.page().mouse.click(box.x + box.width * fraction, box.y + box.height / 2);
  return Number(await input.inputValue());
}

/** The value a slider is holding. */
export async function readSlider(control: Locator): Promise<number> {
  return Number(await control.locator("input[type=range]").first().inputValue());
}

/** Wait for the scene to stop changing, so a comparison is against a finished frame. */
export async function settle(page: Page, canvas: Locator): Promise<void> {
  let previous: Buffer | null = null;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const shot = await canvas.screenshot();
    if (previous && Buffer.compare(previous, shot) === 0) return;
    previous = shot;
    await page.waitForTimeout(400);
  }
}

/** Type a colour into a swatch's hex field. */
export async function setColor(control: Locator, hex: string): Promise<void> {
  const field = control.locator('input[aria-label$="hex"]').first();
  await field.scrollIntoViewIfNeeded();
  await field.fill(hex);
  await field.press("Enter");
  await expect(field).toHaveValue(new RegExp(hex.replace("#", "#?"), "i"));
}

/** Every label a select is offering, in order. */
export async function readOptions(control: Locator): Promise<string[]> {
  const combobox = control.locator("[role=combobox]").first();
  await combobox.scrollIntoViewIfNeeded();
  await combobox.click();
  const labels = (
    await control.page().locator("[role=listbox]:visible [role=option]").allTextContents()
  ).map((label) => label.trim());
  await control.page().keyboard.press("Escape");
  return labels;
}

/**
 * Put a design on the device's display.
 *
 * Through the control's own file input rather than a drop on the canvas: the
 * schema declares one image fileDrop for this, and a test that uploads some
 * other way is not exercising the control the evidence is keyed to.
 */
export async function uploadDesign(control: Locator): Promise<void> {
  await control
    .locator('input[type="file"]')
    .first()
    .setInputFiles("e2e/fixtures/mockup-design.png");
}

/** Choose from a segmented control, which is a toggle group rather than a select. */
export async function pickSegment(control: Locator, label: string): Promise<void> {
  const item = control.locator(`[aria-label="${label}"]`).first();
  await item.scrollIntoViewIfNeeded();
  await item.click();
  await expect(item).toHaveAttribute("data-pressed", /.*/);
}

/** Every label a segmented control is offering, in order. */
export async function readSegments(control: Locator): Promise<string[]> {
  const group = control.locator("[role=group], [role=radiogroup]").first();
  const items = group.locator("button");
  return (await items.evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute("aria-label") ?? ""),
  )).filter(Boolean);
}

/**
 * Click an X/Y pad at a value in its own units.
 *
 * A pad reads -1..1 across its box with zero at the centre, and its y axis runs
 * down the screen. Kept just inside the border, because a click on the exact
 * edge does not register — which once reported four different corners as the
 * centred default.
 */
export async function setPad(control: Locator, x: number, y: number): Promise<void> {
  const pad = control.locator('[aria-label$="X/Y pad"]').first();
  await pad.scrollIntoViewIfNeeded();
  const box = await pad.boundingBox();
  if (!box) throw new Error("Pad has no box to click.");
  const grip = (value: number) => Math.min(0.98, Math.max(0.02, (value + 1) / 2));
  await control
    .page()
    .mouse.click(box.x + box.width * grip(x), box.y + box.height * grip(y));
}

/**
 * Where every pad's handle is, read from the custom property the control writes
 * it with. Takes no arguments because an observation is serialised into the
 * page and cannot carry a closure with it.
 */
export function padHandles(root: HTMLElement): Record<string, { x: string; y: string }> {
  const handles: Record<string, { x: string; y: string }> = {};
  for (const pad of root.querySelectorAll<HTMLElement>('[aria-label$="X/Y pad"]')) {
    const label = (pad.getAttribute("aria-label") ?? "").replace(/ X\/Y pad$/, "");
    handles[label] = {
      x: pad.style.getPropertyValue("--xy-pad-x").trim(),
      y: pad.style.getPropertyValue("--xy-pad-y").trim(),
    };
  }
  return handles;
}

/** Where a pad puts its handle for a value, in that pad's own coordinate mode. */
export async function padHandleFor(
  page: Page,
  padLabel: string,
  x: number,
  y: number,
): Promise<{ x: string; y: string }> {
  const mode = await page
    .locator(`[aria-label="${padLabel} X/Y pad"]`)
    .first()
    .getAttribute("data-vector-pad-coordinate-mode");
  return {
    x: `${(x + 1) * 50}%`,
    y: mode === "cartesian" ? `${(1 - (y + 1) / 2) * 100}%` : `${((y + 1) / 2) * 100}%`,
  };
}

/**
 * Flip a switch, found by the schema target it writes.
 *
 * By target rather than by name: these switches carry their label as sibling
 * text rather than an accessible name, so asking for a switch called "Infinity
 * canvas" waits forever.
 */
export async function toggleSwitch(page: Page, target: string): Promise<boolean> {
  const field = await getToolcraftControlFieldByTarget(page, target);
  const control = field.locator('[role="switch"]').first();
  await control.scrollIntoViewIfNeeded();
  await control.click();
  await page.waitForTimeout(1_200);
  return (await control.getAttribute("aria-checked")) === "true";
}

/**
 * The box the device's own pixels occupy in a frame, as fractions of that
 * frame.
 *
 * A luma threshold rather than a background colour match, because the set
 * wears the background colour and hands it back shaded: the backdrop runs from
 * 0 to 20 and reaches every edge of every frame, so counting pixels by
 * distance from the background colour calls the whole picture content and
 * measures nothing. The device sits well clear of that — the box it reports is
 * unchanged anywhere from a threshold of 32 up to 128 — so 32 is the gap
 * between the two rather than a tuned number.
 *
 * Decoded at the frame's own resolution. A resampled copy is no use here: a
 * MacBook's lid is a hairline of aluminium around a black screen, and a sample
 * that steps over it reports the laptop a tenth shorter than it is.
 */
export async function subjectBox(
  page: Page,
  png: Buffer,
): Promise<
  Readonly<{
    /** The frame itself, in pixels, so a shape can be compared across frames. */
    frame: Readonly<{ height: number; width: number }>;
    height: number;
    width: number;
    x: number;
    y: number;
  }>
> {
  const measured = await page.evaluate(async (encoded) => {
    const binary = atob(encoded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
    // Read once and held: closing a bitmap zeroes its width and height, and
    // dividing by that afterwards reports every frame as filled infinitely
    // rather than failing — a measurement that cannot be believed and does not
    // look wrong.
    const { height, width } = bitmap;
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No 2D context to decode the frame into.");
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    const { data } = context.getImageData(0, 0, width, height);
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4;
        const luma =
          0.299 * data[offset] +
          0.587 * data[offset + 1] +
          0.114 * data[offset + 2];
        if (luma <= 32) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    return maxX < 0
      ? null
      : {
          frame: { height, width },
          height: (maxY - minY + 1) / height,
          width: (maxX - minX + 1) / width,
          x: minX / width,
          y: minY / height,
        };
  }, png.toString("base64"));
  if (!measured) throw new Error("The frame holds no device pixels.");
  // A fraction of a frame cannot exceed the frame. Checked rather than assumed,
  // because a broken instrument that still reports a number is worse than one
  // that reports nothing: every assertion resting on it would pass.
  for (const [axis, value] of Object.entries(measured)) {
    if (axis !== "frame" && !((value as number) >= 0 && (value as number) <= 1)) {
      throw new Error(`Measured ${axis} of ${value} is not a fraction of a frame.`);
    }
  }
  return measured;
}

/** How wide the subject is against how tall, in pixels rather than fractions. */
export function subjectShape(
  box: Awaited<ReturnType<typeof subjectBox>>,
): number {
  return (box.width * box.frame.width) / (box.height * box.frame.height);
}
