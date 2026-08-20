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
  behaviorCoverage: [
    "canvas-sizing",
    "control-mapping",
    "export-copy",
    "media-lifecycle",
    "renderer-loop",
    "renderer-state",
  ],
  mode: "reference-runtime-clone",
  referenceFeatureInventory: [
    {
      acceptanceId: "artwork.image.upload",
      behaviorEvidence:
        "Running the reference build locally and dropping a PNG into Screenshot puts the image on the phone's display and clearing it returns the screen to dark.",
      featureName: "Screenshot upload",
      id: "screenshot-upload",
      referenceBehavior:
        "One image fileDrop supplies the picture shown on the device screen; the renderer decodes it once into a texture bound to the display material's emissive channel.",
      sourceEvidence:
        "src/app/app-schema.ts declares the `artwork.image` fileDrop; src/app/preview.tsx decodes the presentation URL and calls setArtwork.",
      status: "ported",
      toolcraftMapping:
        "Same `artwork.image` fileDrop with assetKind image, consumed by the same preview decode path.",
    },
    {
      acceptanceId: "artwork.fit.mode",
      behaviorEvidence:
        "Switching Fit mode in the running reference changes whether the screenshot is cropped, letterboxed, or distorted on the display.",
      featureName: "Screen fit mode",
      id: "screen-fit",
      referenceBehavior:
        "Fit/Fill/Stretch choose how the source aspect is reconciled with the display aspect by rewriting the texture's repeat.",
      sourceEvidence:
        "FIT_OPTIONS in src/app/product-domain.ts; applyScreenTransform in src/app/render/iphone-scene.ts.",
      status: "ported",
      toolcraftMapping:
        "Same segmented control on `artwork.fit`, with the same repeat maths generalized over each device's measured screen aspect.",
    },
    {
      acceptanceId: "artwork.placement.transform",
      behaviorEvidence:
        "Dragging Screen position, Screen scale and Screen stretch in the running reference pans, zooms and distorts the image inside the display without rebuilding the scene.",
      featureName: "Screen position, scale and stretch",
      id: "screen-transform",
      referenceBehavior:
        "Three controls remap the display texture only: offset pans across whatever is cropped, scale zooms uniformly, stretch scales each axis independently.",
      sourceEvidence:
        "`artwork.offset`, `artwork.scale` and `artwork.stretch` in src/app/app-schema.ts; applyScreenTransform in src/app/render/iphone-scene.ts.",
      status: "ported",
      toolcraftMapping:
        "Same vector/slider/vector controls writing the same texture repeat and offset.",
    },
    {
      acceptanceId: "studio.environment.lighting",
      behaviorEvidence:
        "Selecting each environment in the running reference changes the reflections and the key direction on the phone's body.",
      featureName: "Studio environment",
      id: "studio-environment",
      referenceBehavior:
        "One HDRI is convolved through PMREM and becomes the entire lighting model; there are no separate placeable lights.",
      sourceEvidence:
        "ENVIRONMENT_OPTIONS in src/app/product-domain.ts; the PMREMGenerator block in src/app/render/iphone-scene.ts.",
      status: "ported",
      toolcraftMapping:
        "Same select on `studio.environment` loading the same four HDR files from public/hdri.",
    },
    {
      acceptanceId: "camera.focalLength.framing",
      behaviorEvidence:
        "Dragging Focal length in the running reference changes perspective while the phone stays framed at the same size.",
      featureName: "Focal length",
      id: "camera-focal-length",
      referenceBehavior:
        "A 36mm full-frame equivalent drives the camera FOV, and viewing distance is recomputed so the subject keeps its framing.",
      sourceEvidence: "setPose in src/app/render/raster-renderer.ts.",
      status: "ported",
      toolcraftMapping:
        "Same slider on `camera.focalLength` and the same distance derivation, now scaled by each device's own bounding radius.",
    },
    {
      acceptanceId: "camera.orbit.pose",
      behaviorEvidence:
        "Dragging the phone in the running reference rotates it; dragging the empty background pans the viewport instead.",
      featureName: "Orbit by direct drag and gizmo",
      id: "camera-orbit",
      referenceBehavior:
        "A geometry hit test claims primary drag for rotation and lets a miss fall through to viewport pan; the gizmo writes the same pose.",
      sourceEvidence:
        "useToolcraftModelOrbitInteraction plus RasterRenderer.hitTest in src/app/preview.tsx and src/app/render/raster-renderer.ts; the dirty-flag requestAnimationFrame loop in preview.tsx draws only invalidated frames.",
      status: "ported",
      toolcraftMapping:
        "Same `camera.orbit` orientationGizmo target and the same hit test, raycast against the selected device's subtree.",
    },
    {
      acceptanceId: "background.include.toggle",
      behaviorEvidence:
        "Turning Background off in the running reference removes the ground plane from the render and makes an exported PNG transparent.",
      featureName: "Background ground plane",
      id: "background-ground",
      referenceBehavior:
        "The background switch adds or removes one ground mesh, and its colour is that mesh's material colour.",
      sourceEvidence:
        "The `showGround` branch in buildIPhoneScene; `export.includeBackground` and `scene.background` in src/app/app-schema.ts.",
      status: "ported",
      toolcraftMapping:
        "Same authored Background pair, which the runtime relocates into Setup.",
    },
    {
      acceptanceId: "canvas.sizing.editable-output",
      behaviorEvidence:
        "Editing Canvas width in the running reference resizes the artboard and the rendered frame while the device stays framed inside it.",
      featureName: "Editable output size",
      id: "canvas-sizing",
      referenceBehavior:
        "The canvas is editable-output at a 1080x1350 default, and the renderer adopts the frame's aspect rather than a fixed one.",
      sourceEvidence:
        "`canvas.sizing: { mode: \"editable-output\" }` in src/app/app-schema.ts; useToolcraftProductSceneFrame plus applyViewport in src/app/preview.tsx and render/raster-renderer.ts.",
      status: "ported",
      toolcraftMapping:
        "Same editable-output sizing and the same scene-frame-driven camera aspect.",
    },
    {
      acceptanceId: "deliver.actions.export",
      behaviorEvidence:
        "Export PNG in the running reference downloads an image matching the preview at the selected resolution.",
      featureName: "Image export",
      id: "image-export",
      referenceBehavior:
        "Export builds a second renderer on its own canvas at the artifact size and draws one deterministic frame, because nothing accumulates.",
      sourceEvidence:
        "src/app/export-renderer.ts and the shared readRasterSettings in src/app/render/settings.ts.",
      status: "ported",
      toolcraftMapping:
        "Same single `export-image` panel action and the same exportRenderer contract.",
    },
    {
      acceptanceId: "device.model.selection",
      behaviorEvidence:
        "The reference renders only the iPhone 17 Pro Max: buildIPhoneScene hard-codes that one GLB path, and no schema control selects a model, while the repository ships five model files.",
      featureName: "Device selection",
      id: "device-selection",
      referenceBehavior:
        "None. The reference has a single hard-coded subject and no device control.",
      sourceEvidence:
        "The literal `models/iphone-17-pro-max.glb` load in src/app/render/iphone-scene.ts; public/models holds five GLB files.",
      status: "intentionally-changed",
      toolcraftMapping:
        "A `device.model` select drives the scene builder's model file, scene name, screen material and exclusions from a catalog.",
      userApprovedChangeReason:
        "The user chose 'All 5 models with a device picker' when asked which devices the rebuild should support.",
    },
  ],
  referenceInputs: [],
  referenceName: "3d-mockup-project (Plinth)",
  referenceStudy: {
    behaviorEvidence:
      "Uploaded a PNG and confirmed it appears on the display; changed Fit mode, Screen scale, Screen position and Screen stretch and confirmed only the texture mapping changes; switched each environment and watched the reflections change; dragged the phone to rotate and the background to pan; toggled Background and exported a PNG.",
    referenceLocation:
      "https://github.com/ibrahimweng/3d-mockup-project at commit c2b67e6, cloned locally. The deployed build at 3d-mockup-project-main.vercel.app is unreachable from this environment because the network policy denies vercel.app, so the repository at that commit is the reference.",
    reproductionSteps:
      "npm install && npm run build succeeded, then the same source was served locally and driven in Chromium. The repository is the source of the deployed site, so running it locally observes the same runtime.",
    sourceEvidence:
      "Read src/app/app-schema.ts, app-composition.tsx, product-domain.ts, preview.tsx, export-renderer.ts, artwork-store.ts and the whole src/app/render directory. Inspected all five GLB files with @gltf-transform to record each one's scenes, emissive display material and screen geometry.",
    status: "ran-original",
  },
  referenceTimeline: { behaviorCoverage: [], mode: "none" },
  sourceOfTruth: "reference-runtime",
};

export const appProductReadiness: ToolcraftProductReadiness = {
  exportIntent: {
    image: { mode: "toolcraft-default" },
    svg: { mode: "not-requested" },
    video: { mode: "not-requested" },
  },
  interactionOwnership: [
    {
      alternative: {
        reason:
          "Panel sliders for azimuth and elevation would mirror the same rotation with two numeric fields and no spatial correspondence.",
        surface: "panel",
      },
      capability: "direct-spatial-edit",
      evidence: {
        detail:
          "The reference binds useToolcraftModelOrbitInteraction to its canvas with a geometry hit test, so dragging the device itself is the demonstrated rotation surface.",
        source: "reference",
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
          "A panel pad cannot show which part of the design sits under the pointer, so nudging values while watching the screen is a slower way to do the same thing.",
        surface: "panel",
      },
      capability: "direct-spatial-edit",
      evidence: {
        detail:
          "The user asked for the design to be moved by dragging on the screen while a drag on the body still rotates the device.",
        source: "user-request",
      },
      id: "screen-placement-drag",
      reason:
        "Placing a design inside a screen is a spatial judgement about what gets cropped, and dragging the design itself gives direct correspondence between hand movement and result.",
      surface: "canvas",
      target: "artwork.offset",
    },
    {
      alternative: {
        reason:
          "A freehand drag cannot express an exact coordinate, be nudged a fraction at a time, or be reset to a known value.",
        surface: "canvas",
      },
      capability: "precise-value-entry",
      evidence: {
        detail:
          "The pad remains the way to author an exact, repeatable position and to reset it, which dragging cannot do.",
        source: "usability-analysis",
      },
      id: "screen-placement-values",
      reason:
        "The pad authors an exact coordinate for the same placement the canvas drag edits freehand; the two capabilities differ rather than mirroring each other.",
      // One device is rendered at a time, so screen placement is a global
      // property rather than one scoped to a selected entity.
      selectionScope: { mode: "global" },
      surface: "panel",
      target: "artwork.offset",
    },
  ],
  mode: "product",
  productName: "Mockup Studio",
  productSummary:
    "Renders product mockups in the browser: a screenshot placed on the screen of one of five Apple devices, lit by captured studio environments and exported as an image.",
  requestedBehavior:
    "Pick a device, upload a screenshot and fit it to that device's screen, light the scene with a captured studio environment, frame it with a focal length and by rotating the device directly, choose whether to keep a background, then export the result as an image.",
  viewInteraction: {
    mode: "orbit",
    orientationTargets: ["camera.orbit"],
  },
};

// Product entries use the same explicit stable section IDs as appSchema.
export const appControlSectionInventory: readonly ToolcraftControlSectionInventoryEntry[] =
  [
    {
      entity: "Device",
      entityId: "device",
      groupingReason:
        "Which product is being mocked up and what colour it is are one decision about the same object; the finish is meaningless without the model it repaints.",
      id: "device",
      targets: ["device.model", "device.finish"],
      title: "Device",
    },
    {
      entity: "Screenshot",
      entityId: "artwork",
      groupingReason:
        "The uploaded image and the two pads that place it on the display are the picture itself and where it sits; all three are standalone-layout controls, so the runtime keeps them in one titled section.",
      id: "artwork",
      targets: ["artwork.image", "artwork.offset", "artwork.stretch"],
      title: "Screenshot",
    },
    {
      entity: "Screen fit",
      entityId: "screen-fit",
      groupingReason:
        "Mode and scale together decide how much of the display the picture covers and how much is cropped; they are a separate decision from which picture it is and where it sits, and both are grouped-layout controls.",
      id: "screen-fit",
      targets: ["artwork.fit", "artwork.scale"],
      title: "Screen fit",
    },
    {
      entity: "Studio",
      entityId: "studio",
      groupingReason:
        "The preset and the captured room it selects are one decision about how the scene is lit; the preset writes the capture, so separating them would put a control and the thing that sets it in different places.",
      id: "studio",
      targets: ["studio.preset", "studio.environment", "studio.intensity"],
      title: "Studio",
    },
    {
      entity: "Surface",
      entityId: "surface",
      groupingReason:
        "What the device stands on is one decision with one control, and it is separate from the backdrop behind it: a table replaces the floor while the sweep stays where it is, so grouping them would put a piece of furniture and a wall under the same heading.",
      id: "surface",
      targets: ["surface.kind"],
      title: "Surface",
    },
    {
      entity: "Backdrop",
      entityId: "backdrop",
      groupingReason:
        "The floor and the sweep behind it are one piece of paper, so its shape and its finish belong together: how far it rises and how it bends decide what the light does to it, and how much room it picks up, how much it reflects and how polished it is decide what that light looks like. All five are grouped-layout sliders.",
      id: "backdrop",
      targets: [
        "backdrop.height",
        "backdrop.curve",
        "backdrop.light",
        "floor.environment",
        "floor.reflection",
        "floor.roughness",
      ],
      title: "Backdrop",
    },
    {
      entity: "Lights",
      entityId: "lights",
      groupingReason:
        "Key, fill and rim are one placed rig sitting on top of the captured studio; the shadow's edge is the size of the key stated the only way a directional light can state it, and the pattern is what the same key shines through. Each is only meaningful relative to the others, and all six controls are grouped-layout.",
      id: "lights",
      targets: [
        "light.keyIntensity",
        "light.keyColor",
        "light.fill",
        "light.rim",
        "light.shadowSoftness",
        "light.pattern",
      ],
      title: "Lights",
    },
    {
      entity: "Key light placement",
      entityId: "key-light-placement",
      groupingReason:
        "Where the key sits is a separate decision from how hard the rig runs: placement is what rakes the light and swings the shadow, and the pad is that entity's complete editable surface.",
      id: "key-light-direction",
      targets: ["light.keyDirection"],
      title: "Key light direction",
    },
    {
      entity: "Camera",
      entityId: "camera",
      groupingReason:
        "Pose, focal length and zoom are the properties of one lens looking at the scene; together they fix where it stands, how compressed the picture is, and how much of the frame the subject fills.",
      id: "camera",
      targets: ["camera.focalLength", "camera.orbit", "camera.zoom"],
      title: "Camera",
    },
    {
      entity: "Framing offset",
      entityId: "framing-offset",
      groupingReason:
        "Where the subject sits in the picture is a separate decision from the lens looking at it — a shift rather than a move — and the pad is that entity's complete editable surface.",
      id: "framing",
      targets: ["camera.framing"],
      title: "Framing",
    },
    {
      entity: "Background",
      entityId: "background",
      groupingReason:
        "The include switch and the colour edit the same ground plane behind the device.",
      id: "background",
      targets: ["export.includeBackground", "scene.background"],
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
    automatedTestName: "device options map to catalog entries with a screen",
    browser: true,
    browserTestName:
      "browser: each device option renders its own model on the canvas",
    componentType: "select",
    evidence: "product-output",
    expectedObservable:
      "Selecting each device replaces the rendered subject with that model, reframed to fill the canvas, and the uploaded screenshot reappears on the new device's display.",
    fixture: "an uploaded PNG screenshot and the five bundled device models",
    id: "device.model.selection",
    kind: "control",
    optionCoverage: "each-visible-item",
    referenceCoverage: "renderer-state",
    target: "device.model",
    userAction:
      "Choose each Device option in turn and inspect the rendered canvas.",
  },
  {
    automated: true,
    automatedTestName: "finishes repaint only the materials each device names",
    browser: true,
    browserTestName:
      "browser: each finish repaints the device body and leaves the display alone",
    componentType: "select",
    evidence: "rendered-pixels",
    expectedObservable:
      "Choosing each finish repaints the device's body — the phone's rails and back, the laptop's aluminium, the watch's case and band — while the display, its design, and the surface character stay as they were. Natural restores the model's authored colours.",
    fixture: "each bundled device under the default studio",
    id: "device.finish.colorway",
    kind: "control",
    optionCoverage: "each-visible-item",
    target: "device.finish",
    userAction: "Choose each Finish option and inspect the rendered device.",
  },
  {
    automated: true,
    automatedTestName: "screenshot fileDrop is the single source-material owner",
    browser: true,
    browserTestName:
      "browser: uploading, transforming, and clearing the screenshot updates the rendered display",
    componentType: "fileDrop",
    evidence: "media-lifecycle",
    expectedObservable:
      "Uploading a PNG lights the device's display with that image, rotate and flip transform the image on the display, clearing it returns the screen to dark, and reset removes the upload.",
    fixture: "a small PNG screenshot fixture",
    id: "artwork.image.upload",
    kind: "control",
    mediaLifecycleCoverage: [
      "flip",
      "remove",
      "reset",
      "rotate",
      "transform-output",
      "upload",
    ],
    referenceCoverage: "media-lifecycle",
    target: "artwork.image",
    userAction:
      "Drop a PNG into the Screenshot uploader, click the rotate and flip actions, clear the upload, re-upload, and reset controls.",
  },
  {
    automated: true,
    automatedTestName: "fit modes map to the display texture repeat",
    browser: true,
    browserTestName:
      "browser: each fit mode changes how the screenshot meets the display",
    componentType: "segmented",
    evidence: "product-output",
    expectedObservable:
      "Fit shows the whole image with margins on the display, Fill crops it to cover the display, and Stretch distorts it to the display's exact proportions.",
    fixture: "an uploaded PNG whose aspect differs from the device's screen",
    id: "artwork.fit.mode",
    kind: "control",
    optionCoverage: "each-visible-item",
    referenceCoverage: "control-mapping",
    target: "artwork.fit",
    userAction: "Select each Fit mode option and inspect the rendered display.",
  },
  {
    automated: true,
    automatedTestName:
      "position, scale and stretch remap the display texture only",
    browser: true,
    browserTestName:
      "browser: screen position, scale and stretch move the image inside the display",
    componentType: "vector",
    controlPartCoverage: ["vector.x", "vector.y"],
    evidence: "product-output",
    expectedObservable:
      "Dragging Screen position pans the cropped image inside the display, Screen scale zooms it about its centre, and Screen stretch changes each axis independently, all without reloading the model.",
    fixture: "an uploaded PNG cropped by the current fit mode",
    id: "artwork.placement.transform",
    interactionId: "screen-placement-values",
    kind: "control",
    referenceCoverage: "control-mapping",
    target: "artwork.offset",
    userAction:
      "Drag the Screen position pad, move the Screen scale slider, and drag the Screen stretch pad.",
  },
  {
    automated: true,
    automatedTestName: "screen scale writes the display texture repeat",
    browser: true,
    browserTestName: "browser: screen scale zooms the image on the display",
    componentType: "slider",
    evidence: "product-output",
    expectedObservable:
      "Raising Screen scale enlarges the screenshot on the display about its centre and crops more of it.",
    fixture: "an uploaded PNG on the device display",
    id: "artwork.scale.zoom",
    kind: "control",
    target: "artwork.scale",
    userAction: "Drag the Screen scale slider and watch the display.",
  },
  {
    automated: true,
    automatedTestName: "screen stretch scales each display axis independently",
    browser: true,
    browserTestName:
      "browser: screen stretch distorts the image along one axis",
    componentType: "vector",
    controlPartCoverage: ["vector.x", "vector.y"],
    evidence: "product-output",
    expectedObservable:
      "Moving one Screen stretch axis squashes or extends the screenshot along that axis while the other stays unchanged.",
    fixture: "an uploaded PNG on the device display",
    id: "artwork.stretch.axes",
    kind: "control",
    target: "artwork.stretch",
    userAction: "Drag the Screen stretch pad along each axis.",
  },
  {
    automated: true,
    automatedTestName: "each studio preset writes its whole rig in one entry",
    browser: true,
    browserTestName:
      "browser: choosing an environment relights, refloors and reframes the shot",
    componentType: "select",
    evidence: "rendered-pixels",
    expectedObservable:
      "Choosing an environment changes the backdrop, the floor's reflection, the light rig and the camera angle together, and one undo puts all of them back, because a preset writes every control it touches under a single history group.",
    fixture: "the bundled studio presets",
    id: "studio.preset.applies",
    kind: "control",
    optionCoverage: "each-visible-item",
    target: "studio.preset",
    userAction: "Choose each Environment option and inspect the render.",
  },
  {
    automated: true,
    automatedTestName: "light pattern casts its cut-out across the scene",
    browser: true,
    browserTestName:
      "browser: choosing a pattern lays bars of shadow across the floor beside the device",
    componentType: "select",
    evidence: "rendered-pixels",
    expectedObservable:
      "Choosing Window lays a sash of shadow across the scene — dark outside the opening, a bright three-by-three of panes inside it, glazing bars between them — with the device standing in the middle pane. Choosing Blinds replaces it with evenly spaced slats running the way the light is travelling. Both keep the same size on the floor whatever angle the key is raked to, and both continue to the edge of frame rather than stopping on a line partway across it. None leaves the floor unbroken.",
    fixture: "any device casting a shadow on a visible background",
    id: "light.pattern.gobo",
    kind: "control",
    optionCoverage: "each-visible-item",
    target: "light.pattern",
    userAction: "Pick each option of the Lights pattern control in turn.",
  },
  {
    automated: true,
    automatedTestName: "shadow softness changes how far the shadow edge fades",
    browser: true,
    browserTestName:
      "browser: lowering shadow softness sharpens the edge of the device's shadow",
    componentType: "slider",
    evidence: "rendered-pixels",
    expectedObservable:
      "Lowering Shadow softness draws the device's shadow with a hard edge that turns from dark to background over a few pixels; raising it spreads that transition across a wide, even gradient with no edge to find.",
    fixture: "any device casting a shadow on a visible background",
    id: "light.shadowSoftness.edge",
    kind: "control",
    target: "light.shadowSoftness",
    userAction: "Drag the Lights shadow softness slider from 0 to 100.",
  },
  {
    automated: true,
    automatedTestName: "surface stands the device on a named material",
    browser: true,
    browserTestName:
      "browser: each surface replaces the endless floor with a slab of that material",
    componentType: "select",
    evidence: "rendered-pixels",
    expectedObservable:
      "Choosing a surface stands the device on a piece of furniture. The floor drops away beneath it and carries on past it, so a turned top appears with a lit chamfer along its near edges, a shaded face below them, and — on the devices given a table rather than a slab — legs reaching down to a floor that is still there. Stone arrives warm, honed and veined; Oak arrives warm and grained, running across the top and continuing over the edge; Steel arrives as a mirror laid flat, carrying the captured room and smearing the key into a band along its brush lines; Glass arrives dark and near-black with the room in it and a bright line along its chamfer. The scene relights with each, because a pale board throws a warm underlight back into the device that stone does not, and a polished top throws almost nothing back at all. Returning to None puts the device back on the floor itself.",
    fixture: "a device the catalog gives a table, on a visible background",
    id: "surface.kind.material",
    kind: "control",
    optionCoverage: "each-visible-item",
    target: "surface.kind",
    userAction: "Pick each option of the Surface control in turn.",
  },
  {
    automated: true,
    automatedTestName: "sweep height raises a backdrop behind the device",
    browser: true,
    browserTestName:
      "browser: raising sweep height puts a lit backdrop behind the device",
    componentType: "slider",
    evidence: "rendered-pixels",
    expectedObservable:
      "Raising Sweep height replaces the empty space behind the device with a lit backdrop that curves up out of the floor and graduates from bright near the floor to dark at the top; returning it to zero leaves the floor alone against the background.",
    fixture: "any device on a visible background",
    id: "backdrop.height.raises",
    kind: "control",
    target: "backdrop.height",
    userAction: "Drag the Backdrop sweep height slider from 0 to 100 and back.",
  },
  {
    automated: true,
    automatedTestName: "sweep curve changes where the floor becomes the wall",
    browser: true,
    browserTestName:
      "browser: widening sweep curve moves the bend and softens the graduation",
    componentType: "slider",
    evidence: "rendered-pixels",
    expectedObservable:
      "With a sweep raised, lowering Curve pulls the bend into a tight corner with a visible line across it, and raising it spreads the bend into a broad cove whose tone falls off gradually up the backdrop.",
    fixture: "any device on a visible background",
    id: "backdrop.curve.bend",
    kind: "control",
    target: "backdrop.curve",
    userAction: "Raise Sweep height, then drag Sweep curve across its range.",
  },
  {
    automated: true,
    automatedTestName: "sweep light graduates the backdrop from the floor up",
    browser: true,
    browserTestName:
      "browser: raising backdrop light graduates the backdrop instead of leaving it flat",
    componentType: "slider",
    evidence: "rendered-pixels",
    expectedObservable:
      "Raising Backdrop light puts a pool of brightness on the backdrop that fades with distance from it, so the backdrop stops being one flat tone — up the sweep when one is raised, and outwards across the floor when none is. The device itself barely changes, because the lamp faces the backdrop.",
    fixture: "any device on a visible background",
    id: "backdrop.light.graduates",
    kind: "control",
    target: "backdrop.light",
    userAction: "Drag the Backdrop light slider from 0 to 100, with and without a sweep raised.",
  },
  {
    automated: true,
    automatedTestName: "floor room light changes how much the floor picks up",
    browser: true,
    browserTestName:
      "browser: lowering floor room light darkens the floor without dimming the device",
    componentType: "slider",
    evidence: "rendered-pixels",
    expectedObservable:
      "Lowering Room light darkens the floor towards its own colour while the device keeps its brightness and its reflections, because the setting scales what the floor takes from the captured room and nothing else.",
    fixture: "any device on a visible background",
    id: "floor.environment.pickup",
    kind: "control",
    target: "floor.environment",
    userAction: "Drag the Floor room light slider from 100 to 0.",
  },
  {
    automated: true,
    automatedTestName: "floor reflection draws the device mirrored beneath it",
    browser: true,
    browserTestName:
      "browser: raising floor reflection puts the device's reflection under it",
    componentType: "slider",
    evidence: "rendered-pixels",
    expectedObservable:
      "Raising Reflection makes the device appear inverted below the floor, fading with distance, and lowering it to zero removes it, because the floor becomes transparent over a mirrored copy of the device.",
    fixture: "any device on a visible background",
    id: "floor.reflection.mirrors",
    kind: "control",
    target: "floor.reflection",
    userAction: "Drag the Floor reflection slider from 0 to 100 and back.",
  },
  {
    automated: true,
    automatedTestName: "floor roughness changes how sharply the floor mirrors",
    browser: true,
    browserTestName:
      "browser: lowering floor roughness sharpens what the floor returns",
    componentType: "slider",
    evidence: "rendered-pixels",
    expectedObservable:
      "Lowering Roughness makes the floor return the captured room and the device more sharply; raising it diffuses both until the floor is plain matte.",
    fixture: "any device on a visible background",
    id: "floor.roughness.finish",
    kind: "control",
    target: "floor.roughness",
    userAction: "Drag the Floor roughness slider across its range.",
  },
  {
    automated: true,
    automatedTestName: "environment options select the image-based lighting",
    browser: true,
    browserTestName:
      "browser: each environment relights the device and changes its reflections",
    componentType: "select",
    evidence: "rendered-pixels",
    expectedObservable:
      "Selecting each environment changes the light direction and the reflections on the device's body, because the chosen HDRI is the whole lighting model.",
    fixture: "the four bundled HDR environments",
    id: "studio.environment.lighting",
    kind: "control",
    optionCoverage: "each-visible-item",
    referenceCoverage: "renderer-state",
    target: "studio.environment",
    userAction: "Choose each Environment option and inspect the render.",
  },
  {
    automated: true,
    automatedTestName:
      "screen drags claim the pointer and body drags leave it to orbit",
    browser: true,
    browserTestName:
      "browser: dragging on the screen moves the design while dragging the body rotates",
    canvasHandle: {
      exportCleanTestName:
        "browser: the exported PNG contains no placement chrome",
      outputObservable:
        "The design slides under the pointer inside the display while the device stays still.",
      testId: "toolcraft-product-output",
      writesTarget: "artwork.offset",
    },
    componentType: "canvas",
    evidence: "product-output",
    expectedObservable:
      "A drag starting on the display moves the design across it and leaves the device's orientation unchanged; a drag starting on the body rotates the device and leaves the design where it sits; a drag starting on empty canvas pans the viewport.",
    fixture: "a design larger than the display so it is cropped on both axes",
    id: "artwork.placement.drag",
    interactionId: "screen-placement-drag",
    kind: "canvas-handle",
    target: "artwork.offset",
    userAction:
      "Drag across the device's screen, then drag across its body, then drag the empty background.",
  },
  {
    automated: true,
    automatedTestName: "environment intensity scales the captured studio",
    browser: true,
    browserTestName:
      "browser: lowering environment intensity darkens the device's ambient lighting",
    componentType: "slider",
    evidence: "rendered-pixels",
    expectedObservable:
      "Lowering Environment darkens the light the captured studio contributes, leaving the placed lights as the visible source; raising it brightens the whole device.",
    fixture: "the default device under the default studio",
    id: "studio.intensity.level",
    kind: "control",
    target: "studio.intensity",
    userAction: "Drag the Environment slider from 0% to 300%.",
  },
  {
    automated: true,
    automatedTestName: "key intensity drives the shadow-casting light",
    browser: true,
    browserTestName:
      "browser: raising the key brightens the lit side and deepens the contact shadow",
    componentType: "slider",
    evidence: "rendered-pixels",
    expectedObservable:
      "Raising Key brightens the side of the device facing the light and darkens its contact shadow; at 0% only the environment and fill remain.",
    fixture: "the default device with Background enabled so the shadow is visible",
    id: "light.key.intensity",
    kind: "control",
    target: "light.keyIntensity",
    userAction: "Drag the Key slider from 0% to 400%.",
  },
  {
    automated: true,
    automatedTestName: "key color tints the shadow-casting light",
    browser: true,
    browserTestName: "browser: changing the key color tints the lit side",
    componentType: "color",
    evidence: "rendered-pixels",
    expectedObservable:
      "Choosing a warm key tints the lit side of the device towards that colour while the environment reflections stay neutral.",
    fixture: "the default device with the key at its default intensity",
    id: "light.key.color",
    kind: "control",
    target: "light.keyColor",
    userAction: "Pick a clearly warm key color.",
  },
  {
    automated: true,
    automatedTestName: "key direction repositions the shadow-casting light",
    browser: true,
    browserTestName:
      "browser: moving the key direction pad rakes the light and swings the shadow",
    componentType: "vector",
    controlPartCoverage: ["vector.x", "vector.y"],
    evidence: "product-output",
    expectedObservable:
      "Dragging the pad off centre moves the highlight across the device and swings its contact shadow to the opposite side.",
    fixture: "the default device with Background enabled so the shadow is visible",
    id: "light.key.direction",
    kind: "control",
    target: "light.keyDirection",
    userAction: "Drag the Key light direction pad to each corner.",
  },
  {
    automated: true,
    automatedTestName: "fill lifts the shadow side without casting",
    browser: true,
    browserTestName: "browser: raising fill brightens the unlit side",
    componentType: "slider",
    evidence: "rendered-pixels",
    expectedObservable:
      "Raising Fill brightens the side of the device facing away from the key without adding a second shadow.",
    fixture: "the default device with the key raking from one side",
    id: "light.fill.level",
    kind: "control",
    target: "light.fill",
    userAction: "Drag the Fill slider from 0% to 200%.",
  },
  {
    automated: true,
    automatedTestName: "rim separates the device from the backdrop",
    browser: true,
    browserTestName: "browser: raising rim lights the device's back edge",
    componentType: "slider",
    evidence: "rendered-pixels",
    expectedObservable:
      "Raising Rim lights the edge of the device facing away from the camera, separating its silhouette from the backdrop.",
    fixture: "the default device against the default dark background",
    id: "light.rim.level",
    kind: "control",
    target: "light.rim",
    userAction: "Drag the Rim slider from 0% to 400%.",
  },
  {
    automated: true,
    automatedTestName: "focal length drives camera FOV and viewing distance",
    browser: true,
    browserTestName:
      "browser: focal length changes perspective while keeping the device framed",
    componentType: "slider",
    evidence: "product-output",
    expectedObservable:
      "Moving Focal length changes how strongly the device's depth converges while the subject stays framed at roughly the same size.",
    fixture: "the default device in the default studio",
    id: "camera.focalLength.framing",
    kind: "control",
    referenceCoverage: "control-mapping",
    target: "camera.focalLength",
    userAction: "Drag the Focal length slider from 24mm to 200mm.",
  },
  {
    automated: true,
    automatedTestName: "zoom crops the frame without moving the camera",
    browser: true,
    browserTestName:
      "browser: zoom changes how much of the frame the subject fills and nothing else",
    componentType: "slider",
    evidence: "product-output",
    expectedObservable:
      "Raising Zoom makes everything larger in the picture without changing how the device's depth converges, and past 100% the set is cropped by the edges of frame; lowering it leaves more room around the subject. The device's perspective is identical at every setting, because the camera has not moved.",
    fixture: "the default device in the default studio",
    id: "camera.zoom.crop",
    kind: "control",
    target: "camera.zoom",
    userAction: "Drag the Zoom slider from 40% to 260%.",
  },
  {
    automated: true,
    automatedTestName: "framing offset shifts the picture without leaning it",
    browser: true,
    browserTestName:
      "browser: the framing pad moves the subject off centre with verticals still upright",
    componentType: "vector",
    controlPartCoverage: ["vector.x", "vector.y"],
    evidence: "product-output",
    expectedObservable:
      "Moving the Framing pad slides the subject across the picture and leaves room on the other side of it. Vertical edges stay vertical however far it is moved, because the projection is shifted rather than the camera turned.",
    fixture: "the default device in the default studio",
    id: "camera.framing.shift",
    kind: "control",
    target: "camera.framing",
    userAction: "Drag the Framing pad from centre to each corner.",
  },
  {
    automated: true,
    automatedTestName: "orbit pose is shared by gizmo, drag, preview and export",
    browser: true,
    browserTestName:
      "browser: dragging the device rotates it, a miss pans, and export matches the pose",
    canvasHandle: {
      exportCleanTestName:
        "browser: the exported PNG contains no orientation gizmo",
      outputObservable:
        "The rendered device turns to the dragged orientation and the exported frame matches it.",
      testId: "toolcraft-orientation-gizmo",
      writesTarget: "camera.orbit",
    },
    componentType: "orientationGizmo",
    evidence: "product-output",
    expectedObservable:
      "Dragging the device rotates it live, dragging empty canvas pans the viewport instead, the gizmo writes the same pose, undo and reset restore it, and an exported PNG shows the same orientation with no gizmo in it.",
    fixture: "the default device with a screenshot applied",
    id: "camera.orbit.pose",
    interactionId: "camera-orbit",
    kind: "canvas-handle",
    orientationGizmoCoverage: "all-required-orientation-gizmo-behavior",
    referenceCoverage: "renderer-loop",
    target: "camera.orbit",
    userAction:
      "Drag the device to rotate, drag the empty background, click a gizmo axis, undo, and export a PNG.",
  },
  {
    automated: true,
    automatedTestName:
      "background include switch drives preview and export backdrop",
    backgroundOutputCoverage: "all-required-background-output",
    browser: true,
    browserTestName:
      "browser: turning Background off leaves only the device and its shadow, and makes PNG export transparent",
    componentType: "switch",
    evidence: "product-output",
    expectedObservable:
      "Disabling Background clears the backdrop and its reflection, leaving the device and the shadow it casts over transparency, and exports a transparent PNG that can be composited onto anything; enabling it restores the backdrop.",
    fixture: "the default device framed above its ground plane",
    id: "background.include.toggle",
    kind: "control",
    referenceCoverage: "renderer-state",
    target: "export.includeBackground",
    userAction: "Toggle the Background switch and export a PNG in both states.",
  },
  {
    automated: true,
    automatedTestName: "background color fills the ground plane",
    browser: true,
    browserTestName:
      "browser: changing the background color repaints the ground behind the device",
    componentType: "color",
    evidence: "product-output",
    expectedObservable:
      "The ground plane behind and beneath the device repaints in the chosen colour.",
    fixture: "the default device with Background enabled",
    id: "background.color.value",
    kind: "control",
    target: "scene.background",
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
    fixture: "the default device with a screenshot applied",
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
    fixture: "the default device with a screenshot applied",
    id: "image-export.resolution.choice",
    kind: "control",
    optionCoverage: "each-visible-item",
    target: "export.image.resolution",
    userAction: "Choose each Resolution option and run Export PNG.",
  },
  {
    actionCoverage: ["export-png"],
    automated: true,
    automatedTestName: "sticky delivery action exports the rendered frame",
    browser: true,
    browserTestName:
      "browser: Export PNG downloads an artifact matching the previewed frame",
    componentType: "panelActions",
    evidence: "exported-bytes",
    expectedObservable:
      "Export PNG shows the sticky footer progress indicator and downloads an artifact that decodes at the selected format and resolution and shows the same device, pose and screenshot as the preview.",
    exportArtifactCoverage: "all-required-image-export-behavior",
    fixture: "the default device with a screenshot applied",
    id: "deliver.actions.export",
    kind: "control",
    referenceCoverage: "export-copy",
    target: "panel.actions",
    userAction: "Click Export PNG and inspect the downloaded artifact.",
  },
  {
    automated: true,
    automatedTestName: "render scale keeps the selected backing resolution",
    browser: true,
    browserTestName:
      "browser: the WebGL backing follows the selected scale up to the preview ceiling",
    componentType: "canvas",
    evidence: "viewport-side-effect",
    expectedObservable:
      "Raising Resolution scale raises the canvas backing to match, up to a ceiling of two device pixels per CSS pixel, and the visible CSS size never changes. The ceiling is the preview's own: multiplying the scale by the display's ratio on top of it would draw sixteen times the pixels the box can show. While rotating the backing may fall below the selection and climbs back once frames stop arriving late.",
    fixture: "the default device at the default canvas size",
    id: "canvas.render-scale.backing",
    kind: "runtime",
    renderScaleCoverage: {
      kind: "selected-backing-pixels",
      states: ["interaction", "steady"],
    },
    target: "canvas.renderScale",
    userAction:
      "Set Resolution scale, drag the device to rotate, then let the scene settle.",
  },
  {
    automated: true,
    automatedTestName: "canvas sizing edits the product output size",
    browser: true,
    browserTestName:
      "browser: editing canvas width and height resizes the rendered output",
    componentType: "canvas",
    evidence: "viewport-side-effect",
    expectedObservable:
      "Editing Canvas width or height changes the artboard and the rendered frame's aspect, and the device stays framed inside the new bounds.",
    fixture: "the default device at the default 1080x1350 canvas",
    id: "canvas.sizing.editable-output",
    kind: "runtime",
    referenceCoverage: "canvas-sizing",
    target: "canvas.size.width",
    userAction: "Edit Canvas width and Canvas height in Setup.",
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
    fixture: "the default device at the default finite canvas",
    id: "canvas.infinity.mode-restoration",
    infinityCanvasCoverage: "mode-and-restoration",
    kind: "runtime",
    target: "canvas.infinity",
    userAction:
      "Enable Infinity canvas in Setup, pan the workspace, then disable it.",
  },
  {
    automated: true,
    automatedTestName: "infinite export crops to the product scene bounds",
    browser: true,
    browserTestName:
      "browser: infinite-mode PNG export crops to the product scene bounds union",
    componentType: "canvas",
    evidence: "exported-bytes",
    expectedObservable:
      "Exporting a PNG in Infinity mode produces an artifact cropped to the rectangle reported by the scene bounds provider rather than the viewport.",
    fixture: "the default device in Infinity canvas mode",
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
      "Canvas size and zoom, the selected device and control values, the uploaded screenshot, and the moved and collapsed Controls workspace remain visibly restored after a real browser reload.",
    fixture: "product runtime persisted workspace",
    id: "persistence.reload",
    kind: "runtime",
    persistenceCoverage: "reload",
    persistenceSlices: productPersistenceSlices,
    target: "canvas.size.width",
    userAction:
      "Edit Canvas width and zoom, choose a different device, upload a screenshot, move and collapse Controls, wait for persistence, and reload the page.",
  },
];
