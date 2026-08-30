import { describe, expect, it } from "vitest";

import {
  appAcceptance,
  validateProductAcceptanceCoverage,
} from "./app-acceptance";
import { appPerformance } from "./app-performance";
import { appSchema } from "./app-schema";

describe("appSchema", () => {
  it("publishes the base Toolcraft template app contract for AI assembly", () => {
    expect(appSchema.canvas.draggable).toBe(true);
    expect(appSchema.canvas.enabled).toBe(true);
    expect(appSchema.canvas.sizing).toEqual({ mode: "editable-output" });
    expect(appSchema.canvas.upload).toBe(true);
    expect(appSchema.panels.controls?.sections[0]?.title).toBe("Setup");
    expect(appSchema.panels.controls?.sections[0]?.controls.settingsTransfer).toMatchObject({
      target: "runtime.settingsTransfer",
      type: "settingsTransfer",
    });
    expect(appSchema.panels.controls?.sections[0]?.controls.canvasAspectRatio).toMatchObject({
      target: "canvas.aspectRatio",
      type: "aspectRatio",
    });
    expect(appSchema.panels.controls?.sections[0]?.controls.canvasWidth).toMatchObject({
      target: "canvas.size.width",
      type: "text",
    });
    expect(appSchema.panels.controls?.sections[0]?.controls.canvasHeight).toMatchObject({
      target: "canvas.size.height",
      type: "text",
    });
    expect(appSchema.panels.layers).toBeUndefined();
    expect(appSchema.panels.timeline).toEqual({
      animations: [
        {
          id: "turntable",
          label: "Turntable",
          tracks: [
            {
              controlLabel: "Spin",
              // Linear: a looping turn eased at both ends stops dead once a
              // revolution, which is not what a turntable is.
              easing: { controlPoints: [0, 0, 1, 1], type: "bezier" },
              from: 0,
              target: "device.spin",
              to: 360,
            },
          ],
        },
      ],
      defaultDurationSeconds: 6,
      enabled: true,
      mode: "keyframes",
    });
    expect(appSchema.toolbar).toEqual({
      history: true,
      radar: true,
      theme: true,
      zoom: true,
    });
    expect(appSchema.assembly.components).toEqual([
      "canvas",
      "controlsPanel",
      "timelinePanel",
      "toolbar",
    ]);
    expect(appSchema.assembly.capabilities).toEqual(
      expect.arrayContaining([
        "canvas.draggable",
        "canvas.editableSize",
        "canvas.upload",
        "controls.defaults",
        "controls.panel",
        "toolbar.history",
        "toolbar.radar",
        "toolbar.theme",
        "toolbar.zoom",
      ]),
    );
    expect(appSchema.assembly.capabilities).toContain("timeline.playback");
    expect(appSchema.assembly.capabilities).toContain("timeline.keyframes");
    expect(appSchema.assembly.commands).toEqual(
      expect.arrayContaining([
        "canvas.center",
        "canvas.setSize",
        "canvas.setViewport",
        "canvas.zoomIn",
        "controls.reset",
        "controls.setValue",
        "history.undo",
        "media.delete",
        "media.import",
      ]),
    );
    expect(appSchema.assembly.commands).toContain("timeline.setCurrentTime");
  });

  it("renders the product sections after runtime setup without splitting them", () => {
    const sections = appSchema.panels.controls?.sections ?? [];
    const productSections = sections.filter(
      (section) => section.title !== "Setup" && section.title !== "Export",
    );

    expect(sections[0]?.title).toBe("Setup");
    // A section whose controls mix standalone and grouped layouts is split by
    // the runtime into unlabelled fragments, so the authored ids must survive.
    expect(productSections.map((section) => section.id)).toEqual([
      "device",
      // Between choosing the product and uploading the design, because that is
      // the order the decisions happen in: pick the thing, colour the thing,
      // then print on it.
      "product-parts",
      "artwork",
      // The templates the uploads are drawn against, directly under them: an
      // actions control is grouped-layout where the uploaders are standalone,
      // so it cannot share their section without the runtime cutting that
      // section into unlabelled fragments.
      "artwork-templates",
      "screen-fit",
      "studio",
      "lights",
      "key-light-direction",
      "camera",
      "framing",
      "surface",
      "backdrop",
      "image-export",
      "video-export",
    ]);
    expect(appSchema.panels.layers).toBeUndefined();
    expect(appSchema.panels.timeline?.enabled).toBe(true);
  });

  it("declares the timeline behavior the animation depends on", () => {
    expect(appSchema.assembly.capabilities).toContain("timeline.playback");
    expect(appSchema.assembly.capabilities).toContain("timeline.keyframes");
    expect(appSchema.assembly.commands).toContain("timeline.toggleControlKeyframes");
    expect(appSchema.assembly.commands).toContain("timeline.moveKeyframe");
  });

  it("covers every derived renderer path with one scenario", () => {
    // No control makes a frame more expensive, so the envelope stays empty
    // while each reachable renderer interaction still owns a scenario.
    expect(appPerformance.workloadEnvelope).toEqual({ dimensions: [] });
    expect(
      appPerformance.scenarios.map((scenario) => scenario.interaction).sort(),
    ).toEqual([
      "control-change",
      "control-drag",
      "export",
      "initial-render",
      "media-import",
    ]);
    expect(
      new Set(appPerformance.scenarios.map((scenario) => scenario.pathId)).size,
    ).toBe(appPerformance.scenarios.length);
  });

  it("declares production reload coverage for the starter schema", () => {
    expect(appSchema.persistence.storage).toBe("localStorage");
    if (appSchema.persistence.storage !== "localStorage") {
      throw new Error("The starter must persist user settings in localStorage.");
    }
    expect(appSchema.persistence.include).toContain("canvas");
    expect(
      appAcceptance.find((entry) => entry.id === "persistence.reload"),
    ).toMatchObject({
      automated: true,
      browser: true,
      evidence: "persistence-state",
      kind: "runtime",
      persistenceCoverage: "reload",
      persistenceSlices: appSchema.persistence.include,
      target: "canvas.size.width",
    });
    expect(validateProductAcceptanceCoverage()).toEqual([]);
  });
});
