import {
  defineToolcraft,
  type ToolcraftControlSchema,
} from "@/toolcraft/runtime";
import { describe, expect, it } from "vitest";

import { getToolcraftControlSectionInvariantErrors } from "./acceptance/control-layout";

function makeMixedColorSchema(includeSemanticGroups: boolean) {
  const withSemanticGroup = (
    semanticGroup: string,
  ): { semanticGroup: string } | Record<string, never> =>
    includeSemanticGroups ? { semanticGroup } : {};

  return defineToolcraft({
    canvas: { enabled: true },
    panels: {
      controls: {
        sections: [
          {
            controls: {
              trackEnabled: {
                defaultValue: true,
                label: "Track",
                target: "track.enabled",
                type: "switch",
              },
              trackColor: {
                ...withSemanticGroup("track-line"),
                defaultValue: { hex: "#F1F1F1" },
                label: "Track color",
                target: "track.color",
                type: "color",
              },
              lowerColor: {
                ...withSemanticGroup("track-range"),
                defaultValue: { hex: "#7A9CBD" },
                label: "Lower",
                target: "track.lower",
                type: "color",
              },
              upperColor: {
                ...withSemanticGroup("track-range"),
                defaultValue: { hex: "#52AAFF" },
                label: "Upper",
                target: "track.upper",
                type: "color",
              },
            },
            id: "track-appearance",
            title: "Track Appearance",
          },
        ],
        title: "Controls",
      },
    },
  });
}

/**
 * A section of nothing but colours, which the runtime draws as a bank.
 *
 * `companion` is what the section holds besides the colours: nothing at all,
 * a control that is always there, or one that comes and goes with the product.
 * `labelled` is whether the colours claim names — a bank draws none, so a
 * claimed name is a name the person never sees.
 */
function makeColorOnlySchema({
  companion = "none",
  labelled = true,
}: {
  companion?: "none" | "always" | "conditional";
  labelled?: boolean;
} = {}) {
  const name = (label: string): { label: string | false } => ({
    label: labelled ? label : false,
  });
  const companionControl: Record<string, ToolcraftControlSchema> =
    companion === "none"
      ? {}
      : {
          trackStyle: {
            ...(companion === "conditional"
              ? {
                  applicability: {
                    all: [{ equals: "line", target: "track.kind" }],
                    mode: "conditional" as const,
                  },
                }
              : {}),
            defaultValue: "solid",
            label: "Style",
            options: [
              { label: "Solid", value: "solid" },
              { label: "Dashed", value: "dashed" },
            ],
            semanticGroup: "track-line",
            target: "track.style",
            type: "select",
          },
        };

  return defineToolcraft({
    canvas: { enabled: true },
    panels: {
      controls: {
        sections: [
          {
            controls: {
              ...companionControl,
              trackColor: {
                ...name("Track"),
                defaultValue: { hex: "#F1F1F1" },
                semanticGroup: "track-line",
                target: "track.color",
                type: "color",
              },
              lowerColor: {
                ...name("Lower"),
                defaultValue: { hex: "#7A9CBD" },
                semanticGroup: "track-range",
                target: "track.lower",
                type: "color",
              },
              upperColor: {
                ...name("Upper"),
                defaultValue: { hex: "#52AAFF" },
                semanticGroup: "track-range",
                target: "track.upper",
                type: "color",
              },
            },
            id: "track-palette",
            title: "Track Palette",
          },
        ],
        title: "Controls",
      },
    },
  });
}

const anonymousBank = expect.stringContaining(
  "renders as a color bank, which draws no per-swatch labels",
);

describe("starter acceptance semantic color rows", () => {
  it("rejects ambiguous plain colors in a mixed section", () => {
    expect(
      getToolcraftControlSectionInvariantErrors(makeMixedColorSchema(false)),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "must declare semanticGroup for every plain Color",
        ),
      ]),
    );
  });

  it("accepts explicit color banks in a mixed section", () => {
    expect(
      getToolcraftControlSectionInvariantErrors(makeMixedColorSchema(true)),
    ).toEqual([]);
  });

  it("keeps a color-only section as one implicit bank", () => {
    expect(
      getToolcraftControlSectionInvariantErrors(
        makeColorOnlySchema({ labelled: false }),
      ),
    ).toEqual([]);
  });
});

/**
 * The defect this rule exists for: `Parts` named its three colours Product,
 * Trim and Accent, the section held nothing else, and the runtime dropped
 * every one of those names. A shirt showed three unlabelled squares and
 * nothing said which was the collar.
 */
describe("starter acceptance color banks that claim names", () => {
  it("rejects labelled colors in a section that holds only colors", () => {
    expect(getToolcraftControlSectionInvariantErrors(makeColorOnlySchema())).toEqual(
      expect.arrayContaining([anonymousBank]),
    );
  });

  it("accepts them once an always-present control takes the section out of bank layout", () => {
    expect(
      getToolcraftControlSectionInvariantErrors(
        makeColorOnlySchema({ companion: "always" }),
      ),
    ).toEqual([]);
  });

  it("still rejects them when the only other control comes and goes", () => {
    expect(
      getToolcraftControlSectionInvariantErrors(
        makeColorOnlySchema({ companion: "conditional" }),
      ),
    ).toEqual(expect.arrayContaining([anonymousBank]));
  });
});
