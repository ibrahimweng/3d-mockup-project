import { expect } from "@playwright/test";

import { test } from "./toolcraft-product-test";

test.setTimeout(600_000);

const welcomeSelector = '[data-slot="mockup-first-run"]';
const guideSelector = '[data-slot="mockup-guide"]';

/**
 * The parts of this app that exist to explain it.
 *
 * Every assertion here is one that failed at least once while it was being
 * written, which is the only reason any of them are worth running: the
 * welcome's buttons were unclickable, its content was invisible to a screen
 * reader, and the cursor said nothing about what a drag would do.
 */
test("browser: a first-time visitor is welcomed, and can open the guide from it", async ({
  page,
}) => {
  await page.setViewportSize({ height: 900, width: 1440 });
  // The welcome stands down for automated sessions, because otherwise it sits
  // over whatever every other proof is trying to click. This is the one test
  // that wants to see it, so it presents itself as an ordinary browser.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
  });
  await page.goto("/");
  await page.waitForTimeout(6_000);

  const welcome = page.locator(welcomeSelector);
  const guide = page.locator(guideSelector);

  await expect(welcome).toBeVisible({ timeout: 20_000 });
  await expect(welcome.locator("ol li")).toHaveCount(3);

  // Addressable by role, not merely present. The dialog was previously
  // portaled into a container that the modal itself marks `aria-hidden`, so
  // its buttons were visible, clickable and completely invisible to a screen
  // reader.
  const showMe = page.getByRole("button", { name: "Show me how" });
  await expect(showMe).toHaveCount(1);

  // Clicked with a real mouse. An ordinary onClick never runs on a button
  // inside a dialog here: the press and the release land on different
  // elements, so the browser synthesises no click at all.
  await showMe.click();
  await expect(welcome).toBeHidden({ timeout: 10_000 });
  await expect(guide).toBeVisible({ timeout: 10_000 });
  await expect(guide.locator("[data-guide-topic]")).toHaveCount(6);

  // Pressing outside closes it — the primitive does not do this on its own.
  await page.mouse.click(60, 830);
  await expect(guide).toBeHidden({ timeout: 10_000 });

  // And it is reachable again from the toolbar, for everyone who dismissed
  // the welcome without reading it.
  await page.getByRole("button", { name: "How to use this" }).click();
  await expect(guide).toBeVisible({ timeout: 10_000 });
  await page.keyboard.press("Escape");
  await expect(guide).toBeHidden({ timeout: 10_000 });

  // The welcome is for the first visit only.
  await page.reload();
  await page.waitForTimeout(5_000);
  await expect(welcome).toHaveCount(0);
});

test("browser: the canvas says what a drag will do, and the arrows move the device", async ({
  page,
}) => {
  await page.setViewportSize({ height: 900, width: 1440 });
  await page.goto("/");
  await page.waitForTimeout(6_000);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);

  const canvas = page.locator("canvas").first();
  const box = (await canvas.boundingBox())!;
  const cursor = () =>
    page.evaluate(() => {
      const node = document.querySelector("canvas");
      return node ? node.style.cursor : "";
    });

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect.poll(cursor, { timeout: 10_000 }).toBe("grab");

  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2);
  await expect.poll(cursor, { timeout: 10_000 }).toBe("grabbing");
  await page.mouse.up();
  await expect.poll(cursor, { timeout: 10_000 }).toBe("grab");

  // An arrow nudges the device, without the pointer being anywhere near a
  // control.
  const readX = () =>
    page.evaluate(() => {
      const raw = localStorage.getItem("toolcraft:mockup-studio:state:v2");
      return raw ? Number(JSON.parse(raw).state?.values?.["device.positionX"] ?? 0) : null;
    });
  const before = (await readX()) ?? 0;
  await page.keyboard.press("ArrowRight");
  await expect.poll(readX, { timeout: 15_000 }).toBe(before + 1);
});
