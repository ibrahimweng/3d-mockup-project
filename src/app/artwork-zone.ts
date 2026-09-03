import * as React from "react";

import { useToolcraft, useToolcraftDispatch } from "@/toolcraft/runtime/react";

import { ARTWORK_ZONE_IDS, type ArtworkZoneId } from "./product-parts";
import {
  FOUR_ZONE_DEVICES,
  TWO_ZONE_DEVICES,
} from "./product-applicability";

/**
 * The invariant the uploaders rest on: no picker means the front panel.
 *
 * Every uploader is gated on the panel picker's value, including the front
 * one, which is the only arrangement that shows exactly one box at a time. It
 * is also a trap, because the picker is not always on screen: a phone has one
 * panel and never offers it, and all-over print covers every panel with one
 * design so there is nothing to choose. Leave a shirt on "Left", switch to a
 * phone, and the value would still say left while the picker that could put it
 * back is gone — a Design tab with no uploader on it at all.
 *
 * So the value is held at front wherever the picker is not offered. That is a
 * correction rather than a preference, which is why it skips the undo history:
 * undoing to a state the panel cannot show or escape from is not a state worth
 * keeping.
 */
const ZONE_TARGET = "artwork.zone";

export function readArtworkZone(value: unknown): ArtworkZoneId {
  return ARTWORK_ZONE_IDS.find((zone) => zone === value) ?? "front";
}

/**
 * Whether a picker is on screen, worked out from the same two facts their
 * applicability is written from.
 *
 * Two of them, because a control's options are static and a card has two panels
 * where a shirt has four. Which one is showing does not matter here — only that
 * something is, because that is what decides whether the zone can be changed
 * back by hand.
 */
export function offersArtworkZonePicker({
  allOver,
  device,
}: {
  allOver: unknown;
  device: unknown;
}): boolean {
  return (
    allOver !== true &&
    [...TWO_ZONE_DEVICES, ...FOUR_ZONE_DEVICES].some(
      (offered) => offered === device,
    )
  );
}

/** The zone to hold, or null when the picker is there to be used. */
export function correctArtworkZone(values: {
  allOver: unknown;
  device: unknown;
  zone: unknown;
}): ArtworkZoneId | null {
  if (offersArtworkZonePicker(values)) return null;
  return readArtworkZone(values.zone) === "front" ? null : "front";
}

export function useArtworkZoneCorrection(): void {
  const dispatch = useToolcraftDispatch();
  const { state } = useToolcraft();
  const values = state.values as Record<string, unknown>;
  const correction = correctArtworkZone({
    allOver: values["artwork.allOver"],
    device: values["device.model"],
    zone: values[ZONE_TARGET],
  });

  React.useEffect(() => {
    if (correction === null) return;
    dispatch({
      history: "skip",
      target: ZONE_TARGET,
      type: "controls.setValue",
      value: correction,
    });
  }, [correction, dispatch]);
}
