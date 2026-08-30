import {
  DEFAULT_LIGHT_PATTERN,
  LIGHT_PATTERN_OPTIONS,
} from "./product-domain";

/**
 * The light on the set: how many lamps, how hard, and where the key stands.
 *
 * Kept out of `app-schema.ts` for the same reason the colour slots and the
 * artwork are: that file was past the line budget generated app source is held
 * to, and a section is a self-contained thing the schema can name rather than
 * something it has to spell out.
 */

export const LIGHTS_SECTION = {
          controls: {
            keyIntensity: {
              applicability: { mode: "always" },
              defaultValue: 95,
              description:
                "The one shadow-casting light. A second caster reads as two suns, which is what gives a render away.",
              label: "Key",
              max: 400,
              min: 0,
              performanceReason:
                "Light intensity is a uniform; the shadow map is already allocated.",
              performanceRole: "responsiveness",
              sliderValueKind: "continuous",
              step: 5,
              target: "light.keyIntensity",
              type: "slider",
              unit: "%",
            },
            keyColor: {
              applicability: { mode: "always" },
              defaultValue: "#FFFFFF",
              description:
                "Warm the key towards tungsten or cool it towards daylight to sit the device in a room.",
              label: "Key color",
              performanceReason: "The key's colour is one uniform.",
              performanceRole: "responsiveness",
              target: "light.keyColor",
              type: "color",
            },
            fill: {
              applicability: { mode: "always" },
              defaultValue: 10,
              description:
                "Bounce from below, lifting the shadow side. It casts nothing, because bounce has no edge.",
              label: "Fill",
              max: 200,
              min: 0,
              performanceReason: "Fill is a hemisphere light with no shadow map.",
              performanceRole: "responsiveness",
              sliderValueKind: "continuous",
              step: 5,
              target: "light.fill",
              type: "slider",
              unit: "%",
            },
            rim: {
              applicability: { mode: "always" },
              defaultValue: 85,
              description:
                "A hard edge from behind that separates the device from the backdrop.",
              label: "Rim",
              max: 400,
              min: 0,
              performanceReason: "Rim is a second directional light with no shadow map.",
              performanceRole: "responsiveness",
              sliderValueKind: "continuous",
              step: 5,
              target: "light.rim",
              type: "slider",
              unit: "%",
            },
            shadowSoftness: {
              applicability: { mode: "always" },
              defaultValue: 34,
              description:
                "How wide the key's shadow spreads. This is the size of the light, told through the only thing that shows it: a bare bulb is a point and throws an edge you could cut around, a large softbox throws one that takes a hand's width to fade. Low is graphic and hard; high is the shadow you get on an overcast day.",
              label: "Shadow softness",
              max: 100,
              min: 0,
              performanceReason:
                "A blur radius, and below a third of the range a depth map twice the size that is only redrawn when the scene changes.",
              performanceRole: "responsiveness",
              sliderValueKind: "continuous",
              step: 2,
              target: "light.shadowSoftness",
              type: "slider",
              unit: "%",
            },
            pattern: {
              applicability: { mode: "always" },
              defaultValue: DEFAULT_LIGHT_PATTERN,
              description:
                "A cut-out held in front of the key, so what lands has a shape. Bars of shadow across a floor read as a window or a slatted blind without either being in the frame — it is the cheapest way to put the device somewhere rather than nowhere. The pattern falls around the device rather than across it.",
              label: "Pattern",
              options: LIGHT_PATTERN_OPTIONS,
              performanceReason:
                "A dozen invisible quads in the depth pass, which is redrawn on change rather than per frame.",
              performanceRole: "responsiveness",
              target: "light.pattern",
              type: "select",
            },
          },
          id: "lights",
          title: "Lights",
        } as const;

export const KEY_LIGHT_SECTION = {
          controls: {
            keyDirection: {
              applicability: { mode: "always" },
              defaultValue: { x: 0.44, y: -0.52 },
              description:
                "Where the key sits relative to the camera. Centre is straight on; move it off centre to rake the light across the device and lengthen the shadow.",
              label: false,
              performanceReason:
                "Moving the key repositions one light and redraws a frame.",
              performanceRole: "responsiveness",
              target: "light.keyDirection",
              type: "vector",
            },
          },
          id: "key-light-direction",
          title: "Key light direction",
        } as const;
