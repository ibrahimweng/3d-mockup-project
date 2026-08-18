import type {
  ToolcraftComponentAcceptance,
  ToolcraftControlSectionInventoryEntry,
  ToolcraftProductReadiness,
  ToolcraftTransferMode,
} from "./acceptance/types";
import { appSchema } from "./app-schema";

const productPersistenceSlices =
  appSchema.persistence.storage === "localStorage"
    ? appSchema.persistence.include
    : [];

export const appTransferMode: ToolcraftTransferMode = {
  animationIntent: { mode: "none" },
  mode: "new-toolcraft-app",
};

export const appProductReadiness: ToolcraftProductReadiness = {
  exportIntent: {
    image: { mode: "toolcraft-default" },
    video: { mode: "not-requested" },
  },
  interactionOwnership: [
    {
      alternative: {
        reason:
          "Panel sliders for camera azimuth and elevation would mirror the same rotation with two numeric fields and no spatial correspondence.",
        surface: "panel",
      },
      capability: "direct-spatial-edit",
      evidence: {
        detail:
          "The user explicitly asked to rotate by clicking and dragging on the scene rather than only through the gizmo, so direct pointer rotation is the primary surface.",
        source: "user-request",
      },
      id: "camera-orbit",
      reason:
        "Rotating a three-dimensional object is a spatial operation: dragging the object itself gives direct correspondence between hand movement and result.",
      surface: "canvas",
      target: "camera.orbit",
    },
    {
      alternative: {
        reason:
          "Dragging objects directly on the canvas would be a second way to author the same coordinate and would fight the pointer with camera rotation, which already owns primary drag.",
        surface: "canvas",
      },
      capability: "property-edit",
      evidence: {
        detail:
          "Placement is a stable authored parameter rather than a gesture: the set is arranged once and then lit and re-rendered many times, so exact repeatable values matter more than direct dragging.",
        source: "usability-analysis",
      },
      id: "object-placement",
      reason:
        "The vector pad authors each object's position on the ground plane as an exact value while primary drag stays with camera rotation.",
      surface: "panel",
      target: "scene.objects",
    },
  ],
  mode: "product",
  productName: "Plinth",
  productSummary:
    "Renders photoreal product mockups in the browser: a set of devices or a struck seal carrying the user's own artwork, path-traced under captured studio lighting and exported as an image.",
  requestedBehavior:
    "Upload artwork, place it on a device screen or strike it into a metal seal, arrange a set of objects, light them with captured studio environments, work in an untextured clay view and switch to a path-traced render, then export the result as an image.",
  viewInteraction: {
    mode: "orbit",
    orientationTargets: ["camera.orbit"],
  },
};

export const appControlSectionInventory: readonly ToolcraftControlSectionInventoryEntry[] =
  [
    {
      entity: "Artwork",
      entityId: "artwork",
      groupingReason:
        "The uploaded mark and how it meets the surface are one decision: relief mode and depth are meaningless without the artwork they shape.",
      id: "artwork",
      targets: [
        "artwork.image",
        "artwork.relief",
        "artwork.depth",
        "artwork.scale",
      ],
      title: "Artwork",
    },
    {
      entity: "Object",
      entityId: "object",
      groupingReason:
        "What the artwork is applied to. The scene selector gates the shape and device controls it owns, so they stay together.",
      id: "object",
      targets: [
        "object.scene",
        "object.device",
        "object.shape",
        "object.size",
      ],
      title: "Object",
    },
    {
      entity: "Device set",
      entityId: "device-set",
      groupingReason:
        "A device scene holds a growable set of objects whose cardinality the user owns; each record carries its own kind, size, position and rotation.",
      id: "devices",
      targets: ["scene.objects"],
      title: "Devices",
    },
    {
      entity: "Material",
      entityId: "material",
      groupingReason:
        "Finish, base colour and roughness describe one surface; changing any of them changes how the same object reflects the same studio.",
      id: "material",
      targets: ["material.finish", "material.color", "material.roughness"],
      title: "Material",
    },
    {
      entity: "Studio",
      entityId: "studio",
      groupingReason:
        "Environment, key light, intensity and exposure are one lighting setup, and a polished surface reflects the combination rather than any one of them.",
      id: "studio",
      targets: [
        "studio.environment",
        "studio.intensity",
        "studio.keyDirection",
        "studio.exposure",
      ],
      title: "Studio",
    },
    {
      entity: "Camera",
      entityId: "camera",
      groupingReason:
        "Pose, focal length and aperture are the properties of one lens looking at the scene; focal length and aperture together fix both framing and depth of field.",
      id: "camera",
      targets: ["camera.orbit", "camera.focalLength", "camera.aperture"],
      title: "Camera",
    },
    {
      entity: "Render",
      entityId: "render",
      groupingReason:
        "Shading selects the renderer and gates the sample and denoise controls that only apply once light is actually being traced.",
      id: "render",
      targets: ["view.shading", "render.samples", "render.denoise"],
      title: "Render",
    },
    {
      entity: "Background",
      entityId: "background",
      groupingReason:
        "The include switch and the color edit the same backdrop behind the compared photos.",
      id: "background",
      targets: ["export.includeBackground", "appearance.background"],
      title: "Background",
    },
    {
      entity: "Image export settings",
      entityId: "image-export-settings",
      groupingReason:
        "Format and resolution tune the single exported image artifact.",
      id: "image-export",
      targets: ["export.image.format", "export.image.resolution"],
      title: "Image Export",
    },
  ];

export const appAcceptance: readonly ToolcraftComponentAcceptance[] = [
  {
    automated: true,
    automatedTestName: "source image fileDrop is the single source-material owner",
    browser: true,
    browserTestName:
      "browser: uploading, transforming, and clearing the source photo updates the preview",
    componentType: "fileDrop",
    evidence: "media-lifecycle",
    expectedObservable:
      "Uploading a photo renders it on the canvas, rotate/flip transform the rendered photo, clearing it empties the preview, and reset removes the uploaded photo.",
    fixture: "a small PNG photo fixture",
    id: "source.image.upload",
    kind: "control",
    mediaLifecycleCoverage: [
      "flip",
      "remove",
      "reset",
      "rotate",
      "transform-output",
      "upload",
    ],
    target: "source.image",
    userAction:
      "Drop a PNG into the Image uploader, click the rotate and flip actions, clear the upload, re-upload, and reset controls.",
  },
  {
    automated: true,
    automatedTestName: "scale factor options map to the upscale run",
    browser: true,
    browserTestName:
      "browser: each scale factor produces an upscaled result with matching dimensions",
    componentType: "segmented",
    evidence: "product-output",
    expectedObservable:
      "Running Upscale after choosing 2x or 4x produces a result image whose pixel dimensions are the source multiplied by the chosen factor.",
    fixture: "an uploaded PNG photo and the in-browser upscaling model",
    id: "upscale.scale.factor",
    kind: "control",
    optionCoverage: "each-visible-item",
    target: "upscale.scale",
    userAction:
      "Select each scale factor, run Upscale, and inspect the rendered result image.",
  },
  {
    automated: true,
    automatedTestName: "AI strength is applied to the produced result",
    browser: true,
    browserTestName:
      "browser: lowering AI strength changes the produced upscale result",
    componentType: "slider",
    evidence: "product-output",
    expectedObservable:
      "Running Upscale at a lower AI strength produces a visibly different result image than at full strength, because less of the model output is blended over the plain enlargement.",
    fixture: "an uploaded PNG photo and the in-browser upscaling model",
    id: "upscale.strength.blend",
    kind: "control",
    target: "upscale.strength",
    userAction:
      "Drag AI strength down, run Upscale, and compare against the full-strength result.",
  },
  {
    automated: true,
    automatedTestName: "comparison view modes select which images are visible",
    browser: true,
    browserTestName:
      "browser: each comparison view changes which photos the canvas shows",
    componentType: "segmented",
    evidence: "product-output",
    expectedObservable:
      "Original shows only the source photo, Result shows only the upscaled photo, and Split shows both with a divider.",
    fixture: "an uploaded PNG photo with a finished mock upscale result",
    id: "comparison.view.mode",
    kind: "control",
    optionCoverage: "each-visible-item",
    target: "comparison.view",
    userAction: "Select each View option and observe the canvas.",
  },
  {
    automated: true,
    automatedTestName: "split position clips the result layer proportionally",
    browser: true,
    browserTestName:
      "browser: dragging the split slider moves the comparison divider live",
    componentType: "slider",
    evidence: "product-output",
    expectedObservable:
      "The clipped width of the result layer and the divider position follow the slider percentage during the drag.",
    fixture: "an uploaded PNG photo with a finished mock upscale result in Split view",
    id: "comparison.split.position",
    interactionId: "comparison-split-position",
    kind: "control",
    target: "comparison.split",
    userAction: "Drag the Split position slider and watch the divider move.",
  },
  {
    automated: true,
    automatedTestName: "background include switch drives preview and export backdrop",
    browser: true,
    browserTestName:
      "browser: turning Background off removes the backdrop and makes PNG export transparent",
    backgroundOutputCoverage: "all-required-background-output",
    componentType: "switch",
    evidence: "product-output",
    expectedObservable:
      "Disabling Background removes the colored backdrop from the preview and exports a transparent PNG; enabling it restores both.",
    fixture: "an uploaded PNG photo smaller than the canvas so backdrop pixels are visible",
    id: "background.include.toggle",
    kind: "control",
    target: "export.includeBackground",
    userAction: "Toggle the Background switch and export a PNG in both states.",
  },
  {
    automated: true,
    automatedTestName: "background color fills the preview backdrop",
    browser: true,
    browserTestName:
      "browser: changing the background color repaints the canvas backdrop",
    componentType: "color",
    evidence: "product-output",
    expectedObservable:
      "The area around the compared photos repaints in the chosen color.",
    fixture: "an uploaded PNG photo smaller than the canvas",
    id: "background.color.value",
    kind: "control",
    target: "appearance.background",
    userAction: "Pick a clearly different background color.",
  },
  {
    automated: true,
    automatedTestName: "export format options select the encoded artifact type",
    browser: true,
    browserTestName:
      "browser: PNG and JPG exports decode as their selected file type",
    componentType: "select",
    evidence: "exported-bytes",
    expectedObservable:
      "Exporting with PNG then JPG produces artifacts that decode as image/png and image/jpeg.",
    fixture: "an uploaded PNG photo with a finished mock upscale result",
    id: "image-export.format.choice",
    kind: "control",
    optionCoverage: "each-visible-item",
    target: "export.image.format",
    userAction: "Choose each Format option and run Export PNG.",
  },
  {
    automated: true,
    automatedTestName: "export resolution options select the artifact long edge",
    browser: true,
    browserTestName:
      "browser: 2K and 8K exports decode with their selected pixel dimensions",
    componentType: "select",
    evidence: "exported-bytes",
    expectedObservable:
      "Exports at 2K and 8K decode with 2048 and 8192 pixel long edges.",
    fixture: "an uploaded PNG photo with a finished mock upscale result",
    id: "image-export.resolution.choice",
    kind: "control",
    optionCoverage: "each-visible-item",
    target: "export.image.resolution",
    userAction: "Choose each Resolution option and run Export PNG.",
  },
  {
    actionCoverage: ["upscale", "export-png"],
    automated: true,
    automatedTestName: "sticky delivery actions run the upscale and the export",
    browser: true,
    browserTestName:
      "browser: Upscale shows async progress and produces the result, Export PNG downloads the artifact",
    componentType: "panelActions",
    evidence: "exported-bytes",
    expectedObservable:
      "Upscale shows the sticky footer progress accent while running and then renders the result image; Export PNG downloads an artifact that decodes with the selected format and resolution.",
    exportArtifactCoverage: "all-required-image-export-behavior",
    fixture: "an uploaded PNG photo and the in-browser upscaling model",
    id: "deliver.actions.run",
    kind: "control",
    target: "panel.actions",
    userAction: "Click Upscale, wait for the result, then click Export PNG.",
  },
  {
    automated: true,
    automatedTestName: "infinity canvas mode hides finite sizing and restores it",
    browser: true,
    browserTestName:
      "browser: enabling Infinity canvas removes the artboard and disabling restores the finite size",
    componentType: "canvas",
    evidence: "viewport-side-effect",
    expectedObservable:
      "Turning Infinity canvas on hides Aspect ratio and Canvas width/height and removes artboard clipping; turning it off restores the exact previous finite size.",
    fixture: "an uploaded PNG photo with the default finite canvas",
    id: "canvas.infinity.mode-restoration",
    infinityCanvasCoverage: "mode-and-restoration",
    kind: "runtime",
    target: "canvas.infinity",
    userAction:
      "Enable Infinity canvas in Setup, pan the workspace, then disable it.",
  },
  {
    automated: true,
    automatedTestName: "infinite export crops to the visible scene bounds union",
    browser: true,
    browserTestName:
      "browser: infinite-mode PNG export crops to the union of visible scene elements",
    componentType: "canvas",
    evidence: "exported-bytes",
    expectedObservable:
      "Exporting a PNG in Infinity mode produces an artifact cropped to the union of the visible photo bounds reported by the scene bounds provider.",
    fixture: "an uploaded PNG photo in Infinity canvas mode",
    id: "canvas.infinity.scene-export",
    infinityCanvasCoverage: "scene-bounds-image-export",
    kind: "runtime",
    target: "canvas.infinity",
    userAction: "Enable Infinity canvas and run Export PNG.",
  },
  {
    automated: true,
    automatedTestName: "declares production reload coverage for the product schema",
    browser: true,
    browserTestName:
      "browser: app restores exact canvas, values, and panel workspace slices after reload",
    componentType: "persistence",
    evidence: "persistence-state",
    expectedObservable:
      "Canvas size and zoom, changed control values, uploaded media, and the moved and collapsed Controls workspace remain visibly restored after a real browser reload.",
    fixture: "product runtime persisted workspace",
    id: "persistence.reload",
    kind: "runtime",
    persistenceCoverage: "reload",
    persistenceSlices: productPersistenceSlices,
    target: "canvas.size.width",
    userAction:
      "Edit Canvas width and zoom, change product values, move and collapse Controls, wait for persistence, and reload the page.",
  },
];
