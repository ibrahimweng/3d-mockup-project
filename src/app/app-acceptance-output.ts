import type { ToolcraftComponentAcceptance } from "./acceptance/types";
import { appSchema } from "./app-schema";

const productPersistenceSlices =
  appSchema.persistence.storage === "localStorage"
    ? appSchema.persistence.include
    : [];


/**
 * The shot and what comes out of it: placing the design by hand, the rig, the
 * camera, the background, and every route by which a frame leaves the app.
 */
export const outputAcceptance: readonly ToolcraftComponentAcceptance[] = [
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
      "A drag starting on the display moves the design across it and leaves the device's orientation unchanged; a drag starting anywhere else with the primary button rotates the device and leaves the design where it sits; the middle button moves the board.",
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
    timelineCoverage: "keyframes",
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
    timelineCoverage: "keyframes",
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
    timelineCoverage: "keyframes",
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
    timelineCoverage: "keyframes",
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
    timelineCoverage: "keyframes",
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
    timelineCoverage: "keyframes",
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
    timelineCoverage: "keyframes",
    userAction: "Drag the Focal length slider from 24mm to 200mm.",
  },
  {
    automated: true,
    automatedTestName: "timeline playback scrubs, pauses, loops and redraws",
    browser: true,
    browserTestName:
      "browser: the timeline scrubs, pauses, changes duration, and loops back to the frame it started on",
    componentType: "canvas",
    evidence: "product-output",
    expectedObservable:
      "Playing runs the animation forward and the rendered frame changes with it; pausing stops it where it stands and resuming carries on from there rather than restarting. Scrubbing to a time draws that time. Editing the duration changes how long the loop takes without changing the animation itself. The loop only ever runs forward, and the frame it ends on is the frame it began on.",
    fixture: "the default device with Spin keyframed a full turn",
    id: "timeline.playback",
    kind: "runtime",
    target: "panels.timeline",
    timelineCoverage: "playback",
    timelineLoopProof: {
      direction: "forward-only",
      durationChange: "reproved-after-edit",
      reversePlayback: "forbidden",
      seam: "first-last-match",
    },
    timelinePlaybackCoverage: [
      "duration",
      "loop",
      "pause-resume",
      "rendered-frame",
      "scrub",
    ],
    userAction:
      "Play, pause, resume, scrub to a time, edit the duration, and let the loop come round.",
  },
  {
    automated: true,
    automatedTestName: "keyframes edit and the renderer evaluates them",
    browser: true,
    browserTestName:
      "browser: keyframing Spin puts diamonds on its timeline row and the frame follows them",
    componentType: "canvas",
    evidence: "product-output",
    expectedObservable:
      "Keyframing Spin gives it a row on the expanded timeline with a diamond at each keyed time. Editing the value with a keyframe selected updates that keyframe rather than adding another. The rendered frame at any time is the value the keyframes evaluate to there, not the value the control was last left at.",
    fixture: "the default device with Spin keyframed a full turn",
    id: "timeline.keyframes",
    kind: "runtime",
    target: "panels.timeline",
    timelineCoverage: "keyframes",
    userAction:
      "Key Spin at the start and end, scrub between them, and edit the value with one selected.",
  },
  {
    automated: true,
    automatedTestName: "spin turns the subject without moving the camera",
    browser: true,
    browserTestName:
      "browser: spin turns the device on the spot and the camera holds still",
    componentType: "slider",
    evidence: "product-output",
    expectedObservable:
      "Moving Spin turns the device about its own upright axis. The camera does not move with it: the light stays where it was, so the lit side travels around the device rather than following it, and the shadow swings across the floor instead of staying put. At 0 and at 360 the picture is identical.",
    fixture: "the default device in the default studio",
    id: "device.spin.turn",
    kind: "control",
    target: "device.spin",
    timelineCoverage: "keyframes",
    userAction: "Drag the Spin slider from 0\u00b0 to 90\u00b0, then to 360\u00b0.",
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
    timelineCoverage: "keyframes",
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
    timelineCoverage: "keyframes",
    userAction: "Drag the Framing pad from centre to each corner.",
  },
  {
    automated: true,
    automatedTestName: "orbit pose is shared by gizmo, drag, preview and export",
    browser: true,
    browserTestName:
      "browser: dragging the device rotates it, the middle button moves the board, and export matches the pose",
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
      "Dragging the device rotates it live, the middle button moves the board without touching the pose, the gizmo writes the same pose, undo and reset restore it, and an exported PNG shows the same orientation with no gizmo in it.",
    fixture: "the default device with a screenshot applied",
    id: "camera.orbit.pose",
    interactionId: "camera-orbit",
    kind: "canvas-handle",
    orientationGizmoCoverage: "all-required-orientation-gizmo-behavior",
    referenceCoverage: "renderer-loop",
    target: "camera.orbit",
    userAction:
      "Drag the device to rotate, drag with the middle button, click a gizmo axis, undo, and export a PNG.",
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
    timelineCoverage: "keyframes",
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
    automated: true,
    automatedTestName: "video export writes the selected container",
    browser: true,
    browserTestName:
      "browser: Export Video writes the selected format at the selected size",
    componentType: "select",
    evidence: "exported-bytes",
    expectedObservable:
      "Exporting as MP4 downloads a file that decodes as MP4; exporting as WebM downloads one that decodes as WebM. Both run for the timeline's duration and carry one packet every thirtieth of a second.",
    fixture: "the default device with Spin keyframed a full turn",
    id: "video-export.settings",
    kind: "control",
    optionCoverage: "each-visible-item",
    target: "export.video.format",
    userAction: "Choose each Format option and run Export Video.",
  },
  {
    automated: true,
    automatedTestName: "video export writes the selected size",
    browser: true,
    browserTestName:
      "browser: Export Video writes the selected format at the selected size",
    componentType: "select",
    evidence: "exported-bytes",
    expectedObservable:
      "Canvas size writes the artboard's own pixels; 4K writes a 3840 pixel long edge. Neither changes what the animation does, only how large it is written.",
    fixture: "the default device with Spin keyframed a full turn",
    id: "video-export.resolution",
    kind: "control",
    optionCoverage: "each-visible-item",
    target: "export.video.resolution",
    userAction: "Choose each Resolution option and run Export Video.",
  },
  {
    automated: true,
    automatedTestName: "infinite video export holds one scene envelope",
    browser: true,
    browserTestName:
      "browser: infinite-mode video export holds one scene-bounds envelope for every frame",
    componentType: "canvas",
    evidence: "exported-bytes",
    expectedObservable:
      "With Infinity canvas on, every frame of the exported video is cut to the same envelope — the union of the scene across the whole time range — so the subject moves inside a frame that does not itself resize from frame to frame.",
    fixture: "Infinity canvas on, with Spin keyframed a full turn",
    id: "canvas.infinity.scene-video",
    infinityCanvasCoverage: "scene-bounds-video-export",
    kind: "runtime",
    target: "canvas.infinity",
    userAction: "Turn Infinity canvas on, keyframe a full turn, and run Export Video.",
  },
  {
    actionCoverage: ["export-png", "export-video"],
    automated: true,
    automatedTestName: "sticky delivery action exports the rendered frame",
    browser: true,
    browserTestName:
      "browser: Export PNG downloads an artifact matching the previewed frame",
    componentType: "panelActions",
    evidence: "exported-bytes",
    expectedObservable:
      "Export PNG shows the sticky footer progress indicator and downloads an artifact that decodes at the selected format and resolution and shows the same device, pose and screenshot as the preview.",
    exportArtifactCoverage: [
      "all-required-image-export-behavior",
      "all-required-video-export-behavior",
    ],
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
      states: ["interaction", "playback", "steady"],
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
    // Not a viewport side effect: that evidence proves the workspace moved
    // while the output size held, which is the opposite of what this row
    // claims. Resizing the canvas changes the rendered frame, so the evidence
    // is the rendered frame changing, which is what "rendered-pixels" declares.
    evidence: "rendered-pixels",
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
