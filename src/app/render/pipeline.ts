import {
  registerToolcraftRendererPipeline,
  type ToolcraftRendererPipelinePassContract,
} from "@/toolcraft/runtime";
import type * as THREE from "three";

export type SceneResources = {
  camera: THREE.PerspectiveCamera;
  environment: THREE.Texture;
  scene: THREE.Scene;
};

type Contracts = {
  "artwork-texture": ToolcraftRendererPipelinePassContract<
    THREE.Texture | null,
    THREE.Texture,
    readonly [string]
  >;
  "raster-frame": ToolcraftRendererPipelinePassContract<void>;
  "scene-load": ToolcraftRendererPipelinePassContract<
    SceneResources,
    SceneResources,
    readonly [string, string, string]
  >;
};

/**
 * Three passes, and only one of them runs per frame.
 *
 * There is no accumulator, no sample budget, and no convergence to restart.
 * Orbiting the camera invalidates exactly one constant-cost raster pass, so
 * interaction is free and an idle scene does no work at all. The environment is
 * convolved once at load and then simply sampled.
 */
export const rendererPipeline = registerToolcraftRendererPipeline<Contracts>()({
  interactionInvalidation: [
    {
      interaction: "initial-render",
      invalidates: ["scene-load", "artwork-texture", "raster-frame"],
      targets: ["device.model", "studio.environment", "camera.orbit"],
    },
    {
      interaction: "media-import",
      invalidates: ["artwork-texture", "raster-frame"],
      // Loading a screenshot must not reload the model or re-convolve the
      // environment; only the display material's texture changes.
      mustNotInvalidate: ["scene-load"],
      targets: ["artwork.image"],
    },
    {
      // The device is a different GLB and the environment is the lighting
      // model, so these are the controls that genuinely rebuild the scene.
      interaction: "control-change",
      invalidates: ["scene-load", "raster-frame"],
      targets: [
        "device.model",
        "studio.environment",
        "export.includeBackground",
      ],
    },
    {
      interaction: "control-drag",
      invalidates: ["raster-frame"],
      mustNotInvalidate: ["scene-load", "artwork-texture"],
      targets: ["camera.focalLength", "camera.orbit", "scene.background"],
    },
    {
      interaction: "export",
      invalidates: ["raster-frame"],
      mustNotInvalidate: ["scene-load", "artwork-texture"],
      targets: ["panel.actions"],
    },
  ],
  passes: [
    {
      // Model plus environment. The GLB is decoded once and the equirectangular
      // map is convolved into roughness mips once; both are retained for the
      // renderer's lifetime and rebuilt only when the device changes.
      cacheKey: ["device", "environment", "showGround"],
      cost: {
        dimensions: [],
        frequency: "once",
        relationship: "constant",
      },
      id: "scene-load",
      inputs: [
        "device.model",
        "studio.environment",
        "export.includeBackground",
      ],
      invalidatedBy: [
        "device.model",
        "studio.environment",
        "export.includeBackground",
      ],
      kind: "decode",
      lifecycle: { cache: "retained-resource", resourceScope: "renderer" },
      output: "intermediate",
      quality: "full",
      runsOn: "main",
    },
    {
      // The screenshot, decoded and bound to the display material's emissive
      // channel. Retained against the source rather than the frame.
      cacheKey: ["artworkId"],
      cost: {
        dimensions: [],
        frequency: "discrete",
        relationship: "constant",
      },
      id: "artwork-texture",
      inputs: ["artwork.image"],
      invalidatedBy: ["artwork.image"],
      kind: "preprocess",
      lifecycle: { cache: "retained-resource", resourceScope: "source" },
      output: "intermediate",
      quality: "full",
      runsOn: "main",
    },
    {
      // One draw of retained geometry under a prefiltered environment. Constant
      // cost by construction: no control makes a frame more expensive.
      cost: {
        dimensions: [],
        frequency: "frame",
        relationship: "constant",
      },
      id: "raster-frame",
      inputs: ["scene-load", "artwork-texture", "camera.orbit"],
      invalidatedBy: ["camera.orbit", "camera.focalLength", "scene.background"],
      kind: "rasterize",
      lifecycle: { cache: "none", resourceScope: "call" },
      output: "preview",
      quality: "full",
      runsOn: "gpu",
    },
  ],
  runtimeId: "mockup-studio-raster",
});
