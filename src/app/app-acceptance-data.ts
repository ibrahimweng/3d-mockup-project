import type {
  ToolcraftComponentAcceptance,
  ToolcraftControlSectionInventoryEntry,
  ToolcraftProductReadiness,
  ToolcraftTransferMode,
} from "./acceptance/types";
import { appSchema } from "./app-schema";
import { outputAcceptance } from "./app-acceptance-output";
import { panelAcceptance } from "./app-acceptance-panel";
import { subjectAcceptance } from "./app-acceptance-subject";

export const appTransferMode: ToolcraftTransferMode = {
  /**
   * A turntable, and a loop as long as one turn of it.
   *
   * Six seconds is the product decision, not a framework default: it is how
   * long an unhurried full revolution takes to read, and the timeline panel's
   * default duration is set from the same number so the two cannot drift.
   */
  animationIntent: {
    loopDuration: {
      evidence:
        "One revolution of the device is the whole animation, and six seconds is how long that turn takes to read as deliberate rather than hurried. panels.timeline.defaultDurationSeconds carries the same value.",
      seconds: 6,
      source: "product-derived",
    },
    mode: "timeline-keyframes",
  },
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
        "Dragging anywhere on the canvas rotates the device, the empty space beside it included; the middle button moves the board without touching the pose; the gizmo writes the same pose the renderer draws.",
      featureName: "Orbit by direct drag and gizmo",
      id: "camera-orbit",
      referenceBehavior:
        "A geometry hit test claims primary drag for rotation and lets a miss fall through to viewport pan; the gizmo writes the same pose.",
      sourceEvidence:
        "useToolcraftModelOrbitInteraction plus RasterRenderer.hitTest in src/app/preview.tsx and src/app/render/raster-renderer.ts; the dirty-flag requestAnimationFrame loop in preview.tsx draws only invalidated frames.",
      status: "intentionally-changed",
      toolcraftMapping:
        "Same `camera.orbit` orientationGizmo target, the same pose writes through runtime dispatch with one history group per gesture, and the same dirty-flag render loop. What differs is which pointer claims the rotation: `src/app/view-orbit.ts` takes any plain primary drag rather than only one that hits the device, and the board moves on the middle button rather than on a miss.",
      userApprovedChangeReason:
        "The user was shown the divergence and the alternative of reverting to the reference hit test, and approved keeping it and correcting this record to say so. It exists because a phone's whole front face belongs to the design drag and its body is a thin rail, which leaves almost nothing to grab when only a hit rotates — and requiring the pointer to find the object first is what makes a 3D viewer feel fiddly.",
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
    video: {
      evidence:
        "The user asked to animate finished mockups on a timeline with keyframes, and named Rotato — whose output is a video file — as the thing to match. They were asked what the animation should come out as and chose a video file first.",
      mode: "user-requested",
    },
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
      entity: "View",
      entityId: "view-tabs",
      groupingReason:
        "One control, and the only one in the panel that sets nothing about the picture: it says which of the four jobs \u2014 choosing the product, printing on it, lighting it, writing the file \u2014 the rest of the panel is currently for. It is a section of its own because everything else in the panel is one of the things it switches between, so there is nothing it could share a section with.",
      id: "view-tabs",
      targets: ["view.tab"],
      title: "View",
    },
    {
      entity: "Device",
      entityId: "device",
      groupingReason:
        "Which product is being mocked up and how it is posed are one decision about the same object: every angle, offset and size turns the same body. Eight controls is past the usual section size, so each says which part of the one entity it is \u2014 what it is, which way it is turned, where it stands. What it looks like moved next door, because a colourway is the same decision as the colours beside it rather than the same decision as an angle.",
      id: "device",
      targets: [
        "device.model",
        "device.spin",
        "device.tilt",
        "device.roll",
        "device.positionX",
        "device.positionY",
        "device.positionZ",
        "device.scale",
      ],
      title: "Device",
    },
    {
      entity: "Appearance",
      entityId: "product-parts",
      groupingReason:
        "What the product's own surfaces look like, as distinct from the design printed on top of them. A finish is a colourway the manufacturer sells and the three colours are blank stock a person picks themselves \u2014 a difference in where the colour comes from, not in what is being decided \u2014 so they are one section rather than two: apart, choosing what a shirt looks like meant a colourway in one place and its collar rib in another. Each colour appears only for a product that declares that part.",
      id: "product-parts",
      targets: [
        "device.finish",
        "product.color.main",
        "product.color.trim",
        "product.color.accent",
      ],
      title: "Appearance",
    },
    {
      entity: "Video Export",
      entityId: "video-export",
      groupingReason:
        "The container and the frame size are the two things a video file is written with, and neither means anything without the other; they sit together above the action that uses them.",
      id: "video-export",
      targets: ["export.video.format", "export.video.resolution"],
      title: "Video Export",
    },
    {
      entity: "Artwork",
      entityId: "artwork",
      groupingReason:
        "The uploaded images, the panel picker that says which of them is on screen, the colour they are printed on and the two pads that place them are the picture itself and where it sits; the four uploaders are one decision taken up to four times, because a product with four printable zones is still one design. The all-over switch is here rather than in a section of its own because it gates three of those uploaders, and a gate belongs with what it gates; it brings its repeat with it. The section declares itself standalone, which is what keeps the switch and the slider from being cut out of it.",
      id: "artwork",
      targets: [
        "artwork.zone",
        "artwork.image",
        "artwork.imageBack",
        "artwork.imageLeft",
        "artwork.imageRight",
        "artwork.allOver",
        "artwork.repeats",
        "artwork.background",
        "artwork.offset",
        "artwork.stretch",
      ],
      title: "Artwork",
    },
    {
      entity: "Templates",
      entityId: "artwork-templates",
      groupingReason:
        "One command, kept out of the Artwork section because an actions control is grouped-layout where the uploaders and pads beside it are standalone, and out of the delivery footer because the templates are what a design is drawn against rather than the product coming out.",
      id: "artwork-templates",
      targets: ["artwork.templates"],
      title: "Templates",
    },
    {
      entity: "Fit & scale",
      entityId: "screen-fit",
      groupingReason:
        "Mode and scale together decide how much of the display the picture covers and how much is cropped; they are a separate decision from which picture it is and where it sits, and both are grouped-layout controls.",
      id: "screen-fit",
      targets: ["artwork.fit", "artwork.scale"],
      title: "Fit & scale",
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

/**
 * Every acceptance row, in the order they are declared.
 *
 * The rows themselves live next door in two files, by subject and by
 * output; the order across the two is part of the contract, so they are
 * concatenated here rather than merged anywhere else.
 */
export const appAcceptance: readonly ToolcraftComponentAcceptance[] = [
  ...panelAcceptance,
  ...subjectAcceptance,
  ...outputAcceptance,
];
