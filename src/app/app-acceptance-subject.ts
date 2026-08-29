import type { ToolcraftComponentAcceptance } from "./acceptance/types";

/**
 * What the picture is of: the device, the design on it, and the set it stands
 * in. Split from the rest of the acceptance rows on size alone — one array of
 * four dozen entries is a policy dump, and these are the half that describe the
 * subject rather than the shot taken of it.
 */
export const subjectAcceptance: readonly ToolcraftComponentAcceptance[] = [
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
    automatedTestName: "part colours paint only the materials each product names",
    browser: true,
    browserTestName:
      "browser: each part colour repaints its own part of the product",
    componentType: "color",
    evidence: "rendered-pixels",
    expectedObservable:
      "Choosing a Product colour repaints the product's main surface \u2014 the shirt's body, the bottle's cap, the board a folder is built on \u2014 and leaves the trim, the accent and any printed design as they were.",
    fixture: "each merchandise product under the default studio",
    id: "product.color.main.repaint",
    kind: "control",
    target: "product.color.main",
    timelineCoverage: "keyframes",
    userAction: "Pick a Product colour and inspect the rendered product.",
  },
  {
    automated: true,
    automatedTestName: "part colours paint only the materials each product names",
    browser: true,
    browserTestName:
      "browser: each part colour repaints its own part of the product",
    componentType: "color",
    evidence: "rendered-pixels",
    expectedObservable:
      "Choosing a Trim colour repaints only the part set against the main surface, such as the shirt's sleeves or the ring under the bottle's cap, and the main surface keeps its own colour.",
    fixture: "each merchandise product under the default studio",
    id: "product.color.trim.repaint",
    kind: "control",
    target: "product.color.trim",
    timelineCoverage: "keyframes",
    userAction: "Pick a Trim colour and inspect the rendered product.",
  },
  {
    automated: true,
    automatedTestName: "part colours paint only the materials each product names",
    browser: true,
    browserTestName:
      "browser: each part colour repaints its own part of the product",
    componentType: "color",
    evidence: "rendered-pixels",
    expectedObservable:
      "Choosing an Accent colour repaints only the smallest named part, such as the collar rib or the cap's latch, and every other part keeps its own colour.",
    fixture: "each merchandise product under the default studio",
    id: "product.color.accent.repaint",
    kind: "control",
    target: "product.color.accent",
    timelineCoverage: "keyframes",
    userAction: "Pick an Accent colour and inspect the rendered product.",
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
    timelineCoverage: "keyframes",
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
    timelineCoverage: "keyframes",
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
    timelineCoverage: "keyframes",
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
    timelineCoverage: "keyframes",
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
    timelineCoverage: "keyframes",
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
    timelineCoverage: "keyframes",
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
    timelineCoverage: "keyframes",
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
    timelineCoverage: "keyframes",
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
    timelineCoverage: "keyframes",
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
    timelineCoverage: "keyframes",
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
];
