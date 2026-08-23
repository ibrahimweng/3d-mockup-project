import { expect, type Locator, type Page } from "@playwright/test";

import { getToolcraftControlFieldByTarget } from "./browser-control-target-helpers";
import type { ToolcraftBrowserProofSession } from "./browser-proof-session";
import {
  expectToolcraftTimelineKeyframes,
  type ToolcraftTimelineKeyframeObservation,
} from "./browser-timeline-evidence-helpers";

/**
 * Open the timeline far enough to see its keyframes.
 *
 * Playback runs from the first paint — the runtime's default, not this
 * product's choice — and it leaves the canvas redrawing under anything that
 * expects a settled picture, so every proof pauses first. The diamonds are
 * behind the expand toggle in the timeline's own header, which is what sets
 * the timeline expanded — the flag the diamonds actually read. The panel used
 * to also need a `panels.timeline.extended` switch in Runtime Setup to grow
 * from a compact transport into a real panel; the panel is always the full
 * one now, so that switch is gone and this only clicks it where it survives.
 * Idempotent, so a test can call it without knowing what ran before.
 */
export async function openTimeline(page: Page): Promise<void> {
  const pause = page.getByRole("button", { name: "Pause playback" });
  if (await pause.count()) {
    await pause.first().click();
    await page.waitForTimeout(600);
  }

  const extended = page
    .locator('[data-toolcraft-control-target="panels.timeline.extended"] [role="switch"]')
    .first();
  if ((await extended.count()) && (await extended.getAttribute("aria-checked")) !== "true") {
    await extended.click();
    await page.waitForTimeout(1_200);
  }

  if (!(await page.locator('button[aria-label^="Add "][aria-label$=" keyframe"]').count())) {
    await page.locator('[data-slot="timeline-panel-expand-toggle"]').first().click();
    await page.waitForTimeout(1_500);
  }

  await expect(
    page.locator('button[aria-label^="Add "][aria-label$=" keyframe"]').first(),
    "Expanding the timeline should put a keyframe diamond on every keyframeable control.",
  ).toBeVisible({ timeout: 15_000 });
}

/**
 * Drag the playhead rather than clicking the strip.
 *
 * The keyframe rows sit over the scrubber at the same coordinates, so a click
 * on the strip lands on a row and never reaches the scrub handler. The
 * playhead's own hit area is above both.
 */
export async function scrubToFraction(page: Page, fraction: number): Promise<void> {
  const target = Math.min(0.995, Math.max(0.005, fraction));
  const readPhase = () =>
    page.evaluate(() => {
      const raw = document
        .querySelector("[data-mockup-timeline]")
        ?.getAttribute("data-mockup-timeline");
      if (!raw) return null;
      const value = JSON.parse(raw) as { cycleSeconds?: number; timeSeconds?: number };
      return value.cycleSeconds ? (value.timeSeconds ?? 0) / value.cycleSeconds : null;
    });

  /**
   * Grab the playhead's handle, above the rows, and say whether it landed.
   *
   * The keyframe diamonds sit at the same coordinates as the playhead and
   * stack above its hit area, so a press aimed at the playhead's centre picks
   * up whichever diamond is under it and drags that along the track instead.
   * That silently rewrote the fixture: a turn keyed at each end collapsed onto
   * one time, leaving nothing to animate and every frame identical. The handle
   * sits in the ruler band above the rows, which is the one part of the
   * playhead no diamond covers. Reading the phase back afterwards turns a miss
   * into a retry rather than a wrong answer.
   */
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const handle = await page
      .locator('[data-slot="timeline-expanded-playhead-handle"]')
      .first()
      .boundingBox();
    const ruler = await page.locator('[data-slot="timeline-expanded-ruler"]').first().boundingBox();
    if (!handle || !ruler) throw new Error("The expanded timeline has no playhead to drag.");
    const y = handle.y + 2;
    const from = Math.min(
      ruler.x + ruler.width - 1,
      Math.max(ruler.x + 1, handle.x + handle.width / 2),
    );
    await page.mouse.move(from, y);
    await page.mouse.down();
    await page.mouse.move(ruler.x + ruler.width * target, y, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(2_200);

    const landed = await readPhase();
    // Tight, because the frame is what is being compared. A sixth of a second
    // of drift on a six second turn is a visibly different angle, so a proof
    // that returns to a time has to return to the same time.
    if (landed === null || Math.abs(landed - target) < 0.012) return;
  }
  throw new Error(`Scrubbing never reached ${Math.round(target * 100)}% of the timeline.`);
}

/** What the product says about where it is in the animation. */
export function readTimelineReport(root: HTMLElement): {
  cycleSeconds: number;
  pixelSignature: string;
  playing: boolean;
  timeSeconds: number;
} {
  const raw = root.querySelector("[data-mockup-timeline]")?.getAttribute("data-mockup-timeline");
  const published = raw
    ? (JSON.parse(raw) as {
        cycleSeconds?: number;
        pixelSignature?: string;
        playing?: boolean;
        timeSeconds?: number;
      })
    : {};
  return {
    cycleSeconds: published.cycleSeconds ?? 0,
    pixelSignature: published.pixelSignature ?? "",
    playing: published.playing === true,
    timeSeconds: published.timeSeconds ?? 0,
  };
}

/**
 * Wait until the picture stops changing.
 *
 * Render scale gives way while a control is being dragged and climbs back once
 * frames stop arriving late, so the frame immediately after a slider moves is
 * not the frame the scene settles on. Comparing a measured picture against an
 * unsettled one compares two different qualities of the same shot. Both sides
 * of a keyframe proof therefore wait for the same thing: two consecutive reads
 * that agree.
 */
export async function settlePicture(page: Page): Promise<string> {
  let previous = "";
  for (let attempt = 0; attempt < 24; attempt += 1) {
    await page.waitForTimeout(1_200);
    const current = await page.evaluate(() => {
      const raw = document
        .querySelector("[data-mockup-timeline]")
        ?.getAttribute("data-mockup-timeline");
      return raw ? ((JSON.parse(raw) as { pixelSignature?: string }).pixelSignature ?? "") : "";
    });
    if (current !== "" && current === previous) return current;
    previous = current;
  }
  return previous;
}

/**
 * Put a control back the way it was found.
 *
 * A proof that walks every branch of a section leaves the control keyframed
 * and holding whatever the last branch set, and the next branch then starts
 * from that rather than from the product's own default. Clearing between
 * branches keeps each one a measurement of the branch instead of a
 * measurement of everything that ran before it.
 */
export async function clearControlKeyframes(page: Page, name: string): Promise<void> {
  const off = page.getByRole("button", { name: `Disable ${name} keyframes` });

  if (await off.count()) {
    await off.first().click();
    await page.waitForTimeout(1_000);
  }
}

/**
 * One control's keyframes, its value, and the frame it produced.
 *
 * This runs inside the page — the proof session serializes it and evaluates it
 * against the app root — so it cannot close over anything from the test. Which
 * control it is about is left on the window first and read back here.
 *
 * Keyframes are counted per control rather than across the panel, because the
 * evidence is about this control's own row: a diamond on some other row would
 * otherwise read as this one's proof. The diamonds label themselves with the
 * control's name and time, which is the only per-row handle the runtime
 * publishes.
 */
export function readControlKeyframes(
  root: HTMLElement,
): ToolcraftTimelineKeyframeObservation {
  const subject = (
    window as unknown as { __mockupKeyframeProof?: { name: string; target: string } }
  ).__mockupKeyframeProof ?? { name: "", target: "" };
  const field = root.querySelector(`[data-toolcraft-control-target="${subject.target}"]`);
  const values = field
    ? [...field.querySelectorAll("input")].map((input) => input.value).join("|")
    : "";
  const raw = root.querySelector("[data-mockup-timeline]")?.getAttribute("data-mockup-timeline");
  const published = raw ? (JSON.parse(raw) as { pixelSignature?: string }) : {};

  return {
    evaluatedValue: values,
    keyframeCount: [...root.querySelectorAll('[data-slot="timeline-keyframe"]')].filter((node) =>
      (node.getAttribute("aria-label") ?? "").startsWith(`${subject.name} keyframe at `),
    ).length,
    outputSignature: published.pixelSignature ?? "",
  };
}

/**
 * Prove one control's diamond: it keyframes, and the keyframe drives the frame.
 *
 * The evidence API compares against literal expected values — it structured-
 * clones whatever it is handed, so asymmetric matchers are out — and a rendered
 * pixel hash cannot be written down in advance. So the target picture is
 * measured first and then reproduced, which makes this stronger than "something
 * changed": the keyframe evaluator has to land on the same pixels twice.
 *
 * The measuring pass keyframes the control too. Spin widens its own framing the
 * moment it is keyframed, because a turning device sweeps a wider cylinder than
 * a standing one, so a picture measured without a keyframe would be framed
 * differently from the one the proof produces and the two could never match.
 * Measuring under the condition it will be proved under keeps that honest for
 * every control, swept or not.
 */
export async function proveControlKeyframes(
  page: Page,
  session: ToolcraftBrowserProofSession,
  options: {
    /**
     * What the evidence is about, when that is not the control being driven.
     *
     * A runtime row targets the timeline panel rather than any one control, and
     * the reporter matches evidence to a requirement on its target, so the
     * evidence has to name the row's target while the action still drives the
     * control that owns the diamond.
     */
    evidenceTarget?: string;
    name: string;
    requirementId: string;
    reset: (control: Locator) => Promise<void>;
    setValue: (control: Locator) => Promise<void>;
    target: string;
  },
): Promise<void> {
  await openTimeline(page);
  const control = await getToolcraftControlFieldByTarget(page, options.target);
  await expect(control, `${options.name} should be on screen to keyframe.`).toBeVisible();

  const add = () => page.getByRole("button", { name: `Add ${options.name} keyframe` });
  const clearKeyframes = async (): Promise<void> => {
    const off = page.getByRole("button", { name: `Disable ${options.name} keyframes` });
    if (await off.count()) {
      await off.first().click();
      await page.waitForTimeout(1_000);
    }
  };
  const readNow = () =>
    page.evaluate((target) => {
      const field = document.querySelector(`[data-toolcraft-control-target="${target}"]`);
      const raw = document
        .querySelector("[data-mockup-timeline]")
        ?.getAttribute("data-mockup-timeline");
      return {
        evaluatedValue: field
          ? [...field.querySelectorAll("input")].map((input) => input.value).join("|")
          : "",
        outputSignature: raw
          ? ((JSON.parse(raw) as { pixelSignature?: string }).pixelSignature ?? "")
          : "",
      };
    }, options.target);

  /**
   * Both passes take the same route to the value.
   *
   * The scene does not draw a spin angle identically whatever preceded it —
   * reaching 186 from 90 and from 0 gives pictures differing in a tenth of
   * their pixels — so a measurement taken from wherever the control happened
   * to be would be compared against a proof that arrived by a different road.
   * Resetting first makes the two comparable. The path dependence itself is a
   * defect in its own right and is recorded in the worklog; controlling for it
   * here keeps this proof about keyframes rather than about that.
   */
  /**
   * Draw the value once and throw the frame away.
   *
   * The first frame drawn at a size or position the renderer has not used
   * before is not the frame it settles on. Measured three passes running at
   * one value, the first gives one signature and every pass after it gives
   * another, each stable through a further six seconds — so it is not an
   * unsettled frame but a warm-up, and the same one behind the logo detail
   * this app's worklog records as crisp by one route and smeared by another.
   * Both halves of this proof have to be drawn warm, or the measurement is
   * taken cold and compared against a proof that is not.
   */
  await clearKeyframes();
  await options.reset(control);
  await settlePicture(page);
  await options.setValue(control);
  await settlePicture(page);

  await clearKeyframes();
  await options.reset(control);
  await settlePicture(page);
  await add().first().click();
  await page.waitForTimeout(900);
  await options.setValue(control);
  await settlePicture(page);
  const target = await readNow();
  expect(
    target.outputSignature,
    `${options.name} must report a rendered frame before it can be keyframed against one.`,
  ).not.toBe("");

  await clearKeyframes();
  await options.reset(control);
  await settlePicture(page);

  await page.evaluate(
    (subject) => {
      (window as unknown as { __mockupKeyframeProof?: unknown }).__mockupKeyframeProof = subject;
    },
    { name: options.name, target: options.target },
  );

  await expectToolcraftTimelineKeyframes(
    session.observe(readControlKeyframes),
    session.controlAction(options.target, async (field) => {
      await add().first().click();
      await page.waitForTimeout(900);
      await options.setValue(field);
      await settlePicture(page);
    }),
    {
      evaluatedValue: target.evaluatedValue,
      keyframeCount: 1,
      outputSignature: target.outputSignature,
    },
    {
      requirementId: options.requirementId,
      target: options.evidenceTarget ?? options.target,
      timeoutMs: 60_000,
    },
  );
}
