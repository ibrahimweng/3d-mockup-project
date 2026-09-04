import {
  DEFAULT_FINISH,
  DEFAULT_PART_COLORS,
  FINISH_OPTIONS,
} from "./product-domain";
import { COLOR_PART_DEVICES } from "./product-applicability";
import { onTab } from "./panel-tabs";

/**
 * What the product itself looks like, under whatever is printed on it.
 *
 * Kept out of `app-schema.ts` because that file is already past the line
 * budget generated app source is held to, and a section is a self-contained
 * thing the schema can name rather than something it has to spell out.
 */
export const PRODUCT_PARTS_SECTION = {
          controls: {
            /**
             * A finish is a colourway, which is the same decision as the three
             * colours below it.
             *
             * It sat with the model for a while, on the argument that a finish
             * is meaningless without the thing it repaints. True, and the same
             * is true of every colour here. What settled it is what a person is
             * doing: choosing what the product looks like, in one place,
             * instead of setting a colourway in one section and a collar rib in
             * another.
             *
             * It also happens to be what makes the colours legible. A section
             * holding nothing but colour fields is drawn as a colour bank and
             * the runtime suppresses every label in it — right for a palette of
             * swatches, wrong here, where a shirt showed one unlabelled colour
             * and nothing said it was the collar. One control that is not a
             * colour, and each part is named again. That was the trigger for
             * looking; the reason above is why it stayed.
             */
            finish: {
              applicability: { mode: "always" },
              defaultValue: DEFAULT_FINISH,
              description:
                "Repaints the device's own body materials. Natural is the model exactly as its author built it; the rest keep the same brushed or polished surface and change only its colour.",
              label: "Finish",
              options: FINISH_OPTIONS,
              performanceReason:
                "A finish rewrites base colours on the loaded model; it does not re-decode geometry or re-convolve the environment.",
              performanceRole: "responsiveness",
              semanticGroup: "surface",
              target: "device.finish",
              type: "select",
            },
            /**
             * Three slots rather than a named control per part.
             *
             * Schema controls are static and a section holds ten, so a control
             * per part would need one for a shirt's sleeves, one for a bottle's
             * cap and one for a folder's pen, and run out before the catalog
             * did. Three slots that mean the same thing on every product fit,
             * and each product maps them onto its own materials exactly as a
             * colourway does.
             *
             * Every one of them is conditional on the product declaring that
             * slot, so a device — which carries named colourways instead —
             * sees none of the three, and a product with one part shows one
             * picker rather than three, two of which would do nothing.
             */
            main: {
              applicability: {
                all: [{ oneOf: COLOR_PART_DEVICES.main, target: "device.model" }],
                mode: "conditional",
              },
              defaultValue: DEFAULT_PART_COLORS.main,
              description:
                "The largest part a design does not print on: a bottle's cap, a card's edge, the board a folder is built on, a tote's handles.",
              label: "Product",
              performanceReason:
                "Writing one material's base colour repaints in place and redraws a single frame; nothing is rebuilt.",
              performanceRole: "responsiveness",
              semanticGroup: "surface",
              target: "product.color.main",
              type: "color",
            },
            trim: {
              applicability: {
                all: [{ oneOf: COLOR_PART_DEVICES.trim, target: "device.model" }],
                mode: "conditional",
              },
              defaultValue: DEFAULT_PART_COLORS.trim,
              description:
                "The part set against the main surface: the ring under a bottle's cap, a tote's base, the board behind a folder's pad.",
              label: "Trim",
              performanceReason:
                "Writing one material's base colour repaints in place and redraws a single frame; nothing is rebuilt.",
              performanceRole: "responsiveness",
              semanticGroup: "surface",
              target: "product.color.trim",
              type: "color",
            },
            accent: {
              applicability: {
                all: [
                  { oneOf: COLOR_PART_DEVICES.accent, target: "device.model" },
                ],
                mode: "conditional",
              },
              defaultValue: DEFAULT_PART_COLORS.accent,
              description:
                "The smallest named part: a collar rib, a cap's latch, a folder's clip.",
              label: "Accent",
              performanceReason:
                "Writing one material's base colour repaints in place and redraws a single frame; nothing is rebuilt.",
              performanceRole: "responsiveness",
              semanticGroup: "surface",
              target: "product.color.accent",
              type: "color",
            },
          },
          id: "product-parts",
          title: "Appearance",
          visibleWhen: onTab("product"),
        } as const;
