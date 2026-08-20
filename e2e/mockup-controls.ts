import { expect, type Locator, type Page } from "@playwright/test";

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
