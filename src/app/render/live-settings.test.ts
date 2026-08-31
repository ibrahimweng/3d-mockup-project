import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "vitest";

import { LIVE_SETTINGS, liveSettingsKey } from "./raster-renderer";
import { readRasterSettings } from "./settings";

/**
 * What these prove.
 *
 * A built scene is not rebuilt when a control moves -- it is repainted -- and
 * the repaint is skipped when nothing it can absorb has changed. That guard is
 * the whole of the responsiveness story for colour, finish and the light rig,
 * and it is also the one place where a working setter can be made to do
 * nothing at all: leave a setting out of the key and the scene never hears
 * about it. `partColors` was left out, so picking a colour in Parts changed
 * nothing on the model until an unrelated control happened to move.
 *
 * So: the key notices each of them, and the key is made of everything the
 * repaint reads.
 */
const renderDir = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(renderDir, "raster-renderer.ts"), "utf8");

/** The body of `applyLiveSettings`, brace-matched from its signature. */
function applyLiveSettingsBody(): string {
  const start = source.indexOf("private applyLiveSettings(");
  expect(start).toBeGreaterThan(-1);
  let depth = 0;
  for (let at = source.indexOf("{", start); at < source.length; at += 1) {
    if (source[at] === "{") depth += 1;
    if (source[at] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, at + 1);
    }
  }
  throw new Error("applyLiveSettings has no closing brace");
}

test("the guard key is made of everything the repaint applies", () => {
  // Read off the method rather than restated here, so the list cannot drift
  // from the code the way it did once already.
  const read = new Set(
    [...applyLiveSettingsBody().matchAll(/settings\.(\w+)/g)].map(
      (found) => found[1],
    ),
  );
  read.delete("device");
  expect(read.size).toBeGreaterThan(0);
  for (const name of read) expect(LIVE_SETTINGS).toContain(name);
});

test("every live setting moves the key", () => {
  // One control at a time, because the failure this guards against is a single
  // setting that the scene applies and the key ignores: with the others held
  // still, that setting alone has to be the difference.
  const base = readRasterSettings({});
  const moved: Record<string, Record<string, unknown>> = {
    backgroundColor: { "scene.background": "#ff0000" },
    environment: { "studio.environment": "daylight" },
    finish: { "device.finish": "matte" },
    floor: { "floor.reflection": 55 },
    lighting: { "light.keyIntensity": 42 },
    partColors: { "product.color.main": "#ff00ff" },
    showBackground: { "export.includeBackground": false },
    spin: { "device.spin": 33 },
    surface: { "surface.kind": "walnut" },
    sweep: { "backdrop.height": 60 },
    transform: { "device.tilt": 12 },
  };
  for (const name of LIVE_SETTINGS) {
    const values = moved[name];
    expect(values, `no probe for ${name}`).toBeDefined();
    const next = readRasterSettings(values);
    expect(next[name], `${name} did not move`).not.toEqual(base[name]);
    expect(liveSettingsKey(next), `${name} is not in the key`).not.toBe(
      liveSettingsKey(base),
    );
  }
});

test("a colour picked in Parts reaches the scene on its own", () => {
  // The reported fault, stated as the user meets it: nothing else touched.
  const before = readRasterSettings({ "product.color.main": "#101010" });
  const after = readRasterSettings({ "product.color.main": "#e0e0e0" });
  expect(after.partColors.main).toBe("#e0e0e0");
  expect(liveSettingsKey(after)).not.toBe(liveSettingsKey(before));
});
