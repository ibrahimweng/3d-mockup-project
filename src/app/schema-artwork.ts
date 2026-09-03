import {
  ALL_OVER_DEVICES,
  ARTWORK_TEMPLATE_DEVICES,
  ARTWORK_ZONE_DEVICES,
  PRINT_DEVICES,
} from "./product-applicability";
import { DEFAULT_ARTWORK_BACKGROUND } from "./product-domain";
import { onTab } from "./panel-tabs";

/**
 * The design, and the four places it can land.
 *
 * Kept out of `app-schema.ts` for the same reason the colour slots are: that
 * file is past the line budget generated app source is held to, and a section
 * is a self-contained thing the schema can name rather than something it has
 * to spell out.
 *
 * Four uploaders rather than one, and only the first is unconditional. A
 * device has one surface a picture can go on, so it sees one drop zone with no
 * label — the section title is the label. A product that declares more zones
 * sees a labelled uploader for each, and a product with two sees two.
 * Which slots exist is read off the catalog rather than listed here, so
 * declaring a zone is the single act that offers its upload.
 */
export const ARTWORK_SECTION = {
  controls: {
    image: {
      accept: "image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm",
      applicability: { mode: "always" },
      assetKind: "image",
      defaultValue: null,
      description:
        "The picture on the front. A device shows it on the display; a product prints it on the panel facing the camera, at the proportions its template gives.",
      label: false,
      multiple: false,
      performanceReason:
        "A still is decoded once into a texture and swapped onto the material, costing nothing per frame. A GIF or a video costs one frame decode and one blit whenever the timeline reaches a new frame of it, and nothing on the frames in between.",
      performanceRole: "responsiveness",
      semanticGroup: "design",
      target: "artwork.image",
      type: "fileDrop",
    },
    imageBack: {
      accept: "image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm",
      applicability: {
        all: [
          { oneOf: ARTWORK_ZONE_DEVICES.back, target: "device.model" },
          // Nothing to put here while one design is covering the whole
          // product: this slot would be an upload with no surface left to
          // land on.
          { notEquals: true, target: "artwork.allOver" },
        ],
        mode: "conditional",
      },
      assetKind: "image",
      defaultValue: null,
      description: "The picture on the back. A shirt's back panel, a tote's far side, the reverse of a card.",
      label: "Back",
      multiple: false,
      performanceReason:
        "A still is decoded once into a texture and swapped onto that zone's material, costing nothing per frame. A GIF or a video costs one frame decode and one blit whenever the timeline reaches a new frame of it.",
      performanceRole: "responsiveness",
      semanticGroup: "design",
      target: "artwork.imageBack",
      type: "fileDrop",
    },
    imageLeft: {
      accept: "image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm",
      applicability: {
        all: [
          { oneOf: ARTWORK_ZONE_DEVICES.left, target: "device.model" },
          // Nothing to put here while one design is covering the whole
          // product: this slot would be an upload with no surface left to
          // land on.
          { notEquals: true, target: "artwork.allOver" },
        ],
        mode: "conditional",
      },
      assetKind: "image",
      defaultValue: null,
      description: "The picture on the left, seen from the front: a shirt's left sleeve, a tote's left side.",
      label: "Left",
      multiple: false,
      performanceReason:
        "A still is decoded once into a texture and swapped onto that zone's material, costing nothing per frame. A GIF or a video costs one frame decode and one blit whenever the timeline reaches a new frame of it.",
      performanceRole: "responsiveness",
      semanticGroup: "design",
      target: "artwork.imageLeft",
      type: "fileDrop",
    },
    imageRight: {
      accept: "image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm",
      applicability: {
        all: [
          { oneOf: ARTWORK_ZONE_DEVICES.right, target: "device.model" },
          // Nothing to put here while one design is covering the whole
          // product: this slot would be an upload with no surface left to
          // land on.
          { notEquals: true, target: "artwork.allOver" },
        ],
        mode: "conditional",
      },
      assetKind: "image",
      defaultValue: null,
      description: "The picture on the right, seen from the front: a shirt's right sleeve, a tote's right side.",
      label: "Right",
      multiple: false,
      performanceReason:
        "A still is decoded once into a texture and swapped onto that zone's material, costing nothing per frame. A GIF or a video costs one frame decode and one blit whenever the timeline reaches a new frame of it.",
      performanceRole: "responsiveness",
      semanticGroup: "design",
      target: "artwork.imageRight",
      type: "fileDrop",
    },
    allOver: {
      applicability: {
        all: [{ oneOf: ALL_OVER_DEVICES, target: "device.model" }],
        mode: "conditional",
      },
      defaultValue: false,
      description:
        "Print the front design across every panel at one size, the way cloth is printed before it is cut, rather than placing it on the front alone. The other slots stand down while this is on: there is one design and it is everywhere. A repeating pattern is what this is for \u2014 a design with a top and a bottom will be tiled like one.",
      label: "All-over print",
      performanceReason:
        "Each panel takes a copy of the front design that shares its picture in memory, and the copy is rebuilt only when the design changes. Turning it on writes a repeat per panel and redraws one frame.",
      performanceRole: "responsiveness",
      semanticGroup: "coverage",
      target: "artwork.allOver",
      type: "switch",
    },
    repeats: {
      applicability: {
        all: [
          { oneOf: ALL_OVER_DEVICES, target: "device.model" },
          { equals: true, target: "artwork.allOver" },
        ],
        mode: "conditional",
      },
      defaultValue: 3,
      description:
        "How many times the design repeats across the front. Every other panel takes the same size rather than the same count, which is what makes the sleeve and the back read as one piece of cloth: a narrow panel simply holds fewer of them.",
      label: "Repeat",
      max: 12,
      min: 1,
      performanceReason:
        "Writes one number onto each panel's texture and redraws one frame; nothing is decoded or rebuilt.",
      performanceRole: "responsiveness",
      sliderValueKind: "continuous",
      step: 0.5,
      semanticGroup: "coverage",
      target: "artwork.repeats",
      type: "slider",
    },
    background: {
      applicability: {
        all: [{ oneOf: PRINT_DEVICES, target: "device.model" }],
        mode: "conditional",
      },
      defaultValue: DEFAULT_ARTWORK_BACKGROUND,
      description:
        "What a design is printed on where the design is transparent. A print file is a mark on nothing, so this is the colour that shows through it \u2014 the shirt behind a logo. On a garment it is the cloth, so it covers the hem, the cuffs and the sleeve heads with the panels; on a product whose unprinted parts are something else, those keep their own colours.",
      label: "Print background",
      performanceReason:
        "The colour is composited under the design once when the image is decoded; nothing is rebuilt and no frame costs more.",
      performanceRole: "responsiveness",
      semanticGroup: "stock",
      target: "artwork.background",
      type: "color",
    },
    offset: {
      applicability: { mode: "always" },
      defaultValue: { x: 0, y: 0 },
      description:
        "Slides the image behind the screen. Only has an effect once the image is larger than the display and something is being cropped.",
      label: "Position",
      performanceReason:
        "Position writes the display texture's offset and redraws one frame.",
      performanceRole: "responsiveness",
      semanticGroup: "placement",
      target: "artwork.offset",
      type: "vector",
    },
    stretch: {
      applicability: { mode: "always" },
      defaultValue: { x: 0, y: 0 },
      description:
        "Independent width and height. Centre is unstretched; moving an axis squashes or extends the image along it.",
      label: "Stretch",
      performanceReason:
        "Stretch writes the display texture's repeat and redraws one frame.",
      performanceRole: "responsiveness",
      semanticGroup: "placement",
      target: "artwork.stretch",
      type: "vector",
    },
  },
  id: "artwork",
  /**
   * Declared rather than inferred, because this section holds both kinds.
   *
   * The uploaders and the pads are standalone controls and the all-over switch
   * and its repeat are grouped ones, and a section holding both is cut into
   * unlabelled fragments -- three of them here. The switch cannot simply move
   * out: it gates the three uploaders above it, and a gate belongs in the
   * section it gates, which is a rule of the framework and also the only
   * arrangement that reads. So the section says what it is instead.
   */
  layout: "standalone",
  title: "Artwork",
  visibleWhen: onTab("design"),
} as const;

/**
 * The reference sheet for the uploaders above it.
 *
 * Its own section because the actions control is grouped-layout and the
 * uploaders and pads are standalone: mixing the two in one section makes the
 * runtime cut it into unlabelled fragments, which is what the schema test
 * that caught this exists to prevent.
 *
 * Not in the delivery footer either, though that is where the framework puts
 * download actions. That footer is the product coming out — Export PNG,
 * Export Video — and this is the thing you draw over before a design goes in.
 * Sitting it under the slots it belongs to is worth more than sitting it
 * beside the other button with an arrow on it.
 */
export const ARTWORK_TEMPLATES_SECTION = {
  controls: {
    templates: {
      actions: [
        { icon: "download", label: "Download", value: "download-templates" },
      ],
      applicability: {
        all: [{ oneOf: ARTWORK_TEMPLATE_DEVICES, target: "device.model" }],
        mode: "conditional",
      },
      description:
        "The placeholder each zone ships with, at the exact size and orientation its unwrap expects. A design drawn over one lands where it was drawn. Several zones arrive as a zip.",
      label: false,
      performanceReason:
        "Reads files already served beside the models and hands them to the browser; nothing is rendered or rebuilt.",
      performanceRole: "responsiveness",
      target: "artwork.templates",
      type: "actions",
    },
  },
  id: "artwork-templates",
  title: "Templates",
  visibleWhen: onTab("design"),
} as const;
