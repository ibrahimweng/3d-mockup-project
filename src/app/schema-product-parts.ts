import { DEFAULT_PART_COLORS } from "./product-domain";
import { COLOR_PART_DEVICES } from "./product-applicability";

/**
 * The colour slots a merchandise product offers.
 *
 * Kept out of `app-schema.ts` because that file is already past the line
 * budget generated app source is held to, and a section is a self-contained
 * thing the schema can name rather than something it has to spell out.
 */
export const PRODUCT_PARTS_SECTION = {
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
           * slot, so a device — which carries named colourways instead — sees
           * none of this, and a product with one part shows one picker rather
           * than three, two of which would do nothing.
           */
          controls: {
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
              target: "product.color.accent",
              type: "color",
            },
          },
          id: "product-parts",
          title: "Parts",
        } as const;
