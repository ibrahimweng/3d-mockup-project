import { ARTWORK_ZONE_DEVICES } from "./product-applicability";

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
      accept: "image/png,image/jpeg,image/webp",
      applicability: { mode: "always" },
      assetKind: "image",
      defaultValue: null,
      description:
        "The picture on the front. A device shows it on the display; a product prints it on the panel facing the camera, at the proportions its template gives.",
      label: false,
      multiple: false,
      performanceReason:
        "The screenshot is decoded once into a texture and swapped onto the display material; it does not affect per-frame cost.",
      performanceRole: "responsiveness",
      target: "artwork.image",
      type: "fileDrop",
    },
    imageBack: {
      accept: "image/png,image/jpeg,image/webp",
      applicability: {
        all: [{ oneOf: ARTWORK_ZONE_DEVICES.back, target: "device.model" }],
        mode: "conditional",
      },
      assetKind: "image",
      defaultValue: null,
      description: "The picture on the back. A shirt's back panel, a tote's far side, the reverse of a card.",
      label: "Back",
      multiple: false,
      performanceReason:
        "The image is decoded once into a texture and swapped onto that zone's material; it does not affect per-frame cost.",
      performanceRole: "responsiveness",
      target: "artwork.imageBack",
      type: "fileDrop",
    },
    imageLeft: {
      accept: "image/png,image/jpeg,image/webp",
      applicability: {
        all: [{ oneOf: ARTWORK_ZONE_DEVICES.left, target: "device.model" }],
        mode: "conditional",
      },
      assetKind: "image",
      defaultValue: null,
      description: "The picture on the left, seen from the front: a shirt's left sleeve, a tote's left side.",
      label: "Left",
      multiple: false,
      performanceReason:
        "The image is decoded once into a texture and swapped onto that zone's material; it does not affect per-frame cost.",
      performanceRole: "responsiveness",
      target: "artwork.imageLeft",
      type: "fileDrop",
    },
    imageRight: {
      accept: "image/png,image/jpeg,image/webp",
      applicability: {
        all: [{ oneOf: ARTWORK_ZONE_DEVICES.right, target: "device.model" }],
        mode: "conditional",
      },
      assetKind: "image",
      defaultValue: null,
      description: "The picture on the right, seen from the front: a shirt's right sleeve, a tote's right side.",
      label: "Right",
      multiple: false,
      performanceReason:
        "The image is decoded once into a texture and swapped onto that zone's material; it does not affect per-frame cost.",
      performanceRole: "responsiveness",
      target: "artwork.imageRight",
      type: "fileDrop",
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
      target: "artwork.stretch",
      type: "vector",
    },
  },
  id: "artwork",
  title: "Screenshot",
} as const;
