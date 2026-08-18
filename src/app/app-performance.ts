import {
  defineToolcraftPerformance,
  type ToolcraftEnvelopePerformanceConfig,
} from "@/toolcraft/runtime";

import { rendererPipeline } from "./render/pipeline";

export const appPerformance: ToolcraftEnvelopePerformanceConfig =
  defineToolcraftPerformance({
    rendererPipeline,
    rendererStrategy: "webgl",
    rendererTechnique: {
      exportRenderer: "webgl",
      fidelityRisks: [
        "Lighting is image-based rather than traced, so shadows come from a single directional shadow map instead of true area-light occlusion. Contact shadows are soft but approximate, and objects do not bounce light onto each other.",
        "Reflections sample the environment map only. The phone cannot reflect the ground plane or itself, which is visible on the polished rails at grazing angles.",
        "Depth of field is not simulated. The reference photography has shallow focus; this renders everything sharp.",
      ],
      intentionalRasterizationReason:
        "The product is a photographic render of a physical object. Its output has no vector or text semantics to preserve — the deliverable is pixels, and the fidelity that matters is the screenshot texture's source resolution, which is preserved independently of output rasterization.",
      layers: [
        {
          content: ["geometry", "shader"],
          exportMode: "included",
          id: "product-scene",
          kind: "product-foreground",
          primitiveCount: "medium",
          renderer: "webgl",
          uiSelector: "[data-toolcraft-product-output]",
        },
      ],
      performanceRisks: [
        "The environment map is convolved through PMREM when it changes. That is a one-off cost at load and on environment change, not a per-frame one, but it is the most expensive single operation in the product.",
        "The model is 5.1MB and 76k triangles, decoded on first load. Frames are cheap afterwards; the initial load is the latency the user actually feels.",
      ],
      previewExportDifferenceReason:
        "Preview and export share one scene, one camera and one renderer, differing only in backing resolution. Because nothing accumulates and no sampling is involved, the exported frame is deterministic and identical to what the preview shows at that size.",
      previewRenderer: "webgl",
      productRepresentation: "pixel",
      rendererStrategy: "webgl",
      sourceRepresentation: "mixed",
      whyNotAlternativeStrategies: [
        "path-traced webgl: what this replaced. It produced better shadows and reflections, but every camera move restarted a convergence that held the GPU at full load for seconds — unacceptable for a viewer meant to be moved around freely.",
        "canvas-2d: cannot evaluate a physically-based BRDF or image-based lighting, which is the entire lighting model here.",
        "svg / dom: no three-dimensional geometry and no reflection model.",
        "webgpu: three.js ships a production WebGPURenderer, but its 30-50% gains apply to dense scenes. This is one phone at 76k triangles, already comfortably at frame rate on WebGL2, and the Toolcraft model layer binds WebGLRenderer — a second renderer type would risk context conflicts for a speedup no one would perceive.",
      ],
    },
    scenarios: [],
    usesCustomRenderer: true,
    // No workload dimensions: no control makes a frame more expensive. Sample
    // count was the only one, and it left with the path tracer.
    workloadEnvelope: { dimensions: [] },
  });
