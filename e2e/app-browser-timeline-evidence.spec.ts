import { expect, type Page } from "@playwright/test";

import { getToolcraftControlFieldByTarget } from "./browser-control-target-helpers";
import { createToolcraftBrowserProofSession } from "./browser-proof-session";
import {
  expectToolcraftTimelineDuration,
  expectToolcraftTimelineLoop,
  expectToolcraftTimelinePauseResume,
  expectToolcraftTimelineRenderedFrame,
  expectToolcraftTimelineScrub,
  type ToolcraftTimelineLoopCycleProof,
} from "./browser-timeline-evidence-helpers";
import { setSlider } from "./mockup-controls";
import { expectToolcraftProductObservableToChange } from "./product-observable-helpers";
import { openTimeline, proveControlKeyframes, scrubToFraction } from "./mockup-timeline";
import { test } from "./toolcraft-product-test";

test.setTimeout(900_000);

const report = (page: Page) =>
  page.evaluate(() => {
    const raw =
      document.querySelector("[data-mockup-timeline]")?.getAttribute("data-mockup-timeline") ??
      "{}";
    const value = JSON.parse(raw) as {
      cycleSeconds?: number;
      pixelSignature?: string;
      timeSeconds?: number;
    };
    return {
      cycleSeconds: value.cycleSeconds ?? 0,
      pixelSignature: value.pixelSignature ?? "",
      timeSeconds: value.timeSeconds ?? 0,
    };
  });

/** Put a whole turn on the timeline, so every time reads as a different frame. */
async function keyframeAFullTurn(page: Page): Promise<void> {
  const spin = await getToolcraftControlFieldByTarget(page, "device.spin");
  const clear = page.getByRole("button", { name: "Disable Spin keyframes" });
  if (await clear.count()) {
    await clear.first().click();
    await page.waitForTimeout(1_000);
  }
  await scrubToFraction(page, 0);
  await setSlider(spin, 0);
  await page.getByRole("button", { name: "Add Spin keyframe" }).first().click();
  await page.waitForTimeout(1_500);
  await scrubToFraction(page, 0.99);
  await setSlider(spin, 360);
  await page.waitForTimeout(3_000);
  await expect(
    page.locator('[data-slot="timeline-keyframe"]'),
    "A turn keyed at each end should leave two diamonds on the Spin row.",
  ).toHaveCount(2);
}

async function setDuration(page: Page, seconds: number): Promise<void> {
  const display = page.locator('[data-slot="timeline-duration-display"]').first();
  const input = display.locator("input").first();
  if (await input.count()) {
    await input.click();
  } else {
    await display.click();
  }
  await page.waitForTimeout(500);
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type(String(seconds));
  await page.keyboard.press("Enter");
  await page.waitForTimeout(3_000);
}

/**
 * Watch one whole cycle go round, and prove it came back to where it started.
 *
 * The phases come from playback rather than from scrubbing, because a loop is
 * something the timeline does on its own and a scrub would only prove the test
 * can move a playhead. The seam is the frame at a fixed time before the loop
 * and the frame at the same time after it: if the animation returned to where
 * it began, those are the same picture.
 */
async function sampleCycle(
  page: Page,
  durationSeconds: number,
): Promise<ToolcraftTimelineLoopCycleProof> {
  await scrubToFraction(page, 0.02);
  const seamStart = (await report(page)).pixelSignature;

  await page.getByRole("button", { name: "Play playback" }).first().click();
  const phases: number[] = [];
  let wrapped = false;
  for (let index = 0; index < 40 && !wrapped; index += 1) {
    await page.waitForTimeout(Math.max(200, (durationSeconds * 1000) / 9));
    const sample = await report(page);
    const phase = sample.cycleSeconds > 0 ? sample.timeSeconds / sample.cycleSeconds : 0;
    const previous = phases.at(-1);
    if (previous !== undefined && phase < previous) {
      if (previous < 0.75 || phase > 0.25) continue;
      wrapped = true;
    }
    if (previous === undefined || phase !== previous) phases.push(phase);
  }
  await page.getByRole("button", { name: "Pause playback" }).first().click();
  await page.waitForTimeout(1_500);

  await scrubToFraction(page, 0.02);
  const seamEnd = (await report(page)).pixelSignature;

  return {
    durationSeconds,
    normalizedPhases: phases,
    seamEndSignature: seamEnd,
    seamStartSignature: seamStart,
  };
}

test("browser: the timeline scrubs, pauses, changes duration, and loops back to the frame it started on", async ({
  page,
}) => {
  await page.goto("/");
  const session = await createToolcraftBrowserProofSession(page);
  await page.waitForTimeout(5_000);

  // The turn goes on first. Pause/resume has to show the picture moving again
  // when playback resumes, and with nothing keyframed every frame of a
  // playthrough is the same frame — correctly so, since the renderer no longer
  // redraws a picture that has not changed. Opening the timeline pauses it, so
  // playback is started again before the proof that needs it running.
  await openTimeline(page);
  await keyframeAFullTurn(page);
  // Keying the far end leaves the playhead there, and a proof about resuming
  // should not start from the last frame of the loop.
  await scrubToFraction(page, 0);
  await page.getByRole("button", { name: "Play playback" }).first().click();
  await page.waitForTimeout(3_000);

  await expectToolcraftTimelinePauseResume(
    session.observe((root) => {
      const raw =
        root.querySelector("[data-mockup-timeline]")?.getAttribute("data-mockup-timeline") ?? "{}";
      const value = JSON.parse(raw) as {
        pixelSignature?: string;
        playing?: boolean;
        timeSeconds?: number;
      };
      return {
        currentTimeSeconds: value.timeSeconds ?? 0,
        outputSignature: value.pixelSignature ?? "",
        playing: value.playing === true,
      };
    }),
    session.action(async (current) => {
      await current
        .locator('[data-slot="timeline-transport-controls"] button[aria-label="Pause playback"]')
        .first()
        .click();
      await current.mouse.move(20, 20);
      await current.waitForTimeout(1_500);
    }),
    session.action(async (current) => {
      const readSignature = () =>
        current.evaluate(() => {
          const raw = document
            .querySelector("[data-mockup-timeline]")
            ?.getAttribute("data-mockup-timeline");
          return raw
            ? ((JSON.parse(raw) as { pixelSignature?: string }).pixelSignature ?? "")
            : "";
        });
      const before = await readSignature();
      await current
        .locator('[data-slot="timeline-transport-controls"] button[aria-label="Play playback"]')
        .first()
        .click();
      // The panel pauses playback while the pointer is over it, and a click
      // leaves the pointer exactly there. Resuming and then hovering the thing
      // that resumed it is not what a person does.
      await current.mouse.move(20, 20);
      /**
       * Resuming is not finished until a new frame exists.
       *
       * The clock moves the instant playback resumes, but the reported frame
       * only changes once one has actually been drawn and sampled. The proof
       * takes its reading as soon as anything differs, which can be the clock
       * alone, and then requires the picture to have moved too. Waiting for the
       * frame here makes the action mean what it says.
       */
      /**
       * Asked for rarely, because asking is not free.
       *
       * Each read is a round trip into a main thread already saturated by
       * rendering, and polling every half second starved the very frames it
       * was waiting for — twenty seconds of playback drew none. At two and a
       * half seconds the renderer gets the thread back between questions and
       * the frame moves, which is the cadence every working measurement of
       * this used.
       */
      for (let attempt = 0; attempt < 6; attempt += 1) {
        await current.waitForTimeout(2_500);
        const now = await readSignature();
        if (now !== before) {
          return;
        }
      }
    }),
    { requirementId: "timeline.playback", timeoutMs: 300_000 },
  );

  await scrubToFraction(page, 0);
  const atStart = await report(page);
  await scrubToFraction(page, 0.5);
  const atMiddle = await report(page);
  expect(
    atMiddle.pixelSignature,
    "Half way through a full turn must not draw the frame it started on.",
  ).not.toBe(atStart.pixelSignature);

  await scrubToFraction(page, 0);
  await expectToolcraftTimelineScrub(
    session.observe((root) => {
      const raw =
        root.querySelector("[data-mockup-timeline]")?.getAttribute("data-mockup-timeline") ?? "{}";
      const value = JSON.parse(raw) as { pixelSignature?: string; timeSeconds?: number };
      return {
        currentTimeSeconds: value.timeSeconds ?? 0,
        outputSignature: value.pixelSignature ?? "",
      };
    }),
    session.action(async (current) => {
      await scrubToFraction(current, 0.5);
    }),
    { currentTimeSeconds: atMiddle.timeSeconds, outputSignature: atMiddle.pixelSignature },
    { requirementId: "timeline.playback", timeoutMs: 300_000 },
  );

  await expectToolcraftTimelineRenderedFrame(
    session.observe((root) => {
      const raw =
        root.querySelector("[data-mockup-timeline]")?.getAttribute("data-mockup-timeline") ?? "{}";
      return (JSON.parse(raw) as { pixelSignature?: string }).pixelSignature ?? "";
    }),
    session.action(async (current) => {
      await scrubToFraction(current, 0);
    }),
    atStart.pixelSignature,
    { requirementId: "timeline.playback", timeoutMs: 300_000 },
  );

  const initial = await sampleCycle(page, 6);

  await expectToolcraftTimelineDuration(
    session.observe((root) => {
      const raw =
        root.querySelector("[data-mockup-timeline]")?.getAttribute("data-mockup-timeline") ?? "{}";
      const cycle = (JSON.parse(raw) as { cycleSeconds?: number }).cycleSeconds ?? 0;
      return {
        renderedCycleDurationSeconds: cycle,
        timelineDurationSeconds: cycle,
      };
    }),
    session.action(async (current) => {
      await setDuration(current, 4);
    }),
    4,
    { requirementId: "timeline.playback", timeoutMs: 300_000 },
  );

  const resized = await sampleCycle(page, 4);
  await expectToolcraftTimelineLoop(
    session.observe(() => ({ initial, resized })),
    { requirementId: "timeline.playback", target: "panels.timeline" },
  );
});

test("browser: keyframing Spin puts diamonds on its timeline row and the frame follows them", async ({
  page,
}) => {
  await page.goto("/");
  const session = await createToolcraftBrowserProofSession(page);
  await page.waitForTimeout(5_000);
  await openTimeline(page);

  await proveControlKeyframes(page, session, {
    evidenceTarget: "panels.timeline",
    name: "Spin",
    requirementId: "timeline.keyframes",
    reset: async (control) => {
      await setSlider(control, 0);
    },
    setValue: async (control) => {
      await setSlider(control, 180);
    },
    target: "device.spin",
  });

  // The same row also owes the plain "the picture changed" proof, which is
  // about the timeline rather than about the slider that moved.
  await expectToolcraftProductObservableToChange(
    session,
    session.targetAction("panels.timeline", async (current) => {
      await scrubToFraction(current, 0.5);
    }),
    { requirementId: "timeline.keyframes", timeoutMs: 60_000 },
  );

  await expect(
    page.locator('[data-slot="timeline-keyframe-row"]').first(),
    "A keyframed control should own a row on the expanded timeline.",
  ).toBeVisible();
});
