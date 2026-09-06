import { describe, expect, it } from "vitest";

import {
  doesToolcraftApplicabilityMatch,
  type ToolcraftResolvedControlApplicabilitySchema,
} from "@/toolcraft/runtime";

import {
  correctArtworkZone,
  offersArtworkZonePicker,
  readArtworkZone,
} from "./artwork-zone";
import { getToolcraftValueControls } from "@/toolcraft/runtime/state/control-value-normalization";

import { appSchema } from "./app-schema";
import {
  ARTWORK_ZONE_IDS,
  ARTWORK_ZONE_TARGETS,
  DEVICE_OPTIONS,
} from "./product-domain";
import {
  FOUR_ZONE_DEVICES,
  TWO_ZONE_DEVICES,
} from "./product-applicability";

type ResolvedApplicability = ToolcraftResolvedControlApplicabilitySchema;

describe("offersArtworkZonePicker", () => {
  it("offers one wherever a product has more than one panel", () => {
    for (const device of FOUR_ZONE_DEVICES) {
      expect(offersArtworkZonePicker({ allOver: false, device }), device).toBe(true);
    }
    // A product with one panel has nothing to choose between, and the front
    // uploader is the only box it ever shows.
    for (const device of ["iphone-17-pro-max", "water-bottle", "macbook"]) {
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

describe("the zone value's owner", () => {
  it("the four-panel picker owns the zone value", () => {
    // The runtime compiles one control per target, last declaration winning,
    // and rejects any value outside that control's options. So the winner has
    // to be the picker whose options are a superset: if the two-panel one won,
    // choosing a sleeve on a shirt would be silently refused by a codec that
    // had only ever heard of a front and a back.
    const owner = getToolcraftValueControls(appSchema).get("artwork.zone");

    expect(owner?.options?.map((option: { value: string }) => option.value)).toEqual([
      "front",
      "back",
      "left",
      "right",
    ]);
  });

  it("offers a picker on a two-panel product as well as a four-panel one", () => {
    for (const device of TWO_ZONE_DEVICES) {
      expect(offersArtworkZonePicker({ allOver: false, device }), device).toBe(true);
    }
  });
});

/**
 * Every uploader the schema declares, in the order the panel would show them.
 *
 * Read off the schema rather than listed here, because the point of the test
 * below is that the schema's own conditions add up to exactly one visible box.
 * A list written by hand would go stale the moment a fifth zone is declared,
 * and would go stale silently, which is the failure this is guarding against.
 */
function artworkUploaders(): {
  applicability: ResolvedApplicability;
  target: string;
}[] {
  return (appSchema.panels.controls?.sections ?? []).flatMap((section) =>
    Object.values(section.controls)
      .filter((control) => control.type === "fileDrop" && control.assetKind === "image")
      .map((control) => ({
        applicability: control.applicability,
        target: control.target,
      })),
  );
}

describe("the uploader the picker names", () => {
  it("the panel picker shows exactly one uploader and never leaves none", () => {
    const uploaders = artworkUploaders();
    // Four zones, so four boxes. If this number changes the loop below is
    // still right, but the assertion says the schema was not silently emptied.
    expect(uploaders).toHaveLength(ARTWORK_ZONE_IDS.length);

    for (const { value: device } of DEVICE_OPTIONS) {
      for (const allOver of [false, true]) {
        for (const zone of ARTWORK_ZONE_IDS) {
          // What the studio actually holds. The correction effect runs before
          // anything is drawn, so a stale sleeve on a phone is already back at
          // front by the time the panel renders, and testing the raw value
          // would be testing a state that never reaches the screen.
          const held = correctArtworkZone({ allOver, device, zone }) ?? zone;
          const values: Record<string, unknown> = {
            "artwork.allOver": allOver,
            "artwork.zone": held,
            "device.model": device,
          };
          const showing = uploaders.filter((uploader) =>
            doesToolcraftApplicabilityMatch(
              uploader.applicability,
              (target) => values[target],
            ),
          );
          const where = `${device}/${zone}${allOver ? "/all-over" : ""}`;

          // Never none, which is the failure that leaves a Design tab with no
          // way to put a picture on anything.
          expect(showing.map((uploader) => uploader.target), where).toEqual([
            ARTWORK_ZONE_TARGETS[held],
          ]);
        }
      }
    }
  });

  it("names the front box wherever the picker is not there to name one", () => {
    for (const { value: device } of DEVICE_OPTIONS) {
      for (const allOver of [false, true]) {
        if (offersArtworkZonePicker({ allOver, device })) continue;
        // No picker means no way to choose, so the one box on screen has to be
        // the front one for every zone the value could have been left on.
        for (const zone of ARTWORK_ZONE_IDS) {
          expect(
            correctArtworkZone({ allOver, device, zone }) ?? zone,
            `${device}/${zone}`,
          ).toBe("front");
        }
      }
    }
  });
});
