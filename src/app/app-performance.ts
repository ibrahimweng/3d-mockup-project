import {
  defineToolcraftPerformance,
  deriveToolcraftPerformancePaths,
  type ToolcraftEnvelopePerformanceConfig,
  type ToolcraftPerformanceScenario,
} from "@/toolcraft/runtime";

import { appSchema } from "./app-schema";
import { rendererPipeline } from "./render/pipeline";

const rendererModel = {
  rendererPipeline,
  rendererStrategy: "webgl",
  scenarios: [],
  usesCustomRenderer: true,
  workloadEnvelope: { dimensions: [] },
} as unknown as ToolcraftEnvelopePerformanceConfig;

/**
 * Path ids are a deterministic product of profile, interaction, invalidated
 * passes and execution locations, so they are derived rather than written down:
 * a later pipeline edit moves the scenarios with it instead of silently
 * orphaning them.
 */
const paths = deriveToolcraftPerformancePaths(appSchema, rendererModel);

function path(interaction: string) {
  const match = paths.find((entry) => entry.interaction === interaction);
  if (!match) {
    throw new Error(
      `No derived performance path for interaction "${interaction}".`,
    );
  }
  return match;
}

const scenarios: readonly ToolcraftPerformanceScenario[] = [
  {
    coversTargets: [...path("initial-render").targets],
    expectedObservable:
      "The selected device and its studio environment finish loading and the first rendered frame shows the device on the canvas.",
    fixture: "the default device with a screenshot already attached",
    automated: true,
    automatedTestName: "initial render decodes the model and environment once",
    browser: true,
    browserTestName: "browser perf: initial render shows the device on first frame",
    id: "initial-render.first-frame",
    interaction: "initial-render",
    pathId: path("initial-render").id,
    uiSelector: "[data-toolcraft-product-output]",
  },
  {
    coversTargets: [...path("media-import").targets],
    expectedObservable:
      "The uploaded screenshot appears on the device's display without the model or environment being rebuilt.",
    fixture: "a PNG screenshot fixture dropped onto the Screenshot uploader",
    automated: true,
    automatedTestName: "screenshot import rebinds only the display texture",
    browser: true,
    browserTestName: "browser perf: importing a screenshot updates the display without a scene rebuild",
    id: "media-import.screenshot-texture",
    interaction: "media-import",
    target: "artwork.image",
    uiSelector: "[data-toolcraft-product-output]",
    pathId: path("media-import").id,
  },
  {
    coversTargets: [...path("control-change").targets],
    expectedObservable:
      "Switching device or environment rebuilds the scene once and the canvas shows the newly selected subject or lighting.",
    fixture: "the five bundled device models and four studio environments",
    automated: true,
    automatedTestName: "device and environment changes rebuild the scene once",
    browser: true,
    browserTestName: "browser perf: switching device rebuilds the scene and shows the new subject",
    id: "control-change.scene-rebuild",
    interaction: "control-change",
    target: "device.model",
    uiSelector: "[data-toolcraft-product-output]",
    pathId: path("control-change").id,
  },
  {
    coversTargets: [...path("control-drag").targets],
    expectedObservable:
      "Dragging focal length, the device itself, or the background colour redraws the frame live without reloading the model or the environment.",
    fixture: "the default device framed above its ground plane",
    automated: true,
    automatedTestName: "camera and colour drags invalidate only the raster pass",
    browser: true,
    browserTestName: "browser perf: dragging focal length redraws frames live",
    id: "control-drag.raster-frame",
    interaction: "control-drag",
    target: "camera.focalLength",
    uiSelector: "[data-toolcraft-product-output]",
    pathId: path("control-drag").id,
  },
  {
    actionValue: "export-png",
    completionEvidence: "download",
    controlLabel: "Export PNG",
    coversTargets: [...path("export").targets],
    expectedObservable:
      "Export PNG renders one deterministic frame at the selected resolution and downloads a decodable artifact.",
    fixture: "the default device with a screenshot applied at 2K output",
    automated: true,
    automatedTestName: "export renders one deterministic frame at the selected resolution",
    browser: true,
    browserTestName: "browser perf: Export PNG downloads a decodable artifact",
    id: "export.image-artifact",
    interaction: "export",
    target: "panel.actions",
    pathId: path("export").id,
  },
];

export const appPerformance: ToolcraftEnvelopePerformanceConfig =
  defineToolcraftPerformance({
    rendererPipeline,
    rendererStrategy: "webgl",
    rendererTechnique: {
      exportRenderer: "webgl",
      fidelityRisks: [
        "Lighting is image-based rather than traced, so shadows come from a single directional shadow map instead of true area-light occlusion. Contact shadows are soft but approximate, and objects do not bounce light onto each other.",
        "Reflections sample the environment map only. A device cannot reflect the ground plane or itself, which is visible on polished rails and on the Studio Display's glass at grazing angles.",
        "Depth of field is not simulated. Reference product photography has shallow focus; this renders everything sharp.",
        "The display is driven through the model's own emissive channel and UVs. A screenshot is mapped to the panel the source file authored, so on a device whose screen mesh is modelled at a tilt the fit maths uses a declared aspect rather than a measured one.",
      ],
      intentionalRasterizationReason:
        "The product is a photographic render of a physical object. Its output has no vector or text semantics to preserve — the deliverable is pixels, and the fidelity that matters is the screenshot texture's source resolution, which is preserved independently of output rasterization.",
      layers: [
        {
          content: ["geometry", "shader"],
          exportMode: "included",
          id: "product-scene",
          kind: "product-foreground",
          primitiveCount: "high",
          renderer: "webgl",
          uiSelector: "[data-toolcraft-product-output]",
        },
      ],
      performanceRisks: [
        "The environment map is convolved through PMREM whenever the environment or the device changes. That is a one-off cost per scene build rather than a per-frame one, but it is the most expensive single operation in the product.",
        "Device models are decoded on selection and range from 5MB to 96MB. The largest is Studio Display, whose first load is the latency a user actually feels; frames are cheap afterwards.",
        "Switching device discards the previous scene and builds a new one. Repeated switching pays decode and convolution each time because only the active scene is retained.",
      ],
      previewExportDifferenceReason:
        "Preview and export share one scene builder, one camera model and one renderer, differing only in backing resolution. Because nothing accumulates and no sampling is involved, the exported frame is deterministic and identical to what the preview shows at that size.",
      previewRenderer: "webgl",
      productRepresentation: "pixel",
      rendererStrategy: "webgl",
      sourceRepresentation: "mixed",
      whyNotAlternativeStrategies: [
        "path-traced webgl: better shadows and reflections, but every camera move restarts a convergence that holds the GPU at full load for seconds — unacceptable for a viewer meant to be moved around freely.",
        "canvas-2d: cannot evaluate a physically-based BRDF or image-based lighting, which is the entire lighting model here.",
        "svg / dom: no three-dimensional geometry and no reflection model.",
        "webgpu: three.js ships a production WebGPURenderer, but its gains apply to dense scenes. These are single products at medium triangle counts, already comfortably at frame rate on WebGL2, and the Toolcraft model layer binds WebGLRenderer — a second renderer type would risk context conflicts for a speedup no one would perceive.",
      ],
    },
    scenarios,
    usesCustomRenderer: true,
    // No workload dimensions: no control makes a frame more expensive. Device
    // selection changes which model is decoded, but that is a one-off scene
    // build rather than a per-frame magnitude, and the raster pass that follows
    // is constant-cost for every device in the catalog.
    workloadEnvelope: { dimensions: [] },
  });
