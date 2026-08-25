import { describe, expect, test } from "vitest";

import { readRasterSettings } from "./settings";

/**
 * What these prove, and what they leave to the browser.
 *
 * `readRasterSettings` is the one place the preview and the export both read
 * their settings from, which is what makes an exported frame provably the same
 * image the preview showed. So this file proves the half that can be proven
 * without a GPU: that each control reaches the renderer, under the right name,
 * converted into the units the rig works in, with a sane value when the state
 * is empty or corrupt. That the resulting frame *looks* right is the other half
 * of each requirement, and it is proven in the browser against real pixels.
 */
function read(values: Record<string, unknown> = {}) {
  return readRasterSettings(values);
}

const defaults = read();

test("environment options select the image-based lighting", () => {
  expect(read({ "studio.environment": "daylight" }).environment).toBe("daylight");
  expect(read({ "studio.environment": "hard-key" }).environment).toBe("hard-key");
  // A captured studio is named, not numbered, so an absent or non-string value
  // has to fall back to a real file rather than to an empty name.
  expect(defaults.environment.length).toBeGreaterThan(0);
  expect(read({ "studio.environment": "" }).environment).toBe(defaults.environment);
  expect(read({ "studio.environment": 7 }).environment).toBe(defaults.environment);
});

test("environment intensity scales the captured studio", () => {
  // The control reads as a percentage and the rig wants a multiplier.
  expect(read({ "studio.intensity": 0 }).lighting.environmentIntensity).toBe(0);
  expect(read({ "studio.intensity": 100 }).lighting.environmentIntensity).toBe(1);
  expect(read({ "studio.intensity": 300 }).lighting.environmentIntensity).toBe(3);
  expect(defaults.lighting.environmentIntensity).toBe(1);
});

test("key intensity drives the shadow-casting light", () => {
  expect(read({ "light.keyIntensity": 0 }).lighting.keyIntensity).toBe(0);
  expect(read({ "light.keyIntensity": 400 }).lighting.keyIntensity).toBe(4);
  // The key is the light the scene is built around, so it is never off by
  // default; a studio that opens unlit reads as a broken app.
  expect(defaults.lighting.keyIntensity).toBeGreaterThan(0);
});

test("key color tints the shadow-casting light", () => {
  expect(read({ "light.keyColor": "#ff8800" }).lighting.keyColor).toBe("#ff8800");
  // White by default: a tint nobody chose is a colour cast in every export.
  expect(defaults.lighting.keyColor.toLowerCase()).toBe("#ffffff");
  expect(read({ "light.keyColor": 123 }).lighting.keyColor.toLowerCase()).toBe("#ffffff");
});

test("key direction repositions the shadow-casting light", () => {
  // The pad reads -1..1 with 0 straight on and reaches the rig unconverted.
  expect(read({ "light.keyDirection": { x: -0.5, y: 0.25 } }).lighting.keyDirection).toEqual({
    x: -0.5,
    y: 0.25,
  });
  // A missing or malformed pad is straight on rather than undefined, which
  // would place the key at the origin and light nothing.
  expect(read({ "light.keyDirection": "sideways" }).lighting.keyDirection).toEqual({ x: 0, y: 0 });
});

test("fill lifts the shadow side without casting", () => {
  expect(read({ "light.fill": 0 }).lighting.fillIntensity).toBe(0);
  expect(read({ "light.fill": 250 }).lighting.fillIntensity).toBe(2.5);
  // Fill is a separate channel from the key: changing one must not move the
  // other, or the two controls are really one.
  const lifted = read({ "light.fill": 200 });
  expect(lifted.lighting.keyIntensity).toBe(defaults.lighting.keyIntensity);
  expect(lifted.lighting.rimIntensity).toBe(defaults.lighting.rimIntensity);
});

test("rim separates the device from the backdrop", () => {
  expect(read({ "light.rim": 0 }).lighting.rimIntensity).toBe(0);
  expect(read({ "light.rim": 400 }).lighting.rimIntensity).toBe(4);
  // Off by default: a rim light is a deliberate choice, not a house style.
  expect(defaults.lighting.rimIntensity).toBe(0);
  const rimmed = read({ "light.rim": 300 });
  expect(rimmed.lighting.keyIntensity).toBe(defaults.lighting.keyIntensity);
  expect(rimmed.lighting.fillIntensity).toBe(defaults.lighting.fillIntensity);
});

test("shadow softness changes how far the shadow edge fades", () => {
  // 0 is a bare bulb and 100 an overcast sky, delivered as a unit fraction.
  expect(read({ "light.shadowSoftness": 0 }).lighting.shadowSoftness).toBe(0);
  expect(read({ "light.shadowSoftness": 100 }).lighting.shadowSoftness).toBe(1);
  expect(read({ "light.shadowSoftness": 34 }).lighting.shadowSoftness).toBeCloseTo(0.34, 10);
  expect(defaults.lighting.shadowSoftness).toBeGreaterThan(0);
});

test("light pattern casts its cut-out across the scene", () => {
  expect(read({ "light.pattern": "blinds" }).lighting.pattern).toBe("blinds");
  expect(read({ "light.pattern": "window" }).lighting.pattern).toBe("window");
  // Nothing in front of the light unless asked, and an unknown cut-out is no
  // cut-out rather than a crash on a stale persisted value.
  expect(defaults.lighting.pattern).toBe("none");
  expect(read({ "light.pattern": "venetian" }).lighting.pattern).toBe("none");
});

test("sweep height raises a backdrop behind the device", () => {
  // Zero is a bare floor with nothing standing behind it.
  expect(read({ "backdrop.height": 0 }).sweep.height).toBe(0);
  expect(read({ "backdrop.height": 100 }).sweep.height).toBe(1);
  expect(defaults.sweep.height).toBe(0);
});

test("sweep curve changes where the floor becomes the wall", () => {
  expect(read({ "backdrop.curve": 0 }).sweep.curve).toBe(0);
  expect(read({ "backdrop.curve": 100 }).sweep.curve).toBe(1);
  // The bend is independent of how high the paper rises: a tight corner and a
  // tall wall are two different decisions.
  const bent = read({ "backdrop.curve": 80 });
  expect(bent.sweep.curve).toBeCloseTo(0.8, 10);
  expect(bent.sweep.height).toBe(defaults.sweep.height);
});

test("sweep light graduates the backdrop from the floor up", () => {
  expect(read({ "backdrop.light": 0 }).sweep.light).toBe(0);
  expect(read({ "backdrop.light": 100 }).sweep.light).toBe(1);
  // The lamp at the foot of the paper is off unless asked for, and turning it
  // up does not move the paper.
  expect(defaults.sweep.light).toBe(0);
  expect(read({ "backdrop.light": 60 }).sweep.height).toBe(defaults.sweep.height);
});

test("floor room light changes how much the floor picks up", () => {
  expect(read({ "floor.environment": 0 }).floor.environment).toBe(0);
  expect(read({ "floor.environment": 100 }).floor.environment).toBe(1);
  expect(defaults.floor.environment).toBe(1);
});

test("floor reflection draws the device mirrored beneath it", () => {
  expect(read({ "floor.reflection": 0 }).floor.reflection).toBe(0);
  expect(read({ "floor.reflection": 100 }).floor.reflection).toBe(1);
  // No mirror unless asked: the default studio is lit on nothing, and a
  // reflection nobody chose would appear under every device.
  expect(defaults.floor.reflection).toBe(0);
  // Reflection and finish are separate: how much comes back is not how
  // sharply it comes back.
  expect(read({ "floor.reflection": 50 }).floor.roughness).toBe(defaults.floor.roughness);
});

test("floor roughness changes how sharply the floor mirrors", () => {
  // 0 is polished and 1 is matte.
  expect(read({ "floor.roughness": 0 }).floor.roughness).toBe(0);
  expect(read({ "floor.roughness": 100 }).floor.roughness).toBe(1);
  expect(read({ "floor.roughness": 92 }).floor.roughness).toBeCloseTo(0.92, 10);
  expect(read({ "floor.roughness": 20 }).floor.reflection).toBe(defaults.floor.reflection);
});

test("background color fills the ground plane", () => {
  expect(read({ "scene.background": "#ff0000" }).backgroundColor).toBe("#ff0000");
  // A named colour is always present, because the ground plane is always drawn
  // and drawing it with `undefined` would render it black without saying so.
  expect(defaults.backgroundColor).toMatch(/^#[0-9a-f]{6}$/i);
  expect(read({ "scene.background": null }).backgroundColor).toBe(defaults.backgroundColor);
});

test("background include switch drives preview and export backdrop", () => {
  // Only an explicit `false` removes the backdrop. Anything else — absent,
  // null, a stale string from an old persisted state — keeps it, because
  // silently exporting a transparent frame is the worse failure.
  expect(read({ "export.includeBackground": false }).showBackground).toBe(false);
  expect(read({ "export.includeBackground": true }).showBackground).toBe(true);
  expect(defaults.showBackground).toBe(true);
  expect(read({ "export.includeBackground": undefined }).showBackground).toBe(true);
});

describe("the preview and the export cannot drift", () => {
  test("the canvas mode changes how the shot is framed and nothing else", () => {
    const values = {
      "camera.focalLength": 50,
      "device.model": "macbook",
      "floor.reflection": 40,
      "light.keyIntensity": 220,
      "scene.background": "#123456",
    };
    const finite = readRasterSettings(values, "finite");
    const infinite = readRasterSettings(values, "infinite");

    expect(finite.fit).toBe("artboard");
    expect(infinite.fit).toBe("scene");
    // Everything else is identical, so switching to Infinity canvas cannot
    // quietly relight or recolour the scene on the way through.
    expect({ ...finite, fit: null }).toEqual({ ...infinite, fit: null });
  });

  test("the same state always reads the same settings", () => {
    const values = { "device.spin": 42, "light.rim": 150 };
    expect(readRasterSettings(values)).toEqual(readRasterSettings(values));
  });
});
