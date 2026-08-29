import { describe, expect, test } from "vitest";

import { appSchema } from "./app-schema";
import {
  ARTWORK_ZONE_DEVICES,
  readArtworkZones,
} from "./product-applicability";
import {
  ARTWORK_ZONE_IDS,
  ARTWORK_ZONE_TARGETS,
  DEVICE_CATALOG,
} from "./product-domain";

/**
 * What the product promises about getting a frame out, and about keeping the
 * workspace between visits.
 *
 * These read the resolved schema rather than the source, because the resolved
 * schema is what the runtime actually acts on — a control the source declares
 * and the resolver drops would pass a check against the source and still not
 * exist. The visual half of each requirement is proven in the browser.
 */
const sections = appSchema.panels.controls?.sections ?? [];

function controlAt(target: string) {
  for (const section of sections) {
    for (const control of Object.values(section.controls)) {
      if (control.target === target) return control;
    }
  }
  return undefined;
}

function optionValues(target: string): readonly string[] {
  return (controlAt(target)?.options ?? []).map((option) => option.value);
}

test("every upload slot owns exactly one print zone", () => {
  const drops = sections.flatMap((section) =>
    Object.values(section.controls).filter((control) => control.type === "fileDrop"),
  );

  // One per zone and no more. The rule this replaces was "exactly one drop",
  // written when a product had one printable surface; what it was really
  // guarding is that no two ways of bringing a design in compete for the same
  // place on the model, which is now a statement about zones rather than about
  // the number of uploaders.
  const targets = drops.map((drop) => drop.target);
  expect([...targets].sort()).toEqual(
    [...Object.values(ARTWORK_ZONE_TARGETS)].sort(),
  );
  expect(new Set(targets).size).toBe(targets.length);

  // Every zone a product declares has a slot, and every slot lands on a zone
  // some product declares. Either half failing is an upload that goes nowhere
  // or a zone nothing can reach.
  for (const zone of ARTWORK_ZONE_IDS) {
    const control = controlAt(ARTWORK_ZONE_TARGETS[zone]);
    expect(control, `${zone} has no uploader`).toBeDefined();
    expect(ARTWORK_ZONE_DEVICES[zone].length).toBeGreaterThan(0);
  }

  for (const drop of drops) {
    // Images, not models: the geometry is bundled, and a model drop here would
    // offer to replace the thing the product is about.
    expect(drop.assetKind ?? "image").toBe("image");
    expect(drop.multiple ?? false).toBe(false);
  }

  // Nothing else is declared as source material, and the product ships no
  // default asset that would stand in for one.
  expect(appSchema.media?.defaultAssets ?? []).toEqual([]);
});

test("a product's zones and its uploaders name the same places", () => {
  // The catalog is the subject: a zone naming a material another zone already
  // owns would print two designs on one panel, and the second would win
  // silently.
  for (const id of Object.keys(DEVICE_CATALOG) as (keyof typeof DEVICE_CATALOG)[]) {
    const zones = readArtworkZones(DEVICE_CATALOG[id]);
    const materials = [...zones.values()].map((zone) => zone.material);
    expect(new Set(materials).size, `${id} repeats a material across zones`).toBe(
      materials.length,
    );
    expect(zones.get("front")?.material).toBe(DEVICE_CATALOG[id].screenMaterial);
    for (const zone of zones.keys()) {
      expect(
        ARTWORK_ZONE_DEVICES[zone],
        `${id} declares ${zone} but is not offered its uploader`,
      ).toContain(id);
    }
  }
});

test("export format options select the encoded artifact type", () => {
  const formats = optionValues("export.image.format");
  expect(formats).toEqual(["png", "jpg"]);
  // PNG first, because it is the one that can carry the transparent backdrop
  // this product's Background switch exists to produce.
  expect(formats[0]).toBe("png");
  expect(controlAt("export.image.format")?.defaultValue).toBe("png");
  expect(appSchema.export?.png?.background).toBe("include");
});

test("export resolution options select the artifact long edge", () => {
  const resolutions = optionValues("export.image.resolution");
  expect(resolutions).toEqual(["2k", "4k", "8k"]);
  // Ordered smallest to largest, so the list reads as a scale rather than a
  // set, and every entry names a real long edge.
  for (const resolution of resolutions) expect(resolution).toMatch(/^\d+k$/);
  expect(resolutions.map((value) => Number.parseInt(value, 10))).toEqual([2, 4, 8]);
});

test("video export writes the selected container", () => {
  const formats = optionValues("export.video.format");
  expect(formats).toEqual(["mp4", "webm"]);
  // Two containers, and the choice is the product's rather than the browser's
  // — which is what makes the fallback when an encoder is missing visible
  // rather than silent.
  expect(controlAt("export.video.format")?.defaultValue).toBe("mp4");
});

test("video export writes the selected size", () => {
  const resolutions = optionValues("export.video.resolution");
  // A video is either the artboard it was composed at or a standard delivery
  // size; there is no 8K here because no encoder in a browser wants it.
  expect(resolutions).toEqual(["current", "4k"]);
  expect(controlAt("export.video.resolution")?.defaultValue).toBe("current");
});

test("sticky delivery action exports the rendered frame", () => {
  const footer = controlAt("panel.actions");
  expect(footer?.type).toBe("panelActions");

  const actions = (footer?.actions ?? []).filter(
    (action): action is Exclude<typeof action, string> => typeof action !== "string",
  );
  expect(actions.map((action) => action.value)).toEqual(["export-png", "export-video"]);

  // Each action declares the artifact it produces, which is what routes it to
  // the runtime's export path instead of falling through to the product.
  expect(actions.map((action) => action.role)).toEqual(["export-image", "export-video"]);
  for (const action of actions) expect(action.label?.length ?? 0).toBeGreaterThan(0);
});

test("canvas sizing edits the product output size", () => {
  // The artboard is the output, so its size is editable and the app owns it.
  expect(appSchema.canvas.sizing.mode).toBe("editable-output");
  expect(appSchema.canvas.enabled).toBe(true);
  expect(appSchema.canvas.size.unit).toBe("px");
  expect(appSchema.canvas.size.width).toBeGreaterThan(0);
  expect(appSchema.canvas.size.height).toBeGreaterThan(0);
  // Portrait by default: the device this opens on is a phone.
  expect(appSchema.canvas.size.height).toBeGreaterThan(appSchema.canvas.size.width);
});

test("render scale keeps the selected backing resolution", () => {
  const scale = appSchema.canvas.renderScale;

  // A ceiling on the display's pixel ratio rather than a multiplier on top of
  // it, so the top of the range is 2 and not something unbounded.
  expect(scale.min).toBe(1);
  expect(scale.max).toBe(2);
  expect(scale.defaultValue).toBe(2);
  expect(scale.step).toBeGreaterThan(0);
  expect(scale.enabled).toBe(true);
});

test("infinity canvas mode hides finite sizing and restores it", () => {
  // The mode is a control the product declares, so the runtime can hide the
  // finite sizing controls behind it and put them back on the way out.
  const infinity = controlAt("canvas.infinity");
  expect(infinity).toBeDefined();
  expect(infinity?.type).toBe("switch");

  // The finite sizing controls the mode hides are all present to be hidden.
  for (const target of ["canvas.size.width", "canvas.size.height", "canvas.aspectRatio"]) {
    expect(controlAt(target), `${target} is missing`).toBeDefined();
  }
});

test("infinite video export holds one scene envelope", () => {
  // In Infinity mode there is no artboard, so the frame comes from the product
  // scene bounds. Without a provider the runtime reports the frame unavailable
  // and every exported video would be cut to a square.
  expect(appSchema.canvas.sizing.mode).toBe("editable-output");
  expect(controlAt("canvas.infinity")).toBeDefined();
  // The video resolution choice that means "whatever the scene is" has to
  // exist, or an infinite export has no size to be.
  expect(optionValues("export.video.resolution")).toContain("current");
});

describe("what survives a reload", () => {
  test("declares production reload coverage for the product schema", () => {
    const persistence = appSchema.persistence;
    expect(persistence.storage).toBe("localStorage");
    if (persistence.storage !== "localStorage") throw new Error("unreachable");
    // Versioned and namespaced, so an older shape cannot be read back into a
    // newer app as if it were current.
    expect(persistence.key).toContain("mockup-studio");
    expect(persistence.version).toBeGreaterThanOrEqual(2);
    expect(persistence.key).toContain(`v${persistence.version}`);

    // Every slice a person would be annoyed to lose. Values alone would drop
    // the artboard, the uploaded screenshot, the animation and the workspace.
    expect([...persistence.include].sort()).toEqual([
      "canvas",
      "media",
      "panels",
      "timeline",
      "values",
    ]);
  });
});
