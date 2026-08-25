import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import { readToolcraftOrientationPose } from "@/toolcraft/runtime/react";

import { appSchema } from "./app-schema";
import { readFitBasis } from "./render/camera-fit";

const appDir = dirname(fileURLToPath(import.meta.url));
const orbitTarget = "camera.orbit";

function source(...segments: readonly string[]): string {
  return readFileSync(join(appDir, ...segments), "utf8");
}

test("orbit pose is shared by gizmo, drag, preview and export", () => {
  // One control owns the pose, and it is the gizmo.
  const gizmos = (appSchema.panels.controls?.sections ?? []).flatMap((section) =>
    Object.values(section.controls).filter((control) => control.type === "orientationGizmo"),
  );
  expect(gizmos).toHaveLength(1);
  expect(gizmos[0].target).toBe(orbitTarget);
  // Not keyframeable: the camera is where you are standing, not part of the
  // animation, and a keyed camera would fight the turntable.
  expect(gizmos[0].keyframeable).toBe(false);

  // Every reader names the same target. This is the claim the requirement
  // actually makes, and it spans four files, so it is checked across all four
  // rather than inside any one of them — a fifth camera introduced anywhere
  // would read a different value and drift silently.
  const readers = {
    "the drag": source("view-orbit.ts"),
    "the export": source("export-renderer.ts"),
    "the Infinity frame": source("scene-bounds.ts"),
    "the preview": source("preview.tsx"),
  };
  for (const [name, text] of Object.entries(readers)) {
    expect(text.includes(`"${orbitTarget}"`), `${name} does not name ${orbitTarget}`).toBe(true);
    expect(
      text.includes("readToolcraftOrientationPose"),
      `${name} does not read the pose through the shared reader`,
    ).toBe(true);
  }

  // The renderer pipeline treats the pose as an input, so a change to it
  // invalidates the frame rather than leaving a stale one on screen.
  expect(source("render", "pipeline.ts")).toContain(orbitTarget);
});

describe("the pose itself", () => {
  test("reads the same way for every consumer", () => {
    const stored = { position: [-0.36, 0.14, 1], up: [0, 1, 0] };

    // The reader is what makes four call sites agree, so it has to be a pure
    // function of the stored value.
    expect(readToolcraftOrientationPose(stored)).toEqual(
      readToolcraftOrientationPose(stored),
    );

    const basis = readFitBasis(readToolcraftOrientationPose(stored));
    expect(basis.direction.length()).toBeCloseTo(1, 10);
    expect(basis.across.dot(basis.direction)).toBeCloseTo(0, 10);

    // A missing or malformed pose still yields a usable camera rather than
    // one at the origin looking at nothing.
    for (const broken of [undefined, null, "sideways", {}, { position: [0, 0, 0] }]) {
      const recovered = readFitBasis(readToolcraftOrientationPose(broken));
      expect(Number.isFinite(recovered.direction.x)).toBe(true);
      expect(recovered.direction.length()).toBeCloseTo(1, 10);
    }
  });

  test("the schema's default is the pose the app opens on", () => {
    const gizmo = (appSchema.panels.controls?.sections ?? [])
      .flatMap((section) => Object.values(section.controls))
      .find((control) => control.target === orbitTarget);
    const pose = readToolcraftOrientationPose(gizmo?.defaultValue);

    // Slightly off-axis and slightly above: a product shot, not an elevation.
    expect(pose.position[0]).toBeLessThan(0);
    expect(pose.position[1]).toBeGreaterThan(0);
    expect(pose.up).toEqual([0, 1, 0]);
  });
});
