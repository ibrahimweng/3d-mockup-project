import * as React from "react";
import { createPortal } from "react-dom";

import { useToolcraft, useToolcraftDispatch } from "@/toolcraft/runtime/react";

import { appSchema } from "../app-schema";
import { PANEL_TAB_OPTIONS, PANEL_TAB_TARGET } from "../panel-tabs";
import { useExportGateOpen } from "../signup/gate-visibility";
import { isAutomatedSession } from "../signup/signup-storage";
import { TourCard, tourNextAfterSeconds } from "./tour-card";
import { hasSeenTour, rememberTourSeen } from "./tour-progress";
import { TourSpotlight, useSpotlightRect } from "./tour-spotlight";
import { isTourStepDone, tourSteps, type TourObservation } from "./tour-steps";

/**
 * Which tab a step's control is on, and which section holds it.
 *
 * Read off the schema for the same reason the palette and the browser helpers
 * read it: a control that moves to another tab moves here with it, and a copy
 * kept by hand is how a tour ends up pointing at an empty panel.
 */
function findControlLocation(target: string): { section: string; tab?: string } | null {
  for (const section of appSchema.panels.controls?.sections ?? []) {
    if (!Object.values(section.controls).some((control) => control.target === target)) {
      continue;
    }
    return {
      section: section.id,
      tab:
        section.visibleWhen?.target === PANEL_TAB_TARGET
          ? (section.visibleWhen.equals as string)
          : undefined,
    };
  }
  return null;
}

function findSpotlightElement(step: (typeof tourSteps)[number]): Element | null {
  if (step.spotlight === "canvas") {
    return document.querySelector('[data-slot="toolcraft-runtime-app"] canvas');
  }
  if (step.spotlight === "control" && step.target !== undefined) {
    return document.querySelector(`[data-toolcraft-control-target="${step.target}"]`);
  }
  return null;
}

/**
 * A guided first run that ends by asking for an address.
 *
 * Four steps on the studio's own controls rather than a carousel of pictures:
 * each one waits for the person to actually do the thing, so what they have at
 * the end is a product shot they made and the knowledge of how they made it.
 * The ask comes last because that is when it is worth something to them.
 *
 * The whole thing is skippable at every step, and skipping is not a dead end —
 * the export gate still asks anyone who saves a picture without leaving an
 * address. Nothing here can stop someone using the studio.
 */
export function FirstRunTour(): React.JSX.Element | null {
  const dispatch = useToolcraftDispatch();
  const { state } = useToolcraft();
  const values = state.values as Record<string, unknown>;
  const observation: TourObservation = {
    mediaCount: state.mediaAssets.length,
    values,
  };
  const gateOpen = useExportGateOpen();

  const [index, setIndex] = React.useState<number | null>(null);
  const [showNext, setShowNext] = React.useState(false);
  const startedAt = React.useRef<TourObservation>({ mediaCount: 0, values: {} });

  /*
   * The values as they are right now, for the effects that want to read them
   * once rather than run again whenever they change.
   *
   * Starting a step takes a snapshot of the studio and switches to the tab the
   * step's control is on. Both are things to do when the step changes and not
   * when the studio does — an effect that listed the observation would
   * re-snapshot on every slider drag, which is precisely the change it is
   * supposed to be measuring against, and the step could never complete.
   */
  const latest = React.useRef(observation);
  React.useEffect(() => {
    latest.current = observation;
  });

  React.useEffect(() => {
    // Read after mount rather than during render: this same component runs in a
    // server render and in a test where `window` is not there to be asked.
    // An automated session is not a first-time visitor — every browser proof
    // opens a fresh profile, so without this every proof in the suite would
    // meet a tour standing over the control it came to drive.
    if (!hasSeenTour() && !isAutomatedSession()) setIndex(0);
  }, []);

  const step = index === null ? null : (tourSteps[index] ?? null);

  const finish = React.useCallback(() => {
    rememberTourSeen();
    setIndex(null);
  }, []);

  const advance = React.useCallback(() => {
    setIndex((current) => {
      if (current === null) return null;
      const next = current + 1;
      if (next < tourSteps.length) return next;
      rememberTourSeen();
      return null;
    });
  }, []);

  // Each step starts by putting the panel where its control is and noting what
  // the value was, which is what "they did it" is measured against.
  React.useEffect(() => {
    if (step === null) return;
    setShowNext(false);
    const started = latest.current;
    startedAt.current = { mediaCount: started.mediaCount, values: { ...started.values } };

    // A canvas step's target is written by dragging the picture, not by a row
    // in the panel. Sending the panel to the tab that happens to hold that
    // target would move it for no reason and away from what was just done.
    if (step.target === undefined || step.spotlight === "canvas") return;
    const location = findControlLocation(step.target);
    if (location === null) return;

    if (
      location.tab !== undefined &&
      started.values[PANEL_TAB_TARGET] !== location.tab
    ) {
      const label =
        PANEL_TAB_OPTIONS.find((option) => option.value === location.tab)?.label ??
        location.tab;
      dispatch({
        label: `View: ${label}`,
        target: PANEL_TAB_TARGET,
        type: "controls.setValue",
        value: location.tab,
      });
    }
    dispatch({
      collapsed: false,
      sectionId: location.section,
      type: "panels.setSectionCollapsed",
    });
  }, [dispatch, step]);

  // The way out of a step nobody can work out.
  React.useEffect(() => {
    if (step === null || step.target === undefined) return;
    const timer = window.setTimeout(
      () => setShowNext(true),
      tourNextAfterSeconds * 1_000,
    );
    return () => window.clearTimeout(timer);
  }, [step]);

  const done =
    step !== null &&
    isTourStepDone({ current: observation, started: startedAt.current, step });

  React.useEffect(() => {
    if (!done) return;
    // A beat, so the change they just made is visible as the result of what
    // they did rather than swept away by the next card appearing on top of it.
    const timer = window.setTimeout(advance, 900);
    return () => window.clearTimeout(timer);
  }, [advance, done]);

  const find = React.useCallback(
    () => (step === null ? null : findSpotlightElement(step)),
    [step],
  );
  const rect = useSpotlightRect(find, step !== null && step.spotlight !== "none");

  // Nothing while the export gate is up. Two things asking for the same address
  // over one dimmed studio is one too many, and the gate is the one holding
  // something back.
  if (step === null || index === null || gateOpen) return null;

  /*
   * Portalled to the body, and this is not optional.
   *
   * The studio's canvas board is pan-and-zoomed with a CSS transform, which
   * makes it the containing block for any `position: fixed` descendant. A card
   * mounted inside it and told to sit six from the bottom of the window sits
   * six from the bottom of the board instead — measured once at y=1037 in a
   * 900px viewport, off screen and unpressable while every line of its markup
   * looked correct. The body is outside every transform.
   */
  return createPortal(
    <>
      <TourSpotlight rect={rect} />
      <TourCard
        index={index}
        onDone={finish}
        onNext={advance}
        onSkip={finish}
        showNext={showNext}
        step={step}
        total={tourSteps.length}
      />
    </>,
    document.body,
  );
}
