import { describe, expect, it } from "vitest";

import {
  correctArtworkZone,
  offersArtworkZonePicker,
  readArtworkZone,
} from "./artwork-zone";
import { FOUR_ZONE_DEVICES } from "./product-applicability";

describe("offersArtworkZonePicker", () => {
  it("offers it only where all four options are real panels", () => {
    for (const device of FOUR_ZONE_DEVICES) {
      expect(offersArtworkZonePicker({ allOver: false, device }), device).toBe(true);
    }
    // A card prints on two panels and a phone on one; a four-way picker on
    // either would offer panels the product does not have.
    for (const device of ["id-card", "iphone-17-pro-max", "water-bottle"]) {
      expect(offersArtworkZonePicker({ allOver: false, device }), device).toBe(false);
    }
  });

  it("withdraws it while one design covers every panel", () => {
    expect(offersArtworkZonePicker({ allOver: true, device: "tshirt" })).toBe(false);
  });
});

describe("correctArtworkZone", () => {
  it("leaves the zone alone while the picker is there to change it", () => {
    for (const zone of ["front", "back", "left", "right"]) {
      expect(
        correctArtworkZone({ allOver: false, device: "tshirt", zone }),
        zone,
      ).toBeNull();
    }
  });

  it("puts the zone back to front when the picker is not offered", () => {
    // The trap this exists for: pick a sleeve on the shirt, switch to a phone,
    // and without this the value still says left while the picker that could
    // put it back is gone -- a Design tab with no uploader on it at all.
    expect(
      correctArtworkZone({ allOver: false, device: "iphone-17-pro-max", zone: "left" }),
    ).toBe("front");
    // And the same the other way in: all-over print hides the picker too.
    expect(correctArtworkZone({ allOver: true, device: "tshirt", zone: "back" })).toBe(
      "front",
    );
  });

  it("writes nothing when the zone is already front", () => {
    // Otherwise the effect would dispatch on every render of every
    // single-panel product, forever.
    expect(
      correctArtworkZone({ allOver: false, device: "iphone-17-pro-max", zone: "front" }),
    ).toBeNull();
    expect(
      correctArtworkZone({ allOver: false, device: "iphone-17-pro-max", zone: undefined }),
    ).toBeNull();
  });

  it("treats an unknown value as front rather than trusting it", () => {
    expect(readArtworkZone("sleeve")).toBe("front");
    expect(readArtworkZone(null)).toBe("front");
    expect(readArtworkZone(7)).toBe("front");
    expect(readArtworkZone("right")).toBe("right");
  });
});
