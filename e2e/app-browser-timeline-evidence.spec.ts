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

test.setTimeout(2_700_000);

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
/**
 * Put the transport on a given speed, by pressing the control until it reads it.
 *
 * The proof needs several reported frames inside one loop, and the product only
 * reports a frame when it draws one. Under this container's software renderer
 * that is about a third of a frame a second — roughly two frames per six-second
 * loop, against the six ordered samples the loop proof has to show. Quarter
 * speed does not change the animation or anything asserted about it, because
 * every phase is normalized against the cycle; it just spreads one cycle over
 * four times as many frames, which is the only lever the test has.
 */
async function setPlaybackRate(page: Page, rate: number): Promise<void> {
  const control = page.locator('[data-slot="timeline-playback-rate"]').first();

  if (!(await control.count())) {
    return;
  }

  for (let press = 0; press < 8; press += 1) {
    if ((await control.getAttribute("data-timeline-playback-rate")) === String(rate)) {
      return;
    }

    await control.click();
    await page.waitForTimeout(200);
  }
}

async function sampleCycle(
  page: Page,
  durationSeconds: number,
): Promise<ToolcraftTimelineLoopCycleProof> {
  await scrubToFraction(page, 0.02);
  const seamStart = (await report(page)).pixelSignature;

  await setPlaybackRate(page, 0.25);
  await page.getByRole("button", { name: "Play playback" }).first().click();
  /*
    Sampled from inside the page, not across the wire.

    Two earlier versions of this failed for the same underlying reason. The
    first recorded whatever phase it read after pressing play, and the first
    frames after a start are expensive under software rendering — on a
    six-second loop the first read landed at 0.83, the wrap arrived on the next
    sample, and the proof ended with two phases where it needs five. The second
    anchored at the start of a cycle and sampled more finely, which fixed that
    and replaced it with a worse problem: every sample is a round trip, and at
    a hundred and sixty of them against a loaded renderer the test ran out its
    forty-five minute budget before finishing.

    The cost was never the browser, it was the crossing. A sampler installed in
    the page reads the same published report on a timer with no round trip at
    all, so a whole loop is watched in the wall-clock time the loop actually
    takes, and the samples are evenly spaced instead of being spaced by however
    busy the renderer was.
  */
  await page.evaluate((intervalMs) => {
    const view = window as unknown as {
      __toolcraftLoopSamples?: number[][];
      __toolcraftLoopSampler?: number;
    };
    window.clearInterval(view.__toolcraftLoopSampler);
    view.__toolcraftLoopSamples = [];
    view.__toolcraftLoopSampler = window.setInterval(() => {
      const raw =
        document.querySelector("[data-mockup-timeline]")?.getAttribute("data-mockup-timeline") ??
        "{}";
      const value = JSON.parse(raw) as { cycleSeconds?: number; timeSeconds?: number };
      view.__toolcraftLoopSamples?.push([value.timeSeconds ?? 0, value.cycleSeconds ?? 0]);
    }, intervalMs);
  }, Math.max(60, Math.round((durationSeconds * 4 * 1000) / 60)));

  // Two and a half loops, so there is a whole cycle to watch however far into
  // one the transport happened to be when it started.
  await page.waitForTimeout(Math.round(durationSeconds * 2500 * 4) + 6_000);

  const samples = await page.evaluate(() => {
    const view = window as unknown as {
      __toolcraftLoopSamples?: number[][];
      __toolcraftLoopSampler?: number;
    };
    window.clearInterval(view.__toolcraftLoopSampler);
    const collected = view.__toolcraftLoopSamples ?? [];
    view.__toolcraftLoopSamples = [];
    return collected;
  });

  /*
    One cycle out of the run: anchored on a phase in the first quarter, carried
    forward while it advances, and closed by the first clean seam after four
    forward samples. Anything else starts the count again on the next cycle
    rather than recording a jump that cannot be told apart from a wrap.
  */
  const phases: number[] = [];
  let anchored = false;
  let wrapped = false;

  for (const [timeSeconds, cycleSeconds] of samples) {
    if (wrapped) break;

    const phase = cycleSeconds > 0 ? timeSeconds / cycleSeconds : 0;

    if (!anchored) {
      if (phase > 0.25) continue;
      anchored = true;
      phases.push(phase);
      continue;
    }

    const previous = phases.at(-1)!;
    if (phase === previous) continue;

    if (phase < previous) {
      if (previous >= 0.75 && phase <= 0.25 && phases.length >= 4) {
        phases.push(phase);
        wrapped = true;
        continue;
      }

      phases.length = 0;
      anchored = false;
      continue;
    }

    phases.push(phase);
  }

  await page.getByRole("button", { name: "Pause playback" }).first().click();
  await setPlaybackRate(page, 1);
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

/**
 * A time's frame, once it has proved it draws the same way twice.
 *
 * The renderer is very slightly history-sensitive: the same time reached by
 * different routes can differ in texture detail on the device, stably and
 * reproducibly, which is recorded as a defect in its own right. A proof that
 * scrubs to a time and expects that time's frame therefore has to expect a
 * frame it has actually seen twice from the same approach, rather than one
 * captured earlier by a different road. Repeating the approach until two
 * arrivals agree is what makes the expectation honest rather than hopeful.
 */
async function reproducibleFrameAt(
  page: Page,
  fraction: number,
): Promise<{ pixelSignature: string; timeSeconds: number }> {
  let previous: { pixelSignature: string; timeSeconds: number } | null = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await scrubToFraction(page, 0);
    await scrubToFraction(page, fraction);
    const arrival = await report(page);
    if (
      previous &&
      previous.pixelSignature === arrival.pixelSignature &&
      Math.abs(previous.timeSeconds - arrival.timeSeconds) < 0.001
    ) {
      return arrival;
    }
    previous = arrival;
  }
  throw new Error(
    `Scrubbing to ${Math.round(fraction * 100)}% never drew the same frame twice running.`,
  );
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

  const atStart = await reproducibleFrameAt(page, 0.01);
  const atMiddle = await reproducibleFrameAt(page, 0.5);
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

  // Read the frame to come back to now rather than reusing one captured before
  // the scrub proof: what is being proved is that a time draws its own frame,
  // and the comparison should not also be carrying the drift of every scrub in
  // between.
  const returnFrame = (await reproducibleFrameAt(page, 0.01)).pixelSignature;
  await scrubToFraction(page, 0.5);
  await expectToolcraftTimelineRenderedFrame(
    session.observe((root) => {
      const raw =
        root.querySelector("[data-mockup-timeline]")?.getAttribute("data-mockup-timeline") ?? "{}";
      return (JSON.parse(raw) as { pixelSignature?: string }).pixelSignature ?? "";
    }),
    session.action(async (current) => {
      await scrubToFraction(current, 0);
      await scrubToFraction(current, 0.01);
    }),
    returnFrame,
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
  console.log(`LOOP initial: ${JSON.stringify(initial)}`);
  console.log(`LOOP resized: ${JSON.stringify(resized)}`);
  // The observation is serialized into the page, so the proof has to be put
  // where the page can see it rather than closed over from here.
  await page.evaluate(
    (proof) => {
      (window as unknown as { __loopProof?: unknown }).__loopProof = proof;
    },
    { initial, resized },
  );
  await expectToolcraftTimelineLoop(
    session.observe(
      () =>
        (window as unknown as { __loopProof?: { initial: unknown; resized: unknown } })
          .__loopProof as never,
    ),
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
