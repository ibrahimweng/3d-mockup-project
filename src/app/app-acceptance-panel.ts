import type { ToolcraftComponentAcceptance } from "./acceptance/types";

/**
 * The panel itself: what it shows, rather than what it sets.
 *
 * Every other acceptance row describes something the renderer does with a
 * value. These describe what the person looking at the panel can see, which is
 * a different claim and belongs in a file that says so.
 */
export const panelAcceptance: readonly ToolcraftComponentAcceptance[] = [
  {
    automated: true,
    automatedTestName:
      "every product section names one tab and every tab owns sections",
    browser: true,
    browserTestName:
      "browser: each panel tab replaces the sections shown beneath it",
    componentType: "tabs",
    evidence: "command-side-effect",
    expectedObservable:
      "The panel shows Setup, the tab bar, and only the sections belonging to the chosen tab: Product shows Device and Parts, Design shows the design and the templates and how it meets the product, Scene shows the studio, the lights, the camera and the set, and Output shows the image and video settings. Export PNG and Export Video stay at the foot of the panel on every tab, and switching tabs changes nothing on the canvas.",
    fixture: "the default device with a design uploaded",
    id: "view.tab.sections",
    kind: "control",
    optionCoverage: "each-visible-item",
    target: "view.tab",
    userAction:
      "Choose each tab in turn and read which sections the panel lists.",
  },
];
