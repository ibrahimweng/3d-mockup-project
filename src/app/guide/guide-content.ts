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
        detail: "Top of the panel on the right. Phone, laptop, watch, and two desktops.",
      },
      {
        action: "Drop in your screenshot",
        detail: "Under Screenshot. It lands on the device's display straight away.",
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
        action: "Try the Environment presets first",
        detail: "In Studio. Each one sets the whole lighting rig at once — start there, then adjust.",
      },
      {
        action: "Change the colour under Finish",
        detail: "Natural leaves the device exactly as its maker built it.",
      },
      {
        action: "Stand it on something",
        detail: "Surface gives you stone, oak, steel or glass instead of empty space.",
      },
      {
        action: "Soften or sharpen the shadow",
        detail: "Shadow softness. Low is hard and graphic; high is an overcast day.",
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
        detail: "A still picture. Choose 2K, 4K or 8K under Image Export.",
      },
      {
        action: "Export Video",
        detail: "Your animation as a file. Set the format and size under Video Export.",
      },
      {
        action: "Want no background?",
        detail: "Turn Background off at the top of the panel, then export as PNG.",
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
  { action: "Choose a look", detail: "The Environment presets light the whole scene in one click." },
  { action: "Export it", detail: "A PNG, or a turning video." },
];
