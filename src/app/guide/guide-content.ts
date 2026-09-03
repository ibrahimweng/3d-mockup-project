/**
 * What the help screen says.
 *
 * Kept as data rather than markup so it can be read, edited and checked
 * without touching a component, and so a test can hold it to the one rule that
 * matters: it is written for someone who has never used a 3D tool. No jargon,
 * no nouns from the codebase, every line short enough to read while looking at
 * something else.
 */

export type GuideStep = {
  /** What to do, in the imperative. */
  readonly action: string;
  /** Why, or what happens. One short sentence, or nothing. */
  readonly detail?: string;
  /**
   * The names in this step that the panel is supposed to be showing.
   *
   * Written down because prose cannot be checked and a name can. Each one has
   * to be a real tab, section title or control label in the schema, and each
   * one has to actually appear in the step's own words — so a renamed control
   * fails here rather than sending someone hunting for a heading that no
   * longer exists. It went wrong exactly that way once: the panel's studio
   * preset stopped being called Environment and this file went on saying it
   * was.
   */
  readonly names?: readonly string[];
};

export type GuideTopic = {
  readonly id: string;
  /** One line under the heading, saying what this section is for. */
  readonly blurb: string;
  readonly steps: readonly GuideStep[];
  readonly title: string;
};

export const guideTopics: readonly GuideTopic[] = [
  {
    blurb: "Three steps to a finished picture.",
    id: "start",
    steps: [
      {
        action: "Pick a device",
        detail: "The Device section, on the Product tab. Phone, laptop, watch, two desktops.",
        names: ["Product", "Device"],
      },
      {
        action: "Drop in your screenshot",
        detail: "Under Artwork, on the Design tab. It lands on the display straight away.",
        names: ["Artwork", "Design"],
      },
      {
        action: "Press Export PNG",
        detail: "At the very bottom of the panel. That is your image, saved.",
      },
    ],
    title: "Start here",
  },
  {
    blurb: "Everything on the canvas responds to dragging. What moves depends on where you start.",
    id: "moving",
    steps: [
      {
        action: "Drag the device's screen",
        detail: "Moves your screenshot around inside the display.",
      },
      {
        action: "Drag anywhere else on the device",
        detail: "Turns the device so you can see it from another side.",
      },
      {
        action: "Drag with the middle mouse button",
        detail: "Slides the whole picture around, like moving paper on a desk.",
      },
      {
        action: "Nothing moving?",
        detail: "You may be holding a key. Let go of Shift, Ctrl, Alt and Cmd and try again.",
      },
    ],
    title: "Moving things",
  },
  {
    blurb: "The fastest way to a good-looking shot is to start from one that already works.",
    id: "looks",
    steps: [
      {
        action: "Try the Preset list first",
        detail: "In Studio, on the Scene tab. One sets the whole lighting rig at once.",
        names: ["Preset", "Studio", "Scene"],
      },
      {
        action: "Change the colour under Finish",
        detail: "On the Product tab. Natural leaves the device exactly as its maker built it.",
        names: ["Finish", "Product"],
      },
      {
        action: "Stand it on something",
        detail: "Surface, on the Scene tab: stone, oak, steel or glass instead of empty space.",
        names: ["Surface", "Scene"],
      },
      {
        action: "Soften or sharpen the shadow",
        detail: "Shadow softness, under Lights. Low is hard and graphic; high is an overcast day.",
        names: ["Shadow softness", "Lights"],
      },
    ],
    title: "Making it look good",
  },
  {
    blurb: "A turning device, in one press.",
    id: "motion",
    steps: [
      {
        action: "Open the timeline",
        detail: "The bar under the picture. Click it to open it up.",
      },
      {
        action: "Press Turntable",
        detail: "That is the whole animation — one full, even turn.",
      },
      {
        action: "Press play to watch it",
        detail: "Drag along the bar to scrub to any moment.",
      },
      {
        action: "Change how long it takes",
        detail: "Type a new number into the time at the end of the bar.",
      },
    ],
    title: "Making it move",
  },
  {
    blurb: "A still image or a short video, at the size you need.",
    id: "export",
    steps: [
      {
        action: "Export PNG",
        detail: "A still picture. Choose 2K, 4K or 8K under Image Export, on the Output tab.",
        names: ["Image Export", "Output"],
      },
      {
        action: "Export Video",
        detail: "Your animation as a file. Set the format and size under Video Export.",
        names: ["Video Export"],
      },
      {
        action: "Want no background?",
        detail: "Turn Background off in Setup, above the tabs, then export as PNG.",
        names: ["Background", "Setup"],
      },
    ],
    title: "Saving your work",
  },
  {
    blurb: "You do not need these, but they are faster once you know them.",
    id: "shortcuts",
    steps: [
      { action: "Cmd K  ·  Ctrl K", detail: "Search everything. Describe what you want in plain words." },
      { action: "Space", detail: "Play or pause the animation." },
      { action: "Arrow keys", detail: "Nudge the device. Hold Shift to move further." },
      { action: "Cmd E  ·  Ctrl E", detail: "Export a PNG." },
      { action: "Cmd Z  ·  Ctrl Z", detail: "Undo. Add Shift to redo." },
    ],
    title: "Shortcuts",
  },
];

/** The three things a first-time visitor is shown, in order. */
export const firstRunSteps: readonly GuideStep[] = [
  { action: "Pick your device", detail: "Then drop a screenshot onto its display." },
  {
    action: "Choose a look",
    detail: "The Preset list in Studio lights the whole scene in one click.",
    names: ["Preset", "Studio"],
  },
  { action: "Export it", detail: "A PNG, or a turning video." },
];
