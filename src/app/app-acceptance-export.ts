import type { ToolcraftComponentAcceptance } from "./acceptance/types";

/**
 * Writing the picture out: the two file formats, their sizes, and the shutter.
 *
 * Split from `app-acceptance-output.ts` for the reason that file already names
 * in its own comment about the schema: it went past the line budget generated
 * app source is held to when the two motion blur entries were added, and a
 * group of entries about one subject is a thing this module can be rather than
 * something the larger one has to carry. Every entry here is about the file
 * that leaves, which is what makes them one group and not an arbitrary cut.
 */
export const exportAcceptance: readonly ToolcraftComponentAcceptance[] = [
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
      "Exporting as MP4 downloads a file that decodes as MP4; exporting as WebM downloads one that decodes as WebM. Both run for the timeline's duration and carry one packet per frame of the chosen rate.",
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
    automatedTestName:
      "the shutter follows the frame rate, because a shutter is part of a frame",
    browser: true,
    browserTestName:
      "browser: sixty frames a second writes twice the frames and holds the loop's length",
    componentType: "select",
    evidence: "product-output",
    expectedObservable:
      "At 60 fps a six second loop is encoded as three hundred and sixty frames instead of a hundred and eighty, and the file still runs six seconds \u2014 so a slow camera move travels where at 30 it stepped. The shutter follows: the same shutter angle is half the smear at 60, because a shutter is a fraction of a frame. Twice the frames is roughly twice the render time and twice the file.",
    fixture: "the default device with a camera arc keyed across the loop",
    id: "video-export.frameRate",
    kind: "control",
    optionCoverage: ["30", "60"],
    target: "export.video.frameRate",
    userAction: "Choose each Frame rate option and run Export Video.",
  },
  {
    automated: true,
    automatedTestName: "the sample opacities average the shutter rather than trailing it",
    browser: true,
    browserTestName:
      "browser: motion blur softens a frame that is moving and leaves a still one sharp",
    componentType: "switch",
    evidence: "product-output",
    expectedObservable:
      "Off, every exported frame is a single sharp instant, so a fast turn reads as a stack of stills played quickly. On, a frame drawn while something is moving is smeared across the slice of time it stands for, the way a camera's shutter records it, and the exported file has visibly softer edges on the moving product. A frame where nothing moves is identical either way, and costs the same.",
    fixture: "the default device with Spin keyframed a full turn",
    id: "video-export.motionBlur",
    kind: "control",
    target: "export.video.motionBlur",
    userAction:
      "Switch Motion blur on, scrub to a moment mid-turn, and export.",
  },
  {
    automated: true,
    automatedTestName: "a shutter angle is a fraction of the frame it opens for",
    browser: true,
    browserTestName:
      "browser: motion blur softens a frame that is moving and leaves a still one sharp",
    componentType: "select",
    evidence: "product-output",
    expectedObservable:
      "How much of each frame the shutter is open for. 360 degrees smears a moving frame across the whole of the time it stands for; 180, the film convention, across half of it; smaller angles are crisper and more strobed. It only appears while Motion blur is on, because it has nothing to describe otherwise.",
    fixture: "the default device with Spin keyframed a full turn",
    id: "video-export.shutterAngle",
    kind: "control",
    optionCoverage: "each-visible-item",
    target: "export.video.shutterAngle",
    userAction:
      "With Motion blur on, choose each Shutter angle and export a frame mid-turn.",
  },
];
